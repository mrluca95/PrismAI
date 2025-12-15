
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useCurrency } from "@/context/CurrencyContext.jsx";

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
const DAY_MS = 24 * 60 * 60 * 1000;
const FREE_DATA_REFRESH_MS = 6 * 60 * 60 * 1000;
const YAHOO_CHART_ENDPOINT = "https://query1.finance.yahoo.com/v8/finance/chart";
const YAHOO_CHART_PROXY_ENDPOINT = "https://r.jina.ai/https://query1.finance.yahoo.com/v8/finance/chart";
const YAHOO_QUERY =
  "range=max&interval=1d&includePrePost=false&lang=en-US&region=US&corsDomain=finance.yahoo.com";

const TIMELINE_SEGMENTS = {
  "1D": 24,
  "1W": 32,
  "1M": 36,
  "3M": 48,
  "YTD": 60,
  "1Y": 72,
  "5Y": 80,
  All: 120,
};

const buildLinearSeries = (startDate, startValue, endDate, endValue, segments = 60) => {
  const safeStartDate = startDate ? new Date(startDate) : new Date(endDate.getTime() - DAY_MS * 30);
  const safeEndDate = endDate ? new Date(endDate) : new Date();
  const startTime = safeStartDate.getTime();
  const endTime = Math.max(safeEndDate.getTime(), startTime + 1);
  const safeStartValue = Number.isFinite(startValue) ? startValue : Number(endValue) || 0;
  const safeEndValue = Number.isFinite(endValue) ? endValue : safeStartValue;
  const count = Math.max(segments, 2);
  const series = [];

  for (let index = 0; index < count; index += 1) {
    const ratio = count <= 1 ? 1 : index / (count - 1);
    const timestamp = new Date(startTime + (endTime - startTime) * ratio);
    const value = safeStartValue + (safeEndValue - safeStartValue) * ratio;
    series.push({
      date: timestamp,
      valueUSD: Number.isFinite(value) ? value : safeStartValue,
    });
  }

  return series;
};

const getTimelineCutoff = (timeline, latestDate) => {
  const end = latestDate ? new Date(latestDate) : new Date();
  switch (timeline) {
    case "1W":
      return new Date(end.getTime() - 7 * DAY_MS);
    case "1M":
      return new Date(end.getTime() - 30 * DAY_MS);
    case "3M":
      return new Date(end.getTime() - 90 * DAY_MS);
    case "YTD":
      return new Date(end.getFullYear(), 0, 1);
    case "1Y":
      return new Date(end.getTime() - 365 * DAY_MS);
    case "5Y":
      return new Date(end.getTime() - 5 * 365 * DAY_MS);
    case "All":
    default:
      return new Date(0);
  }
};

const parseYahooSnapshot = (result) => {
  const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const quote = result?.indicators?.quote?.[0] || {};
  const closes = Array.isArray(quote?.close) ? quote.close : [];
  const currency = String(result?.meta?.currency || "USD").toUpperCase();

  const pickFromStart = () => {
    for (let index = 0; index < timestamps.length; index += 1) {
      const close = Number(closes[index]);
      if (Number.isFinite(close)) {
        return { date: new Date(timestamps[index] * 1000), price: close };
      }
    }
    return null;
  };

  const pickFromEnd = () => {
    for (let index = timestamps.length - 1; index >= 0; index -= 1) {
      const close = Number(closes[index]);
      if (Number.isFinite(close)) {
        return { index, point: { date: new Date(timestamps[index] * 1000), price: close } };
      }
    }
    return null;
  };

  const earliest = pickFromStart();
  const latestInfo = pickFromEnd();
  if (!latestInfo || !latestInfo.point || !earliest) {
    throw new Error("Incomplete price history returned.");
  }

  const findPrevious = () => {
    for (let index = latestInfo.index - 1; index >= 0; index -= 1) {
      const close = Number(closes[index]);
      if (Number.isFinite(close)) {
        return { date: new Date(timestamps[index] * 1000), price: close };
      }
    }
    return earliest;
  };

  const previous = findPrevious();

  return {
    currency,
    earliest,
    previous,
    latest: latestInfo.point,
  };
};

const extractJsonPayload = (text) => {
  if (!text) {
    throw new Error("Chart payload is empty.");
  }
  const braceIndex = text.indexOf("{");
  if (braceIndex === -1) {
    throw new Error("Could not locate JSON chart payload.");
  }
  const jsonCandidate = text.slice(braceIndex);
  try {
    return JSON.parse(jsonCandidate);
  } catch (parseError) {
    throw new Error("Failed to parse chart JSON.");
  }
};

