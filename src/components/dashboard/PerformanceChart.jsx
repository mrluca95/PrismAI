
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useCurrency } from "@/context/CurrencyContext.jsx";

const timelineOptions = ["1D", "1W", "1M", "3M", "YTD", "1Y", "5Y", "All"];

export default function PerformanceChart({ assets, totalValue, isLoading, setPerformanceSign = () => {}, totalDayChange }) {
  const { format, convert, currency } = useCurrency();
  const [activeTimeline, setActiveTimeline] = useState("1D");
  const [hoverData, setHoverData] = useState(null);

  const rawChartData = useMemo(() => {
    if (isLoading || assets.length === 0) return [];
    
    const generateData = (days, interval) => {
        let data = [];
        
        let changeForPeriod;
        if (activeTimeline === "1D") {
            changeForPeriod = totalDayChange || 0;
        } else {
            // This is a proxy for other timeframes since we don't store historical data
            changeForPeriod = assets.reduce((sum, asset) => sum + (asset.gain_loss || 0), 0);
        }

        const startValue = Math.max(0, totalValue - changeForPeriod);
        const trendPerDay = days > 0 ? (totalValue - startValue) / days : 0;

        const now = new Date();
        const pointsToGenerate = Math.max(2, Math.ceil(days / interval));
        
        for (let i = 0; i < pointsToGenerate; i++) {
            const timeOffset = (days * i) / (pointsToGenerate - 1);
            const date = new Date(now.getTime() - (days - timeOffset) * 24 * 60 * 60 * 1000);

            let value;
            if (i === 0) {
                // Ensure the first point is exact
                value = startValue;
            } else {
                const volatilityFactor = 0.015;
                const randomVolatility = (Math.random() - 0.5) * volatilityFactor * startValue;
                const baseValue = startValue + (trendPerDay * timeOffset) + randomVolatility;
                value = Math.max(0, baseValue);
            }
            
            data.push({
                date: date,
                value: parseFloat(value.toFixed(2)),
            });
        }
        
        // Ensure the last point is exactly the current value and time
        if (data.length > 0) {
          data[data.length - 1] = {
            date: new Date(),
            value: parseFloat(totalValue.toFixed(2))
          };
        }
        
        return data;
    };

    switch(activeTimeline) {
        case "1D": return generateData(1, 1/24); // 1 day, with hourly-ish intervals
        case "1W": return generateData(7, 1);
        case "1M": return generateData(30, 2);
        case "3M": return generateData(90, 3);
        case "YTD": 
            const startOfYear = new Date(new Date().getFullYear(), 0, 1);
            const today = new Date();
            const daysSinceYTD = Math.floor((today - startOfYear) / (1000 * 60 * 60 * 24));
            return generateData(daysSinceYTD, Math.max(1, Math.ceil(daysSinceYTD/30)));
        case "1Y": return generateData(365, 7);
        case "5Y": return generateData(365 * 5, 30);
        case "All": return generateData(365 * 2, 30);
        default: return [];
    }
  }, [activeTimeline, assets, totalValue, isLoading, totalDayChange]);

  const chartData = useMemo(() => {
    return rawChartData.map((point) => {
      const convertedValue = convert(point.value);
      const safeValue = Number.isFinite(convertedValue) ? convertedValue : 0;
      return {
        date: point.date,
        value: Number(safeValue.toFixed(2)),
      };
    });
  }, [rawChartData, convert]);

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

  if (isLoading) {
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
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart 
            data={chartData} 
            margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <defs>
              <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={isPositive ? "#10b981" : "#ef4444"} stopOpacity={0.4}/>
                <stop offset="95%" stopColor={isPositive ? "#10b981" : "#ef4444"} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <Tooltip
              contentStyle={{ display: 'none' }}
            />
            <YAxis
              domain={[domainMin, domainMax]}
              tickFormatter={(value) => {
                const absValue = Math.abs(value);
                const fractionDigits = absValue < 1000 ? 2 : 0;
                return formatDisplay(value, {
                  minimumFractionDigits: fractionDigits,
                  maximumFractionDigits: fractionDigits,
                });
              }}
              stroke="var(--text-color-secondary)"
              fontSize={12}
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
