import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useCurrency } from "@/context/CurrencyContext.jsx";

const SECTOR_COLORS = ["#8b5cf6", "#a78bfa", "#c4b5fd", "#6d28d9", "#ddd6fe", "#5b21b6", "#7c3aed", "#9f7aea"];

const FALLBACK_SECTOR_BY_SYMBOL = {
  AAPL: "Technology",
  MSFT: "Technology",
  NVDA: "Technology",
  TSLA: "Consumer Discretionary",
  AMZN: "Consumer Discretionary",
  META: "Communication Services",
  GOOG: "Communication Services",
  GOOGL: "Communication Services",
  NFLX: "Communication Services",
  JPM: "Financial Services",
  BAC: "Financial Services",
  V: "Financial Services",
  MA: "Financial Services",
  XOM: "Energy",
  CVX: "Energy",
  VOO: "Broad Market ETF",
  SPY: "Broad Market ETF",
  QQQ: "Technology",
  GLD: "Commodities",
  BTC: "Digital Assets",
  ETH: "Digital Assets",
  BND: "Fixed Income",
};

const FALLBACK_SECTOR_BY_TYPE = {
  crypto: "Digital Assets",
  bond: "Fixed Income",
  mutual_fund: "Mutual Funds",
  cash: "Cash & Equivalents",
  etf: "Exchange Traded Funds",
};

const ETF_SECTOR_BREAKDOWN = {
  VOO: {
    Technology: 0.28,
    "Healthcare": 0.13,
    "Financial Services": 0.12,
    "Consumer Discretionary": 0.10,
    Industrials: 0.08,
    "Communication Services": 0.08,
    "Consumer Staples": 0.06,
    Energy: 0.04,
    Utilities: 0.03,
    "Real Estate": 0.03,
    Materials: 0.03,
  },
  SPY: {
    Technology: 0.28,
    "Healthcare": 0.13,
    "Financial Services": 0.12,
    "Consumer Discretionary": 0.10,
    Industrials: 0.08,
    "Communication Services": 0.08,
    "Consumer Staples": 0.06,
    Energy: 0.04,
    Utilities: 0.03,
    "Real Estate": 0.03,
    Materials: 0.03,
  },
  VTI: {
    Technology: 0.26,
    "Healthcare": 0.14,
    "Financial Services": 0.12,
    "Consumer Discretionary": 0.11,
    Industrials: 0.10,
    "Communication Services": 0.08,
    "Consumer Staples": 0.06,
    Energy: 0.04,
    Utilities: 0.03,
    Materials: 0.03,
    "Real Estate": 0.03,
  },
  QQQ: {
    Technology: 0.57,
    "Consumer Discretionary": 0.17,
    "Communication Services": 0.15,
    "Healthcare": 0.05,
    Industrials: 0.03,
    "Consumer Staples": 0.03,
  },
  ARKK: {
    Technology: 0.45,
    "Healthcare": 0.23,
    "Communication Services": 0.11,
    Industrials: 0.09,
    "Consumer Discretionary": 0.07,
    "Financial Services": 0.05,
  },
};

