import React, { useEffect, useMemo, useState, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useCurrency } from "@/context/CurrencyContext.jsx";
import { FetchPriceTimeline } from "@/integrations/Core.js";

const TIMELINE_OPTIONS = ["1D", "1W", "1M", "3M", "YTD", "1Y", "5Y", "All"];
const DEFAULT_TIMELINE = "1M";

const formatLabelForTimeline = (date, timelineKey) => {
  switch (timelineKey) {
    case "1D":
      return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    case "1W":
      return date.toLocaleDateString("en-US", { weekday: "short" });
    case "1M":
    case "3M":
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    case "YTD":
    case "1Y":
    case "5Y":
    case "ALL":
      return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    default:
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
};

const formatTooltipDate = (date, timelineKey) => {
  if (timelineKey === "1D") {
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export default function AssetChart({ asset }) {
  const { format, convert, currency } = useCurrency();
  const formatDisplay = useCallback(
    (value, options = {}) =>
      format(value, { fromCurrency: currency, toCurrency: currency, ...options }),
    [format, currency],
  );
  const [activeTimeline, setActiveTimeline] = useState(DEFAULT_TIMELINE);
  const [timelineDataMap, setTimelineDataMap] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const symbol = asset?.symbol || "";
  const normalizedSymbol = symbol.trim().toUpperCase();
  const timelineKey = String(activeTimeline || DEFAULT_TIMELINE).toUpperCase();
  const cachedTimeline = timelineDataMap[timelineKey];

  useEffect(() => {
    setTimelineDataMap({});
    setActiveTimeline(DEFAULT_TIMELINE);
    setError(null);
  }, [normalizedSymbol]);

  useEffect(() => {
    const load = async () => {
      if (!normalizedSymbol) {
        return;
      }
      if (timelineDataMap[timelineKey]) {
        return;
      }
      let cancelled = false;
      setIsLoading(true);
      setError(null);
      try {
        const data = await FetchPriceTimeline({ symbol: normalizedSymbol, timeline: timelineKey });
        if (!cancelled) {
          setTimelineDataMap((prev) => ({ ...prev, [timelineKey]: data }));
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
      return () => {
        cancelled = true;
      };
    };
    load();
  }, [normalizedSymbol, timelineKey, timelineDataMap]);

  useEffect(() => {
    if (timelineDataMap[timelineKey] && error) {
      setError(null);
    }
  }, [timelineDataMap, timelineKey, error]);

  const chartData = useMemo(() => {
    const series = cachedTimeline?.series || [];
    if (!Array.isArray(series) || series.length === 0) {
      return [];
    }

    return series
      .map((point) => {
        const timestamp = point?.timestamp;
        const close = Number(point?.close);
        if (!timestamp || !Number.isFinite(close)) {
          return null;
        }
        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) {
          return null;
        }
        return {
          timestamp: date.toISOString(),
          priceRaw: close,
          priceConverted: convert(close),
        };
      })
      .filter(Boolean);
  }, [cachedTimeline, convert]);

  const formattedData = useMemo(() => {
    return chartData.map((point) => {
      const date = new Date(point.timestamp);
      return {
        ...point,
        label: formatLabelForTimeline(date, timelineKey),
      };
    });
  }, [chartData, timelineKey]);

  const firstPoint = formattedData[0];
  const lastPoint = formattedData[formattedData.length - 1];
  const isPositive = firstPoint && lastPoint ? lastPoint.priceConverted >= firstPoint.priceConverted : true;

  const chartMin = formattedData.length
    ? Math.min(...formattedData.map((point) => point.priceConverted)) * 0.98
    : 0;
  const chartMax = formattedData.length
    ? Math.max(...formattedData.map((point) => point.priceConverted)) * 1.02
    : 0;

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) {
      return null;
    }
    const dataPoint = payload[0]?.payload;
    if (!dataPoint) {
      return null;
    }
    const date = new Date(dataPoint.timestamp);
    return (
      <div className="neomorph rounded-xl p-3 bg-gray-200 dark:bg-gray-800">
        <p className="font-semibold text-gray-800 dark:text-gray-100">
          {formatTooltipDate(date, timelineKey)}
        </p>
        <p className="text-gray-600 dark:text-gray-300">
          {formatDisplay(dataPoint.priceConverted, { maximumFractionDigits: 2 })}
        </p>
      </div>
    );
  };

  if (!normalizedSymbol) {
    return null;
  }

  const hasData = formattedData.length > 0;
  const showLoading = isLoading && !hasData;
  const displayName = cachedTimeline?.name || asset?.name || normalizedSymbol;
  const displayCurrency = cachedTimeline?.currency || asset?.currency || "";

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">
            Price History — {displayName}
          </h2>
          {displayCurrency && (
            <p className="text-xs text-gray-500 uppercase tracking-wide">{displayCurrency}</p>
          )}
        </div>
        <div className="flex overflow-x-auto space-x-1 pb-1 scrollbar-hide max-w-full">
          {TIMELINE_OPTIONS.map((option) => (
            <button
              key={option}
              onClick={() => setActiveTimeline(option)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 flex-shrink-0 ${
                activeTimeline === option
                  ? "neomorph-pressed text-purple-700 dark:text-purple-200"
                  : "neomorph-inset text-purple-600 dark:text-purple-300"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="neomorph rounded-2xl p-6 min-h-[18rem]">
        {showLoading && (
          <div className="h-60 animate-pulse">
            <div className="h-full w-full rounded-xl bg-purple-200/50 dark:bg-gray-700/50" />
          </div>
        )}

        {!showLoading && error && !hasData && (
          <div className="h-60 flex items-center justify-center text-sm text-red-600 text-center">
            {error?.message || "Unable to load price history at the moment."}
          </div>
        )}

        {!showLoading && !error && !hasData && (
          <div className="h-60 flex items-center justify-center text-sm text-gray-500 text-center">
            Price history is unavailable for this symbol.
          </div>
        )}

        {!showLoading && hasData && (
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={formattedData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(value) => formatLabelForTimeline(new Date(value), timelineKey)}
                  stroke="#6b7280"
                  fontSize={12}
                  minTickGap={24}
                />
                <YAxis
                  domain={[chartMin, chartMax]}
                  tickFormatter={(value) => {
                    const absValue = Math.abs(value);
                    const fractionDigits = absValue < 1000 ? 2 : 0;
                    return formatDisplay(value, {
                      minimumFractionDigits: fractionDigits,
                      maximumFractionDigits: fractionDigits,
                    });
                  }}
                  stroke="#6b7280"
                  fontSize={12}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="priceConverted"
                  stroke={isPositive ? "#10b981" : "#ef4444"}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, fill: isPositive ? "#10b981" : "#ef4444" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
