import React from "react";
import { Building2, Calendar, DollarSign, TrendingUp } from "lucide-react";
import { useCurrency } from "@/context/CurrencyContext.jsx";

export default function AssetInfo({ asset }) {
  const { format } = useCurrency();
  const infoItems = [
    {
      icon: Building2,
      label: "Broker",
      value: asset.broker
    },
    {
      icon: DollarSign,
      label: "Purchase Price",
      value: format(asset.purchase_price, { maximumFractionDigits: 2 })
    },
    {
      icon: TrendingUp,
      label: "Quantity",
      value: `${asset.quantity} shares`
    },
    {
      icon: Calendar,
      label: "Market Value",
      value: format(asset.market_value)
    }
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-800">Asset Information</h2>
      <div className="grid grid-cols-2 gap-4">
        {infoItems.map((item, index) => (
          <div key={index} className="neomorph rounded-2xl p-4">
            <div className="flex items-center space-x-3">
              <div className="neomorph rounded-xl p-2">
                <item.icon className="w-5 h-5 text-gray-700" />
              </div>
              <div>
                <p className="text-sm text-gray-600">{item.label}</p>
                <p className="font-semibold text-gray-800">{item.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}