const normalizeDirectSector = (value) => {
  const trimmed = (value || "").toString().trim();
  if (!trimmed) {
    return null;
  }

  return trimmed
    .replace(/\s+/g, " ")
    .split(" ")
    .map((part) => {
      if (part.length <= 3) {
        return part.toUpperCase();
      }
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
};

const pickSectorFromRawAssets = (rawAssets) => {
  if (!Array.isArray(rawAssets)) {
    return null;
  }

  const match = rawAssets.find((entry) => typeof entry?.sector === "string" && entry.sector.trim().length > 0);
  return match ? normalizeDirectSector(match.sector) : null;
};

const inferSector = (asset = {}) => {
  const directSector =
    normalizeDirectSector(asset.sector) ||
    normalizeDirectSector(asset.sector_name) ||
    normalizeDirectSector(asset.details?.sector) ||
    normalizeDirectSector(asset.metadata?.sector) ||
    normalizeDirectSector(asset.profile?.sector) ||
    pickSectorFromRawAssets(asset.raw_assets);

  if (directSector) {
    return directSector;
  }

  const symbol = (asset.symbol || "").toUpperCase();
  if (symbol && FALLBACK_SECTOR_BY_SYMBOL[symbol]) {
    return FALLBACK_SECTOR_BY_SYMBOL[symbol];
  }

  const type = (asset.type || "").toLowerCase();
  if (type && FALLBACK_SECTOR_BY_TYPE[type]) {
    return FALLBACK_SECTOR_BY_TYPE[type];
  }

  return "Other";
};

const addContribution = (map, sector, amount, symbol) => {
  const name = sector || "Other";
  if (!map.has(name)) {
    map.set(name, { name, value: 0, symbols: new Set() });
  }
  const entry = map.get(name);
  entry.value += amount;
  if (symbol) {
    entry.symbols.add(symbol);
  }
};

export default function SectorAllocation({ assets, isLoading }) {
  const { format, convert } = useCurrency();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-purple-900">Sector Allocation</h2>
        <div className="neomorph rounded-2xl p-6 animate-pulse">
          <div className="h-64 bg-purple-200 rounded-lg"></div>
        </div>
      </div>
    );
  }

  const sectorTotals = assets.reduce((acc, asset = {}) => {
    const marketValue = Number(asset.market_value) || 0;
    if (marketValue <= 0) {
      return acc;
    }

    const symbol = (asset.symbol || "").toUpperCase();
    const breakdown = ETF_SECTOR_BREAKDOWN[symbol];

    if ((asset.type || "").toLowerCase() === "etf" && breakdown) {
      let distributed = 0;
      Object.entries(breakdown).forEach(([sectorName, weight]) => {
        const normalizedWeight = Math.max(Number(weight) || 0, 0);
        if (normalizedWeight <= 0) {
          return;
        }
        const contribution = marketValue * normalizedWeight;
        if (contribution <= 0) {
          return;
        }
        addContribution(acc, sectorName, contribution, symbol);
        distributed += contribution;
      });

      const remainder = marketValue - distributed;
      if (remainder > 0.01) {
        addContribution(acc, inferSector(asset), remainder, symbol);
      }
      return acc;
    }

    addContribution(acc, inferSector(asset), marketValue, symbol);
    return acc;
  }, new Map());

  const rawEntries = Array.from(sectorTotals.values()).map((entry) => ({
    name: entry.name,
    value: entry.value,
    assets: entry.symbols.size,
  }));
  const hasPositiveValues = rawEntries.some((item) => item.value > 0);
  const sourceData = hasPositiveValues ? rawEntries.filter((item) => item.value > 0) : rawEntries;

  const chartData = sourceData
    .map((item) => ({
      ...item,
      valueConverted: convert(item.value),
    }))
    .sort((a, b) => b.valueConverted - a.valueConverted);

  const totalConverted = chartData.reduce((sum, item) => sum + item.valueConverted, 0);

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const percentage = totalConverted > 0 ? ((data.valueConverted / totalConverted) * 100).toFixed(1) : 0;
      const holdingsLabel = data.assets === 1 ? "holding" : "holdings";

      return (
        <div className="neomorph rounded-xl p-3 bg-purple-100">
          <p className="font-semibold text-purple-900">{data.name}</p>
          <p className="text-purple-700">{format(data.valueConverted)}</p>
          <p className="text-purple-600 text-sm">{percentage}% - {data.assets} {holdingsLabel}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-purple-900">Sector Allocation</h2>
      <div className="neomorph rounded-2xl p-6">
        {chartData.length > 0 ? (
          <>
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
                      <Cell key={`cell-${index}`} fill={SECTOR_COLORS[index % SECTOR_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {chartData.map((item, index) => {
                const percentage = totalConverted > 0 ? ((item.valueConverted / totalConverted) * 100).toFixed(1) : 0;
                const holdingsLabel = item.assets === 1 ? "holding" : "holdings";
                return (
                  <div key={item.name} className="flex items-center justify-between py-2 border-b border-purple-200 last:border-b-0">
                    <div className="flex items-center space-x-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: SECTOR_COLORS[index % SECTOR_COLORS.length] }}
                      ></div>
                      <span className="text-sm text-purple-800 font-medium">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-semibold text-purple-900">{percentage}%</span>
                      <p className="text-xs text-purple-600">
                        {format(item.valueConverted)} - {item.assets} {holdingsLabel}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <p className="text-purple-700">No sector data available</p>
          </div>
        )}
      </div>
    </div>
  );
}
