
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useCurrency } from "@/context/CurrencyContext.jsx";
import { FetchPriceTimeline } from "@/integrations/Core.js";

const niceNumber = (range, round) => {
  if (!Number.isFinite(range) || range <= 0) {
    return 0;
  }
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / 10 ** exponent;
  let niceFraction;
  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else {
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
  }
  return niceFraction * 10 ** exponent;
};

const computeNiceScale = (minValue, maxValue, maxTickCount = 6) => {
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    return { domain: [0, 1], ticks: [0, 1], step: 1 };
  }
  if (maxValue < minValue) {
    const temp = maxValue;
    maxValue = minValue;
    minValue = temp;
  }
  if (maxValue === minValue) {
    const adjustment = Math.abs(maxValue) * 0.05 || 1;
    minValue = Math.max(0, minValue - adjustment);
    maxValue = maxValue + adjustment;
  }
  const range = maxValue - minValue;
  const niceRange = niceNumber(range, false) || range || 1;
  let step = niceNumber(niceRange / Math.max(1, maxTickCount - 1), true) || niceRange;
  if (!Number.isFinite(step) || step <= 0) {
    step = niceRange || 1;
  }
  let tickMin = Math.floor(minValue / step) * step;
  let tickMax = Math.ceil(maxValue / step) * step;
  if (tickMin < 0) tickMin = 0;
  if (tickMax <= tickMin) tickMax = tickMin + step;
  const ticks = [];
  for (let value = tickMin; value <= tickMax + step * 0.5; value += step) {
    ticks.push(Number(value.toFixed(6)));
  }
  if (ticks.length === 0) {
    ticks.push(tickMin, tickMax);
  }
  return { domain: [tickMin, tickMax], ticks, step };
};

const determineFractionDigits = (step) => {
  if (!Number.isFinite(step) || step <= 0) {
    return 0;
  }
  const absStep = Math.abs(step);
  if (absStep >= 1) return 0;
  if (absStep >= 0.1) return 1;
  if (absStep >= 0.01) return 2;
  if (absStep >= 0.001) return 3;
  return 4;
};

