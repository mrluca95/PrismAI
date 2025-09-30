import React from "react";
import { TrendingUp, TrendingDown, DollarSign, Activity } from "lucide-react";
import { useCurrency } from "@/context/CurrencyContext.jsx";

export default function QuickStats({ assets, isLoading }) {
  const { format } = useCurrency();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-800">Quick Stats</h2>
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="neomorph rounded-2xl p-4 animate-pulse">
              <div className="h-4 bg-gray-300 rounded w-3/4 mb-2"></div>
              <div className="h-6 bg-gray-300 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const gainers = assets.filter((asset) => (asset.day_change || 0) > 0).length;
  const losers = assets.filter((asset) => (asset.day_change || 0) < 0).length;
  const dayChange = assets.reduce((sum, asset) => sum + (asset.day_change || 0), 0);
  const bestPerformer = assets.reduce(
    (best, asset) =>
      (asset.gain_loss_percent || 0) > (best.gain_loss_percent || 0) ? asset : best,
    assets[0] || {},
  );

  const stats = [
    {
      title: "Today's Gainers",
      value: gainers,
      icon: TrendingUp,
      color: "text-green-600",
    },
    {
      title: "Today's Losers",
      value: losers,
      icon: TrendingDown,
      color: "text-red-600",
    },
    {
      title: "Day Change",
      value: format(dayChange),
      icon: DollarSign,
      color: dayChange >= 0 ? "text-green-600" : "text-red-600",
    },
    {
      title: "Best Performer",
      value: bestPerformer.symbol || "N/A",
      icon: Activity,
      color: "text-purple-600",
    },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-800">Quick Stats</h2>
      <div className="grid grid-cols-2 gap-4">
        {stats.map((stat) => (
          <div key={stat.title} className="neomorph rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <p className="text-xs text-gray-600 mb-1">{stat.title}</p>
            <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
