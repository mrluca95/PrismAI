import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useCurrency } from "@/context/CurrencyContext.jsx";

export default function BrokerAllocation({ assets, isLoading }) {
  const { format, convert } = useCurrency();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-800">Broker Allocation</h2>
        <div className="neomorph rounded-2xl p-6 animate-pulse">
          <div className="h-64 bg-gray-300 rounded-lg"></div>
        </div>
      </div>
    );
  }

  const brokerData = assets.reduce((acc, asset) => {
    const broker = asset.broker || 'Unknown';
    const existing = acc.find((item) => item.name === broker);

    if (existing) {
      existing.value += asset.market_value || 0;
      existing.assets += 1;
    } else {
      acc.push({
        name: broker,
        value: asset.market_value || 0,
        assets: 1,
      });
    }

    return acc;
  }, []);

  brokerData.sort((a, b) => b.value - a.value);

  const chartData = brokerData.map((item) => ({
    ...item,
    valueConverted: convert(item.value),
  }));

  const totalConverted = chartData.reduce((sum, item) => sum + item.valueConverted, 0);

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const percentage = totalConverted > 0 ? ((data.valueConverted / totalConverted) * 100).toFixed(1) : 0;

      return (
        <div className="neomorph rounded-xl p-3 bg-gray-200">
          <p className="font-semibold text-gray-800">{label}</p>
          <p className="text-gray-600">{format(data.valueConverted)}</p>
          <p className="text-gray-600">{percentage}% ({data.assets} assets)</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-800">Broker Allocation</h2>
      <div className="neomorph rounded-2xl p-6">
        {chartData.length > 0 ? (
          <>
            <div className="h-64 mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" />
                  <XAxis
                    dataKey="name"
                    stroke="#6b7280"
                    fontSize={12}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis
                    stroke="#6b7280"
                    fontSize={12}
                    tickFormatter={(value) => format(value, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="valueConverted" fill="url(#gradient)" radius={[4, 4, 0, 0]} />
                  <defs>
                    <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#667eea" stopOpacity={0.9} />
                      <stop offset="95%" stopColor="#764ba2" stopOpacity={0.7} />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-2">
              {chartData.map((item) => {
                const percentage = totalConverted > 0 ? ((item.valueConverted / totalConverted) * 100).toFixed(1) : 0;
                return (
                  <div key={item.name} className="flex justify-between items-center py-2 border-b border-gray-300 last:border-b-0">
                    <div>
                      <p className="font-medium text-gray-800">{item.name}</p>
                      <p className="text-xs text-gray-600">{item.assets} assets</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-800">{format(item.valueConverted)}</p>
                      <p className="text-xs text-gray-600">{percentage}%</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-600">No broker data to display</p>
          </div>
        )}
      </div>
    </div>
  );
}
