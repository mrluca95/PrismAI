import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useCurrency } from "@/context/CurrencyContext.jsx";

const COLORS = ['#8b5cf6', '#a78bfa', '#c4b5fd', '#6d28d9', '#ddd6fe', '#5b21b6'];

export default function AssetTypeChart({ assets, isLoading, onCategorySelect }) {
  const { format, convert } = useCurrency();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-800">Asset Distribution</h2>
        <div className="neomorph rounded-2xl p-6 animate-pulse">
          <div className="h-64 bg-gray-300 rounded-lg"></div>
        </div>
      </div>
    );
  }

  const grouped = assets.reduce((acc, asset) => {
    const type = asset.type || 'unknown';
    const existing = acc.find((item) => item.name === type);

    if (existing) {
      existing.value += asset.market_value || 0;
      existing.assets += 1;
    } else {
      acc.push({
        name: type,
        value: asset.market_value || 0,
        assets: 1,
      });
    }

    return acc;
  }, []);

  const chartData = grouped.map((item) => ({
    ...item,
    valueConverted: convert(item.value),
  }));

  const totalConverted = chartData.reduce((sum, item) => sum + item.valueConverted, 0);

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const percentage = totalConverted > 0 ? ((data.valueConverted / totalConverted) * 100).toFixed(1) : 0;

      return (
        <div className="neomorph rounded-xl p-3 bg-purple-100">
          <p className="font-semibold text-purple-900 capitalize">{data.name}</p>
          <p className="text-purple-700">{format(data.valueConverted)}</p>
          <p className="text-xs text-purple-600">{percentage}% • {data.assets || 0} assets</p>
        </div>
      );
    }
    return null;
  };

  const handleSliceClick = (data) => {
    if (onCategorySelect && data && data.name) {
      onCategorySelect(data.name);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-purple-900">Asset Distribution</h2>
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
                    onClick={(data) => handleSliceClick(data)}
                    className="cursor-pointer"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {chartData.map((item, index) => {
                const percentage = totalConverted > 0 ? ((item.valueConverted / totalConverted) * 100).toFixed(1) : 0;
                return (
                  <div key={item.name} className="flex items-center space-x-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    ></div>
                    <span className="text-sm text-purple-800 capitalize">
                      {item.name} ({percentage}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <p className="text-purple-700">No assets to display</p>
          </div>
        )}
      </div>
    </div>
  );
}