const timelineOptions = ["1D", "1W", "1M", "3M", "YTD", "1Y", "5Y", "All"];
export default function PerformanceChart({ assets, totalValue, isLoading, setPerformanceSign = () => {}, totalDayChange }) {
  const { format, convert, currency, symbol } = useCurrency();
  const [activeTimeline, setActiveTimeline] = useState("1D");
  const [hoverData, setHoverData] = useState(null);

  const [timelineSources, setTimelineSources] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState(null);
  const timelineCacheRef = useRef(new Map());
  const [isSyncComplete, setIsSyncComplete] = useState(false);
  const [expectedSymbols, setExpectedSymbols] = useState(0);

  const syntheticSeriesUSD = useMemo(() => {
    if (isLoading || !assets || assets.length === 0) {
      return [];
    }

    const generateData = (days, stepDays) => {
      const points = [];
      let changeForPeriod = 0;

      if (activeTimeline === "1D") {
        changeForPeriod = totalDayChange || 0;
      } else {
        changeForPeriod = assets.reduce((sum, asset) => sum + (asset.gain_loss || 0), 0);
      }

      const startValue = Math.max(0, Number(totalValue) - changeForPeriod);
      const safeStart = Number.isFinite(startValue) ? startValue : 0;
      const totalNumeric = Number(totalValue) || 0;
      const trendPerDay = days > 0 ? (totalNumeric - safeStart) / days : 0;
      const now = new Date();
      const steps = Math.max(2, Math.ceil(days / stepDays));

      for (let index = 0; index < steps; index += 1) {
        const progress = steps <= 1 ? 1 : index / (steps - 1);
        const date = new Date(now.getTime() - (days * (1 - progress)) * 24 * 60 * 60 * 1000);

        let value;
        if (index === 0) {
          value = safeStart;
        } else {
          const volatilityFactor = 0.015;
          const noise = (Math.random() - 0.5) * volatilityFactor * safeStart;
          value = Math.max(0, safeStart + trendPerDay * (days * progress) + noise);
        }

        points.push({
          date,
          value: Number.isFinite(value) ? Number(value.toFixed(2)) : 0,
        });
      }

      if (points.length > 0) {
        points[points.length - 1] = { date: new Date(), value: Number(totalNumeric.toFixed(2)) || 0 };
      }

      return points;
    };

    switch (activeTimeline) {
      case "1D":
        return generateData(1, 1 / 24);
      case "1W":
        return generateData(7, 1);
      case "1M":
        return generateData(30, 2);
      case "3M":
        return generateData(90, 3);
      case "YTD": {
        const startOfYear = new Date(new Date().getFullYear(), 0, 1);
        const today = new Date();
        const daysSinceYTD = Math.max(1, Math.floor((today - startOfYear) / (1000 * 60 * 60 * 24)));
        return generateData(daysSinceYTD, Math.max(1, Math.ceil(daysSinceYTD / 30)));
      }
      case "1Y":
        return generateData(365, 7);
      case "5Y":
        return generateData(365 * 5, 30);
      case "All":
        return generateData(365 * 2, 30);
      default:
        return generateData(30, 2);
    }
  }, [activeTimeline, assets, isLoading, totalDayChange, totalValue]);

  useEffect(() => {
    let cancelled = false;
    setIsSyncComplete(false);
    setExpectedSymbols(0);

    const load = async () => {
      if (isLoading) {
        if (!cancelled) {
          setTimelineLoading(true);
        }
        return;
      }

      if (!assets || assets.length === 0) {
        if (!cancelled) {
          setTimelineSources([]);
          setTimelineError(null);
          setTimelineLoading(false);
          setExpectedSymbols(0);
          setIsSyncComplete(true);
        }
        return;
      }

      const timelineKey = activeTimeline.toUpperCase();
      const buckets = [];
      const bucketMap = new Map();

      assets.forEach((asset) => {
        const symbol = String(asset?.symbol || '').trim().toUpperCase();
        const quantity = Number(asset?.quantity) || 0;
        if (!symbol || !Number.isFinite(quantity) || quantity <= 0) {
          return;
        }
        let bucket = bucketMap.get(symbol);
        if (!bucket) {
          bucket = {
            symbol,
            cacheKey: `${timelineKey}:${symbol}`,
            totalQuantity: 0,
            assets: [],
            primaryAsset: asset,
          };
          bucketMap.set(symbol, bucket);
          buckets.push(bucket);
        }
        bucket.totalQuantity += quantity;
        bucket.assets.push(asset);
      });

      if (!cancelled) {
        setExpectedSymbols(buckets.length);
      }

      if (buckets.length === 0) {
        if (!cancelled) {
          setTimelineSources([]);
          setTimelineError(null);
          setTimelineLoading(false);
          setIsSyncComplete(true);
        }
        return;
      }

      const cachedCharts = new Map();
      const assetsToFetch = [];

      buckets.forEach((bucket) => {
        const cached = timelineCacheRef.current.get(bucket.cacheKey);
        if (cached) {
          cachedCharts.set(bucket.symbol, cached);
        } else {
          assetsToFetch.push(bucket);
        }
      });

      if (!cancelled) {
        const partialSources = buckets
          .map((bucket) => {
            const cachedChart = cachedCharts.get(bucket.symbol);
            if (!cachedChart) {
              return null;
            }
            return {
              symbol: bucket.symbol,
              chart: cachedChart,
              totalQuantity: bucket.totalQuantity,
              primaryAsset: bucket.primaryAsset,
              assets: bucket.assets,
            };
          })
          .filter(Boolean);
        setTimelineSources(partialSources);
        setTimelineError(null);
      }

      if (assetsToFetch.length === 0) {
        if (!cancelled) {
          setTimelineLoading(false);
          setIsSyncComplete(true);
        }
        return;
      }

      if (!cancelled) {
        setTimelineLoading(true);
      }

      const results = await Promise.all(
        assetsToFetch.map(async (bucket) => {
          try {
            const chart = await FetchPriceTimeline({ symbol: bucket.symbol, timeline: timelineKey });
            const sanitizedSeries = Array.isArray(chart?.series)
              ? chart.series.filter((point) => {
                  const close = Number(point?.close ?? point?.value ?? point?.price);
                  return Number.isFinite(close) && close > 0;
                })
              : [];

            if (sanitizedSeries.length === 0) {
              return { bucket, error: new Error('No valid price points returned.') };
            }

            const assetPrice = Number(bucket.primaryAsset?.current_price);
            const lastClose = Number(sanitizedSeries[sanitizedSeries.length - 1]?.close);
            let scale = 1;
            if (Number.isFinite(assetPrice) && assetPrice > 0 && Number.isFinite(lastClose) && lastClose > 0) {
              const computedScale = assetPrice / lastClose;
              if (Number.isFinite(computedScale) && computedScale > 0) {
                scale = computedScale;
              }
            }

            const adjustedSeries = sanitizedSeries.map((point) => {
              const rawClose = Number(point?.close ?? point?.value ?? point?.price);
              const scaled = Number.isFinite(rawClose) ? rawClose * scale : rawClose;
              return {
                ...point,
                close: Number.isFinite(scaled) ? Number(scaled.toFixed(6)) : scaled,
              };
            });

            const chartCurrency = String(chart?.currency || bucket.primaryAsset?.currency || 'USD').toUpperCase();
            const adjustedChart = {
              ...chart,
              currency: chartCurrency,
              series: adjustedSeries,
            };
            timelineCacheRef.current.set(bucket.cacheKey, adjustedChart);
            return { bucket, chart: adjustedChart };
          } catch (error) {
            return { bucket, error };
          }
        }),
      );

      if (cancelled) {
        return;
      }

      const resultMap = new Map();
      const failures = [];

      results.forEach((result) => {
        if (result.chart) {
          resultMap.set(result.bucket.symbol, result.chart);
        } else if (result.error) {
          failures.push({
            symbol: result.bucket.symbol,
            message: result.error?.message || 'Failed to load timeline.',
          });
        }
      });

      const finalSources = buckets
        .map((bucket) => {
          const chart = resultMap.get(bucket.symbol) || cachedCharts.get(bucket.symbol);
          if (!chart) {
            return null;
          }
          return {
            symbol: bucket.symbol,
            chart,
            totalQuantity: bucket.totalQuantity,
            primaryAsset: bucket.primaryAsset,
            assets: bucket.assets,
          };
        })
        .filter(Boolean);

      setTimelineSources(finalSources);
      setTimelineError(failures.length > 0 ? failures : null);
      setTimelineLoading(false);
      setIsSyncComplete(true);
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [activeTimeline, assets, isLoading]);

  const aggregatedSeriesUSD = useMemo(() => {
    if (timelineSources.length === 0) {
      return syntheticSeriesUSD;
    }

    const assetSeries = timelineSources
      .map(({ chart, totalQuantity, primaryAsset }) => {
        const quantity = Number(totalQuantity) || 0;
        if (!Number.isFinite(quantity) || quantity <= 0) {
          return null;
        }
        const assetCurrency = String(chart?.currency || primaryAsset?.currency || "USD").toUpperCase();
        const rawSeries = Array.isArray(chart?.series) ? chart.series : [];
        if (!Array.isArray(rawSeries) || rawSeries.length === 0) {
          return null;
        }
        const normalizedPoints = rawSeries
          .map((point) => {
            const timestamp = point?.timestamp || point?.date || point?.time;
            if (!timestamp) {
              return null;
            }
            const date = new Date(timestamp);
            if (Number.isNaN(date.getTime())) {
              return null;
            }
            const close = Number(point?.close ?? point?.value ?? point?.price);
            if (!Number.isFinite(close)) {
              return null;
            }
            const valueUSD = convert(close * quantity, assetCurrency, "USD");
            if (!Number.isFinite(valueUSD)) {
              return null;
            }
            return { time: date.getTime(), valueUSD };
          })
          .filter(Boolean)
          .sort((a, b) => a.time - b.time);

        return normalizedPoints.length > 0 ? normalizedPoints : null;
      })
      .filter(Boolean);

    if (assetSeries.length === 0) {
      return syntheticSeriesUSD;
    }

    const timestamps = new Set();
    assetSeries.forEach((series) => {
      series.forEach((point) => {
        timestamps.add(point.time);
      });
    });

    if (timestamps.size === 0) {
      return syntheticSeriesUSD;
    }

    const sortedTimes = Array.from(timestamps).sort((a, b) => a - b);
    const states = assetSeries.map((series) => ({
      series,
      index: 0,
      lastValue: null,
    }));

    const aggregated = sortedTimes.map((timeMs) => {
      let total = 0;
      states.forEach((state) => {
        while (state.index < state.series.length && state.series[state.index].time <= timeMs) {
          state.lastValue = state.series[state.index].valueUSD;
          state.index += 1;
        }
        if (state.lastValue !== null) {
          total += state.lastValue;
        }
      });
      return { date: new Date(timeMs), value: total };
    });

    const numericTotal = Number(totalValue);
    if (aggregated.length > 0 && Number.isFinite(numericTotal)) {
      aggregated[aggregated.length - 1] = {
        ...aggregated[aggregated.length - 1],
        value: numericTotal,
      };
    } else if (aggregated.length === 0 && Number.isFinite(numericTotal) && numericTotal > 0) {
      aggregated.push({ date: new Date(), value: numericTotal });
    }

    return aggregated.length > 0 ? aggregated : syntheticSeriesUSD;
  }, [timelineSources, convert, totalValue, syntheticSeriesUSD]);

  const chartData = useMemo(() => {
    return aggregatedSeriesUSD.map((point) => {
      const convertedValue = convert(point.value, "USD");
      const safeValue = Number.isFinite(convertedValue) ? convertedValue : 0;
      return {
        date: point.date,
        value: Number(safeValue.toFixed(2)),
      };
    });
  }, [aggregatedSeriesUSD, convert]);

  const axisConfig = useMemo(() => {
    if (chartData.length === 0) {
      return { domain: [0, 1], ticks: [0, 1], step: 1 };
    }
    const values = chartData
      .map((point) => Number(point.value))
      .filter((value) => Number.isFinite(value));
    if (values.length === 0) {
      return { domain: [0, 1], ticks: [0, 1], step: 1 };
    }
    let minVal = Math.min(...values);
    let maxVal = Math.max(...values);
    if (!Number.isFinite(minVal) || !Number.isFinite(maxVal)) {
      return { domain: [0, 1], ticks: [0, 1], step: 1 };
    }
    const padding = Math.max((maxVal - minVal) * 0.04, 0);
    if (padding > 0) {
      minVal = Math.max(0, minVal - padding);
      maxVal = maxVal + padding;
    }
    return computeNiceScale(minVal, maxVal);
  }, [chartData]);

  const hasChartData = chartData.length > 0;
  const hasTimelineError = Array.isArray(timelineError) && timelineError.length > 0;
  const requiresSync = expectedSymbols > 0;
  const quotesSynced =
    (!requiresSync && !timelineLoading && !hasTimelineError) ||
    (requiresSync &&
      isSyncComplete &&
      !timelineLoading &&
      !hasTimelineError &&
      timelineSources.length === expectedSymbols);
  const showChartLoading = isLoading || (!quotesSynced && requiresSync);
  const shouldShowChart = quotesSynced && hasChartData;
  const shouldShowError = hasTimelineError && isSyncComplete && !timelineLoading;

  const convertedTotalValue = useMemo(() => {
    const numeric = Number(totalValue);
    if (!Number.isFinite(numeric)) {
      return 0;
    }
    const result = convert(numeric);
    return Number.isFinite(result) ? result : 0;
  }, [totalValue, convert]);

  const formatDisplay = useCallback(
    (value, options = {}) =>
      format(value, { fromCurrency: currency, toCurrency: currency, ...options }),
    [format, currency],
  );

  const axisFractionDigits = useMemo(() => determineFractionDigits(axisConfig.step), [axisConfig.step]);

  const formatAxisTick = useCallback(
    (raw) => {
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        return "";
      }
      const fractionDigits = Math.min(axisFractionDigits, 2);
      return formatDisplay(value, {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      });
    },
    [formatDisplay, axisFractionDigits],
  );

  useEffect(() => {
    if (chartData.length > 1) {
      const startValue = chartData[0].value;
      const endValue = chartData[chartData.length - 1].value;
      setPerformanceSign(endValue >= startValue ? 'positive' : 'negative');
    } else {
      setPerformanceSign('neutral');
    }
  }, [chartData, setPerformanceSign]);

  useEffect(() => {
    setHoverData(null);
  }, [activeTimeline, currency]);

  const initialValue = chartData.length > 0 ? chartData[0].value : convertedTotalValue;
  const latestValue = chartData.length > 0 ? chartData[chartData.length - 1].value : convertedTotalValue;

  const latestPoint = chartData.length > 0 ? chartData[chartData.length - 1] : null;
  const displayData = hoverData || latestPoint || { value: convertedTotalValue, date: new Date() };

  const performanceChange = displayData.value - initialValue;
  const performanceChangePercent = initialValue > 0 ? (performanceChange / initialValue) * 100 : 0;
  
  const isPositive = performanceChange >= 0;

  const formatXAxis = (tickItem) => {
    const date = new Date(tickItem);
    switch(activeTimeline) {
        case "1D": 
            return date.toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit',
                hour12: false 
            });
        case "1W": return date.toLocaleDateString('en-US', { weekday: 'short' });
        case "1M": 
        case "3M": return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
        case "YTD":
        case "1Y":
        case "5Y":
        case "All": return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        default: return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const handleMouseMove = (e) => {
    if (e.activePayload && e.activePayload.length > 0) {
      setHoverData(e.activePayload[0].payload);
    }
  };

  const handleMouseLeave = () => {
    setHoverData(null);
  };

  return (
    <div className="neomorph rounded-2xl p-4 md:p-6 space-y-4">
      <div>
        <h2 className="text-3xl font-bold text-purple-900">
          {formatDisplay(displayData.value, { maximumFractionDigits: 2 })}
        </h2>
        <div className={`flex items-center text-sm font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
          <span>{isPositive ? '+' : '-'}{formatDisplay(Math.abs(performanceChange), { maximumFractionDigits: 2 })}</span>
          <span className="mx-2">|</span>
          <span>{isPositive ? '+' : '-'}{Math.abs(performanceChangePercent).toFixed(2)}%</span>
          <span className="ml-2 text-purple-600">
            ({activeTimeline} Performance)
          </span>
        </div>
      </div>
      
      <div className="h-64">
        {shouldShowChart ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 5, right: 10, left: 16, bottom: 0 }}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              <defs>
                <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={isPositive ? "#10b981" : "#ef4444"} stopOpacity={0.4}/>
                  <stop offset="95%" stopColor={isPositive ? "#10b981" : "#ef4444"} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <Tooltip contentStyle={{ display: 'none' }} />
              <YAxis
                domain={axisConfig.domain}
                ticks={axisConfig.ticks}
                tickFormatter={formatAxisTick}
                stroke="var(--text-color-secondary)"
                fontSize={12}
                width={64}
                tickMargin={8}
                tickLine={false}
                axisLine={false}
              />
              <XAxis
                dataKey="date"
                tickFormatter={formatXAxis}
                stroke="var(--text-color-secondary)"
                fontSize={12}
                dy={5}
                interval="preserveStartEnd"
                minTickGap={30}
              />
              <Area type="monotone" dataKey="value" stroke={isPositive ? "#10b981" : "#ef4444"} strokeWidth={2} fillOpacity={1} fill="url(#colorUv)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : showChartLoading ? (
          <div className="h-full flex flex-col items-center justify-center space-y-4">
            <div className="w-full h-40 rounded-xl bg-purple-200/40 dark:bg-gray-700/40 animate-pulse" />
            <p className="text-sm text-purple-600">Syncing live price history...</p>
          </div>
        ) : shouldShowError ? (
          <div className="h-full flex items-center justify-center text-sm text-red-600 text-center px-4">
            Unable to load performance data for your holdings right now.
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-purple-600 text-center px-4">
            Performance data will appear once pricing history becomes available.
          </div>
        )}
      </div>

      {/* Mobile responsive timeline buttons */}
      <div className="flex justify-center">
        <div className="flex overflow-x-auto space-x-1 pb-1 scrollbar-hide max-w-full">
          {timelineOptions.map((option) => (
            <button
              key={option}
              onClick={() => setActiveTimeline(option)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 flex-shrink-0 ${
                activeTimeline === option
                  ? 'neomorph-pressed text-purple-700 dark:text-purple-300'
                  : 'neomorph-inset text-purple-600 dark:text-purple-400'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
