import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useCurrency } from '@/context/CurrencyContext.jsx';
import getPortfolioSeries from '@/utils/portfolioSeries';
import PriceProvider from '@/utils/priceProvider';

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

const timelineOptions = ['1D', '1W', '1M', '3M', 'YTD', '1Y', '5Y', 'All'];

const formatRangeKey = (key) => (key || '').toUpperCase() === 'ALL' ? 'ALL' : (key || '').toUpperCase();

export default function PerformanceChart({ assets, transactions, totalValue, isLoading, setPerformanceSign = () => {}, totalDayChange }) {
  const { format, convert, currency } = useCurrency();
  const [activeTimeline, setActiveTimeline] = useState('1D');
  const [hoverData, setHoverData] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [seriesMeta, setSeriesMeta] = useState(null);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const priceProviderRef = useRef(new PriceProvider());

  const loadSeries = useCallback(async () => {
    if (isLoading) {
      return;
    }
    setSeriesLoading(true);
    const rangeKey = formatRangeKey(activeTimeline);
    try {
      const result = await getPortfolioSeries({
        rangeKey,
        asOfDate: new Date(),
        assets,
        transactions,
        priceProvider: priceProviderRef.current,
      });

      const converted = (result.points || []).map((point) => {
        const convertedValue = convert(point.value, 'USD');
        return {
          date: new Date(point.date),
          value: Number.isFinite(convertedValue) ? Number(convertedValue.toFixed(2)) : 0,
          twrIndex: point.twrIndex,
          cashFlow: point.cashFlow,
        };
      });

      setChartData(converted);
      setSeriesMeta({ ...result, rangeKey });
      if ((result.pointCount || 0) <= 3) {
        console.warn('[PerformanceChart] Sparse data', result);
      }
    } catch (error) {
      console.error('Failed to load portfolio series', error);
      setChartData([]);
      setSeriesMeta(null);
    } finally {
      setSeriesLoading(false);
    }
  }, [activeTimeline, assets, transactions, convert, isLoading]);

  useEffect(() => {
    loadSeries();
  }, [loadSeries]);

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
        return '';
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

  const initialValue = chartData.length > 0 ? chartData[0].value : convert(totalValue, 'USD');
  const latestValue = chartData.length > 0 ? chartData[chartData.length - 1].value : convert(totalValue, 'USD');
  const startTwrIndex = chartData.length > 0 ? chartData[0].twrIndex || 1 : 1;

  const latestPoint = chartData.length > 0 ? chartData[chartData.length - 1] : null;
  const displayData = hoverData || latestPoint || { value: latestValue, twrIndex: startTwrIndex, date: new Date() };

  const performanceChange = displayData.value - initialValue;
  const performanceChangePercent = startTwrIndex > 0 ? ((displayData.twrIndex / startTwrIndex) - 1) * 100 : 0;

  const isPositive = performanceChange >= 0;

  const formatXAxis = (tickItem) => {
    const date = new Date(tickItem);
    switch(activeTimeline) {
        case '1D':
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
            });
        case '1W': return date.toLocaleDateString('en-US', { weekday: 'short' });
        case '1M':
        case '3M': return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
        case 'YTD':
        case '1Y':
        case '5Y':
        case 'All': return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
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

  const shouldShowChart = !seriesLoading && chartData.length > 1;
  const showChartLoading = isLoading || seriesLoading;

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
        {seriesMeta && (
          <p className="text-xs text-purple-600 mt-1">
            Points: {seriesMeta.pointCount} | Range: {new Date(seriesMeta.startDate).toISOString().slice(0,10)} → {new Date(seriesMeta.endDate).toISOString().slice(0,10)}
          </p>
        )}
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
              <Area type="monotone" dataKey="value" stroke={isPositive ? "#10b981" : "#ef4444"} strokeWidth={2} fillOpacity={1}
fill="url(#colorUv)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : showChartLoading ? (
          <div className="h-full flex flex-col items-center justify-center space-y-4">
            <div className="w-full h-40 rounded-xl bg-purple-200/40 dark:bg-gray-700/40 animate-pulse" />
            <p className="text-sm text-purple-600">Syncing live price history...</p>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-purple-600 text-center px-4">
            Performance data will appear once pricing history becomes available.
          </div>
        )}
      </div>

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

