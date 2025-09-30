import React, { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useCurrency } from "@/context/CurrencyContext.jsx";

const SLICE_COLORS = ["#8b5cf6", "#a78bfa", "#c4b5fd", "#6d28d9", "#ddd6fe", "#5b21b6", "#7c3aed", "#9f7aea"];
const MAX_SLICES = 6;

const summariseHoldings = (assets = []) => {
  const map = new Map();

  assets.forEach((asset) => {
    const rawSymbol = typeof asset.symbol === "string" ? asset.symbol.trim().toUpperCase() : "";
    const symbol = rawSymbol || `ASSET-${asset.id}`;
    const marketValue = Number(asset?.market_value) || 0;
    const gainLoss = Number(asset?.gain_loss) || 0;
    const quantity = Number(asset?.quantity) || 0;
    const broker = asset?.broker;

    if (!map.has(symbol)) {
      map.set(symbol, {
        symbol,
        name: asset?.name || symbol,
        marketValue: 0,
        gainLoss: 0,
        quantity: 0,
        brokers: new Set(),
        count: 0,
      });
    }

    const entry = map.get(symbol);
    entry.marketValue += marketValue;
    entry.gainLoss += gainLoss;
    entry.quantity += quantity;
    entry.count += 1;
    if (broker) {
      entry.brokers.add(broker);
    }
  });

  return Array.from(map.values())
    .map((entry) => ({
      ...entry,
      brokers: Array.from(entry.brokers),
    }))
    .sort((a, b) => (b.marketValue || 0) - (a.marketValue || 0));
};

export default function PortfolioBreakdown({ assets, isLoading }) {
  const { format, convert } = useCurrency();

  const { chartData, totalConverted, topHoldings, remainderCount } = useMemo(() => {
    if (!Array.isArray(assets) || assets.length === 0) {
      return { chartData: [], totalConverted: 0, topHoldings: [], remainderCount: 0 };
    }

    const summary = summariseHoldings(assets);
    const primary = summary.slice(0, MAX_SLICES);
    const remainder = summary.slice(MAX_SLICES);

    const primaryWithConversion = primary.map((item) => ({
      ...item,
      valueConverted: convert(item.marketValue),
      gainLossConverted: convert(item.gainLoss),
    }));

    const remainderValueConverted = remainder.reduce((sum, item) => sum + convert(item.marketValue), 0);
    const remainderMarketValue = remainder.reduce((sum, item) => sum + (item.marketValue || 0), 0);

    const slices = [...primaryWithConversion];
    if (remainderValueConverted > 0) {
      slices.push({
        symbol: "Other",
        name: "Other holdings",
        valueConverted: remainderValueConverted,
        gainLossConverted: null,
        marketValue: remainderMarketValue,
        quantity: null,
        brokers: [],
        count: remainder.length,
        isOther: true,
      });
    }

    const totalConverted = slices.reduce((sum, item) => sum + item.valueConverted, 0);

    return {
      chartData: slices,
      totalConverted,
      topHoldings: primaryWithConversion,
      remainderCount: remainder.length,
    };
  }, [assets, convert]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-purple-900">Portfolio Breakdown</h2>
        <div className="neomorph rounded-2xl p-6 animate-pulse">
          <div className="h-64 bg-purple-200 rounded-lg mb-4"></div>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="h-4 bg-purple-200 rounded w-32"></div>
                <div className="h-4 bg-purple-200 rounded w-16"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-purple-900">Portfolio Breakdown</h2>
        <div className="neomorph rounded-2xl p-8 text-center">
          <p className="text-purple-700">No holdings available yet.</p>
        </div>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) {
      return null;
    }

    const data = payload[0].payload;
    const percentage = totalConverted > 0 ? ((data.valueConverted / totalConverted) * 100).toFixed(1) : "0.0";
    const label = data.symbol === "Other" ? data.name : `${data.symbol} - ${data.name}`;
    const holdingsCount = data.isOther ? remainderCount : data.count;

    return (
      <div className="neomorph rounded-xl p-3 bg-purple-100">
        <p className="font-semibold text-purple-900">{label}</p>
        <p className="text-purple-700">{format(data.valueConverted)}</p>
        <p className="text-purple-600 text-sm">{percentage}% {holdingsCount ? `- ${holdingsCount} positions` : ""}</p>
      </div>
    );
  };

  const otherSlice = chartData.find((item) => item.isOther);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-purple-900">Portfolio Breakdown</h2>
      <div className="neomorph rounded-2xl p-6">
        <div className="h-64 mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                outerRadius={80}
                innerRadius={50}
                paddingAngle={3}
                dataKey="valueConverted"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`portfolio-breakdown-${entry.symbol}-${index}`} fill={SLICE_COLORS[index % SLICE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="space-y-2">
          {topHoldings.map((holding, index) => {
            const percentage = totalConverted > 0 ? ((holding.valueConverted / totalConverted) * 100).toFixed(1) : "0.0";
            const gainLossPositive = (holding.gainLossConverted || 0) >= 0;
            const brokerLabel = holding.brokers.length > 1
              ? `${holding.brokers.length} brokers`
              : holding.brokers[0] || "Broker";

            return (
              <div key={holding.symbol} className="flex items-center justify-between py-2 border-b border-purple-200 last:border-b-0">
                <div className="flex items-center space-x-3">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: SLICE_COLORS[index % SLICE_COLORS.length] }}
                  ></div>
                  <div>
                    <p className="text-sm font-semibold text-purple-900">{holding.symbol}</p>
                    <p className="text-xs text-purple-600">{holding.name} - {brokerLabel}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-purple-900">{percentage}%</p>
                  <p className="text-xs text-purple-600">{format(holding.valueConverted)}</p>
                  <p className={`text-xs ${gainLossPositive ? "text-green-600" : "text-red-600"}`}>
                    {gainLossPositive ? "+" : "-"}{format(Math.abs(holding.gainLossConverted || 0))}
                  </p>
                </div>
              </div>
            );
          })}

          {otherSlice && (
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center space-x-3">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: SLICE_COLORS[(topHoldings.length) % SLICE_COLORS.length] }}
                ></div>
                <div>
                  <p className="text-sm font-semibold text-purple-900">Other holdings</p>
                  <p className="text-xs text-purple-600">{remainderCount} additional positions</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-purple-900">
                  {totalConverted > 0 ? ((otherSlice.valueConverted / totalConverted) * 100).toFixed(1) : "0.0"}%
                </p>
                <p className="text-xs text-purple-600">{format(otherSlice.valueConverted)}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


