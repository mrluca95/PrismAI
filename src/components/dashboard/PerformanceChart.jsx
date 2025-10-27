
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useCurrency } from "@/context/CurrencyContext.jsx";
import { FetchPriceTimeline } from "@/integrations/Core.js";

const timelineOptions = ["1D", "1W", "1M", "3M", "YTD", "1Y", "5Y", "All"];
const MAGNITUDE_SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Q'];

export default function PerformanceChart({ assets, totalValue, isLoading, setPerformanceSign = () => {}, totalDayChange }) {
  const { format, convert, currency, symbol } = useCurrency();
  const [activeTimeline, setActiveTimeline] = useState("1D");
  const [hoverData, setHoverData] = useState(null);

  const [timelineSources, setTimelineSources] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState(null);
  const timelineCacheRef = useRef(new Map());

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
        }
        return;
      }

      const timelineKey = activeTimeline.toUpperCase();
      const normalizedAssets = assets
        .map((asset) => {
          const symbol = String(asset?.symbol || '').trim().toUpperCase();
          if (!symbol) {
            return null;
          }
          const cacheKey = `${timelineKey}:${symbol}`;
          return { asset, symbol, cacheKey };
        })
        .filter(Boolean);

      if (normalizedAssets.length === 0) {
        if (!cancelled) {
          setTimelineSources([]);
          setTimelineError(null);
          setTimelineLoading(false);
        }
        return;
      }

      const cachedEntries = [];
      const assetsToFetch = [];

      normalizedAssets.forEach((entry) => {
        const cached = timelineCacheRef.current.get(entry.cacheKey);
        if (cached) {
          cachedEntries.push({ ...entry, chart: cached });
        } else {
          assetsToFetch.push(entry);
        }
      });

      if (!cancelled) {
        const orderedCached = normalizedAssets
          .map((entry) => {
            const match = cachedEntries.find((item) => item.symbol === entry.symbol);
            return match ? { asset: match.asset, chart: match.chart } : null;
          })
          .filter(Boolean);
        setTimelineSources(orderedCached);
        setTimelineError(null);
      }

      if (assetsToFetch.length === 0) {
        if (!cancelled) {
          setTimelineLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setTimelineLoading(true);
      }

      const results = await Promise.all(
        assetsToFetch.map(async ({ asset, symbol, cacheKey, quantity }) => {
          try {
            const chart = await FetchPriceTimeline({ symbol, timeline: timelineKey });
            const sanitizedSeries = Array.isArray(chart?.series)
              ? chart.series.filter((point) => {
                  const close = Number(point?.close ?? point?.value ?? point?.price);
                  return Number.isFinite(close) && close > 0;
                })
              : [];

            if (sanitizedSeries.length === 0) {
              return { asset, symbol, error: new Error('No valid price points returned.') };
            }

            const assetPrice = Number(asset?.current_price);
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

            const chartCurrency = String(chart?.currency || asset?.currency || 'USD').toUpperCase();
            const adjustedChart = {
              ...chart,
              currency: chartCurrency,
              series: adjustedSeries,
            };
            timelineCacheRef.current.set(cacheKey, adjustedChart);
            return { asset, symbol, chart: adjustedChart, quantity };
          } catch (error) {
            return { asset, symbol, error };
          }
        }),
      );

      if (cancelled) {
        return;
      }

      const combined = new Map();
      cachedEntries.forEach((entry) => {
        combined.set(entry.symbol, { asset: entry.asset, chart: entry.chart });
      });

      const failures = [];

      results.forEach((result) => {
        if (result.chart) {
          combined.set(result.symbol, { asset: result.asset, chart: result.chart });
        } else if (result.error) {
          failures.push({
            symbol: result.symbol,
            message: result.error?.message || 'Failed to load timeline.',
          });
        }
      });

      const ordered = normalizedAssets
        .map((entry) => combined.get(entry.symbol) || null)
        .filter(Boolean);

      setTimelineSources(ordered);
      setTimelineError(failures.length > 0 ? failures : null);
      setTimelineLoading(false);
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
      .map(({ asset, chart }) => {
        const quantity = Number(asset?.quantity) || 0;
        if (!Number.isFinite(quantity) || quantity <= 0) {
          return null;
        }
        const assetCurrency = String(chart?.currency || asset?.currency || "USD").toUpperCase();
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

  const hasChartData = chartData.length > 0;
  const hasTimelineError = Array.isArray(timelineError) && timelineError.length > 0;
  const isChartLoading = isLoading || (timelineLoading && !hasChartData);

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

  const formatAxisTick = useCallback(
    (raw) => {
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        return "";
      }
      if (value === 0) {
        return `${symbol}0`;
      }
      const absValue = Math.abs(value);
      if (absValue < 1) {
        return formatDisplay(value, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        });
      }
      if (absValue < 1000) {
        const rounded = Math.floor(absValue);
        return `${value < 0 ? '-' : ''}${symbol}${rounded}`;
      }

      const magnitude = Math.floor(Math.log10(absValue));
      const suffixIndex = Math.min(Math.floor(magnitude / 3), MAGNITUDE_SUFFIXES.length - 1);
      const scaled = absValue / (10 ** (suffixIndex * 3));
      const firstDigit = Math.floor(scaled).toString().charAt(0) || '0';
      const suffix = MAGNITUDE_SUFFIXES[suffixIndex];
      const prefix = value < 0 ? '-' : '';

      return `${prefix}${symbol}${firstDigit}${suffix}`;
    },
    [formatDisplay, symbol],
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

  const chartMinRaw = chartData.length > 0
    ? Math.min(...chartData.map((d) => d.value)) * 0.98
    : convertedTotalValue * 0.98;

  const chartMaxRaw = chartData.length > 0
    ? Math.max(...chartData.map((d) => d.value)) * 1.02
    : convertedTotalValue * 1.02;

  const domainMin = Number.isFinite(chartMinRaw) ? Math.max(chartMinRaw, 0) : 0;
  const domainMax = Number.isFinite(chartMaxRaw)
    ? Math.max(chartMaxRaw, domainMin > 0 ? domainMin * 1.05 : 1)
    : (domainMin > 0 ? domainMin * 1.05 : 1);

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

  if (isChartLoading) {
    return (
        <div className="neomorph rounded-2xl p-6 animate-pulse">
            <div className="h-64 bg-purple-200 dark:bg-gray-700 rounded-lg"></div>
        </div>
    );
  }

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
        {hasChartData ? (
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
                domain={[domainMin, domainMax]}
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
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-purple-600 text-center px-4">
            {hasTimelineError
              ? "Unable to load performance data for your holdings right now."
              : "Performance data will appear once pricing history becomes available."}
          </div>
        )}
      </div>

      {hasTimelineError && hasChartData && (
        <p className="text-xs text-purple-500 text-center">
          Some holdings are missing price history right now. Displaying an estimated trend until quotes sync.
        </p>
      )}
      
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