const fetchYahooSnapshot = async (symbol) => {
  const trimmed = String(symbol || "").trim().toUpperCase();
  if (!trimmed) {
    throw new Error("Invalid symbol");
  }
  const isBrowser = typeof window !== "undefined";
  const baseUrl = isBrowser ? YAHOO_CHART_PROXY_ENDPOINT : YAHOO_CHART_ENDPOINT;
  const url = `${baseUrl}/${encodeURIComponent(trimmed)}?${YAHOO_QUERY}`;
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    mode: isBrowser ? "cors" : undefined,
  });
  if (!response.ok) {
    throw new Error(`Yahoo Finance returned ${response.status}`);
  }
  let data;
  if (isBrowser) {
    const payloadText = await response.text();
    data = extractJsonPayload(payloadText);
  } else {
    data = await response.json();
  }
  const result = data?.chart?.result?.[0];
  if (!result) {
    const err = data?.chart?.error?.description || "Chart data unavailable.";
    throw new Error(err);
  }
  const snapshot = parseYahooSnapshot(result);
  return { symbol: trimmed, ...snapshot, fetchedAt: Date.now() };
};

export default function PerformanceChart({ assets, totalValue, isLoading, setPerformanceSign = () => {} }) {
  const { format, convert, currency } = useCurrency();
  const [activeTimeline, setActiveTimeline] = useState("1D");
  const [hoverData, setHoverData] = useState(null);

  const [snapshotEntries, setSnapshotEntries] = useState([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [snapshotsError, setSnapshotsError] = useState(null);
  const snapshotCacheRef = useRef(new Map());

  useEffect(() => {
    let cancelled = false;

    const loadSnapshots = async () => {
      if (isLoading) {
        if (!cancelled) {
          setSnapshotsLoading(true);
        }
        return;
      }

      if (!assets || assets.length === 0) {
        if (!cancelled) {
          setSnapshotEntries([]);
          setSnapshotsError(null);
          setSnapshotsLoading(false);
        }
        return;
      }

      const symbols = [...new Set(assets.map((asset) => String(asset?.symbol || "").trim().toUpperCase()).filter(Boolean))];

      if (symbols.length === 0) {
        if (!cancelled) {
          setSnapshotEntries([]);
          setSnapshotsError(null);
          setSnapshotsLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setSnapshotsLoading(true);
        setSnapshotsError(null);
      }

      const results = await Promise.all(
        symbols.map(async (symbol) => {
          const cached = snapshotCacheRef.current.get(symbol);
          if (cached && Date.now() - cached.fetchedAt < FREE_DATA_REFRESH_MS) {
            return { symbol, snapshot: cached.snapshot };
          }

          try {
            const snapshot = await fetchYahooSnapshot(symbol);
            const normalized = {
              symbol: snapshot.symbol,
              currency: snapshot.currency,
              earliest: snapshot.earliest,
              previous: snapshot.previous,
              latest: snapshot.latest,
            };
            snapshotCacheRef.current.set(snapshot.symbol, {
              snapshot: normalized,
              fetchedAt: snapshot.fetchedAt || Date.now(),
            });
            return { symbol, snapshot: normalized };
          } catch (error) {
            return { symbol, error };
          }
        }),
      );

      if (cancelled) {
        return;
      }

      const nextEntries = [];
      const failures = [];

      results.forEach((result) => {
        if (result.snapshot) {
          nextEntries.push(result.snapshot);
        } else if (result.error) {
          failures.push({
            symbol: result.symbol,
            message: result.error?.message || "Failed to load price history.",
          });
        }
      });

      setSnapshotEntries(nextEntries);
      setSnapshotsError(nextEntries.length === 0 && failures.length > 0 ? failures : null);
      setSnapshotsLoading(false);
    };

    loadSnapshots();

    return () => {
      cancelled = true;
    };
  }, [assets, isLoading]);

  const aggregatedSnapshots = useMemo(() => {
    if (!assets || assets.length === 0 || snapshotEntries.length === 0) {
      return null;
    }

    const entryMap = new Map(snapshotEntries.map((entry) => [entry.symbol, entry]));
    let earliestValueUSD = 0;
    let previousValueUSD = 0;
    let latestValueUSD = 0;
    let earliestDate = null;
    let previousDate = null;
    let latestDate = null;

    assets.forEach((asset) => {
      const symbol = String(asset?.symbol || "").trim().toUpperCase();
      const quantity = Number(asset?.quantity) || 0;
      if (!symbol || !Number.isFinite(quantity) || quantity <= 0) {
        return;
      }
      const entry = entryMap.get(symbol);
      if (!entry) {
        return;
      }

      const assetCurrency = String(entry.currency || asset?.currency || "USD").toUpperCase();

      const convertPoint = (point) => {
        if (!point || !Number.isFinite(point.price)) {
          return null;
        }
        const total = convert(point.price * quantity, assetCurrency, "USD");
        if (!Number.isFinite(total)) {
          return null;
        }
        return { date: point.date, total };
      };

      const earliestPoint = convertPoint(entry.earliest);
      if (earliestPoint) {
        earliestValueUSD += earliestPoint.total;
        earliestDate = !earliestDate || earliestPoint.date < earliestDate ? earliestPoint.date : earliestDate;
      }

      const previousPoint = convertPoint(entry.previous);
      if (previousPoint) {
        previousValueUSD += previousPoint.total;
        previousDate = !previousDate || previousPoint.date < previousDate ? previousPoint.date : previousDate;
      }

      const latestPoint = convertPoint(entry.latest);
      if (latestPoint) {
        latestValueUSD += latestPoint.total;
        latestDate = !latestDate || latestPoint.date > latestDate ? latestPoint.date : latestDate;
      }
    });

    if (!Number.isFinite(latestValueUSD) || latestValueUSD <= 0) {
      return null;
    }

    if (!earliestDate) {
      earliestDate = new Date((latestDate || new Date()).getTime() - 365 * DAY_MS);
    }
    if (!previousDate) {
      previousDate = new Date((latestDate || new Date()).getTime() - DAY_MS);
      previousValueUSD = earliestValueUSD;
    }

    return {
      earliestValueUSD,
      earliestDate,
      previousValueUSD: Number.isFinite(previousValueUSD) && previousValueUSD > 0 ? previousValueUSD : earliestValueUSD,
      previousDate,
      latestValueUSD,
      latestDate: latestDate || new Date(),
    };
  }, [assets, snapshotEntries, convert]);

  const longTermSeriesUSD = useMemo(() => {
    if (!aggregatedSnapshots) {
      return [];
    }
    return buildLinearSeries(
      aggregatedSnapshots.earliestDate,
      aggregatedSnapshots.earliestValueUSD,
      aggregatedSnapshots.latestDate,
      aggregatedSnapshots.latestValueUSD,
      TIMELINE_SEGMENTS.All,
    );
  }, [aggregatedSnapshots]);

  const intradaySeriesUSD = useMemo(() => {
    if (!aggregatedSnapshots) {
      return [];
    }
    const startDate = aggregatedSnapshots.previousDate || new Date(aggregatedSnapshots.latestDate.getTime() - DAY_MS);
    return buildLinearSeries(
      startDate,
      aggregatedSnapshots.previousValueUSD,
      aggregatedSnapshots.latestDate,
      aggregatedSnapshots.latestValueUSD,
      TIMELINE_SEGMENTS["1D"],
    );
  }, [aggregatedSnapshots]);

  const convertSeries = useCallback(
    (seriesUSD) =>
      seriesUSD.map((point) => {
        const convertedValue = convert(point.valueUSD, "USD");
        return {
          date: point.date,
          value: Number.isFinite(convertedValue) ? Number(convertedValue.toFixed(2)) : 0,
        };
      }),
    [convert],
  );

  const chartData = useMemo(() => {
    if (!aggregatedSnapshots) {
      return [];
    }

    if (activeTimeline === "1D") {
      return convertSeries(intradaySeriesUSD);
    }

    if (longTermSeriesUSD.length === 0) {
      return [];
    }

    if (activeTimeline === "All") {
      return convertSeries(longTermSeriesUSD);
    }

    const cutoff = getTimelineCutoff(activeTimeline, aggregatedSnapshots.latestDate);
    const filtered = longTermSeriesUSD.filter((point) => point.date >= cutoff);
    const safeSeries = filtered.length > 1 ? filtered : longTermSeriesUSD.slice(-2);
    return convertSeries(safeSeries);
  }, [activeTimeline, aggregatedSnapshots, convertSeries, intradaySeriesUSD, longTermSeriesUSD]);

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

  const hasChartData = chartData.length > 1;
  const hasSnapshotError = Array.isArray(snapshotsError) && snapshotsError.length > 0;
  const showChartLoading = isLoading || snapshotsLoading;
  const shouldShowChart = !showChartLoading && hasChartData;
  const shouldShowError = !showChartLoading && !hasChartData && hasSnapshotError;

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
