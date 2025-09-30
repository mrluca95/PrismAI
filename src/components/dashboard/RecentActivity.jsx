import React from "react";
import { Clock } from "lucide-react";
import { useCurrency } from "@/context/CurrencyContext.jsx";

export default function RecentActivity({ assets, isLoading }) {
  const { format } = useCurrency();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-800">Recent Activity</h2>
        <div className="neomorph rounded-2xl p-4 animate-pulse">
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex justify-between items-center">
                <div className="h-4 bg-gray-300 rounded w-1/2"></div>
                <div className="h-4 bg-gray-300 rounded w-1/4"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const activeAssets = assets
    .filter((asset) => asset.day_change !== 0)
    .sort((a, b) => Math.abs(b.day_change || 0) - Math.abs(a.day_change || 0))
    .slice(0, 5);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-800">Recent Activity</h2>
      <div className="neomorph rounded-2xl p-4">
        <div className="flex items-center mb-4">
          <Clock className="w-5 h-5 text-gray-600 mr-2" />
          <span className="text-gray-600 font-medium">Most Active Today</span>
        </div>

        {activeAssets.length > 0 ? (
          <div className="space-y-3">
            {activeAssets.map((asset) => (
              <div key={asset.id} className="flex justify-between items-center py-2">
                <div>
                  <p className="font-medium text-gray-800">{asset.symbol}</p>
                  <p className="text-xs text-gray-600">{asset.name}</p>
                </div>
                <div className="text-right">
                  <p className={`font-semibold ${(asset.day_change || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {(asset.day_change || 0) >= 0 ? '+' : ''}{format(Math.abs(asset.day_change))}
                  </p>
                  <p className="text-xs text-gray-600">
                    {(asset.day_change_percent || 0) >= 0 ? '+' : ''}{asset.day_change_percent?.toFixed(2)}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-600 text-center py-4">No activity to display</p>
        )}
      </div>
    </div>
  );
}
