import React from "react";
import { useCurrency } from "@/context/CurrencyContext.jsx";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function AssetChart({ asset }) {
  const { format, convert } = useCurrency();
  // Generate mock historical data for demonstration
  const generateHistoricalData = () => {
    const data = [];
    const currentPrice = asset.current_price || 0;
    const purchasePrice = asset.purchase_price || 0;
    const priceRange = Math.abs(currentPrice - purchasePrice);
    
    for (let i = 30; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      // Generate realistic price movement
      const volatility = 0.02; // 2% daily volatility
      const trend = (currentPrice - purchasePrice) / 30; // gradual trend
      const randomChange = (Math.random() - 0.5) * volatility * purchasePrice;
      const basePrice = purchasePrice + (trend * (30 - i));
      const price = Math.max(basePrice + randomChange, 0.01);
      
      data.push({
        date: date.toISOString().split('T')[0],
        price: parseFloat(price.toFixed(2)),
        priceConverted: convert(price),
        displayDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      });
    }
    
    // Ensure the last price matches current price
    data[data.length - 1].price = currentPrice;
    data[data.length - 1].priceConverted = convert(currentPrice);
    
    return data;
  };

  const historicalData = generateHistoricalData();
  const isPositive = (asset.gain_loss || 0) >= 0;

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="neomorph rounded-xl p-3 bg-gray-200">
          <p className="font-semibold text-gray-800">{data.displayDate}</p>
          <p className="text-gray-600">{format(data.price)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-800">Price History (30 Days)</h2>
      <div className="neomorph rounded-2xl p-6">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={historicalData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" />
              <XAxis 
                dataKey="displayDate" 
                stroke="#6b7280"
                fontSize={12}
              />
              <YAxis 
                stroke="#6b7280"
                fontSize={12}
                tickFormatter={(value) => format(value, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line 
                type="monotone" 
                dataKey="price" 
                stroke={isPositive ? "#10b981" : "#ef4444"}
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 6, fill: isPositive ? "#10b981" : "#ef4444" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}