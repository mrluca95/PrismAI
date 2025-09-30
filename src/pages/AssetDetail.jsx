import React, { useState, useEffect } from "react";
import { Asset } from "@/entities/all";
import { ArrowLeft, TrendingUp, TrendingDown, Briefcase } from "lucide-react";
import { useCurrency } from "@/context/CurrencyContext.jsx";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import AssetChart from "../components/assets/AssetChart";
import AssetInfo from "../components/assets/AssetInfo";
import AssetAIAnalysis from "../components/assets/AssetAIAnalysis";

export default function AssetDetail() {
  const [aggregatedAsset, setAggregatedAsset] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const { format } = useCurrency();
  const navigate = useNavigate();

  const aggregateAssets = (assets) => {
    if (!assets || assets.length === 0) return null;

    const first = assets[0];
    const aggregated = {
      symbol: first.symbol,
      name: first.name,
      type: first.type,
      current_price: first.current_price,
      brokers: [],
      quantity: 0,
      market_value: 0,
      total_purchase_cost: 0,
      gain_loss: 0,
      day_change: 0,
      raw_assets: assets
    };

    assets.forEach(asset => {
      aggregated.brokers.push(asset.broker);
      aggregated.quantity += asset.quantity;
      aggregated.market_value += asset.market_value;
      aggregated.total_purchase_cost += asset.purchase_price * asset.quantity;
      aggregated.gain_loss += asset.gain_loss;
      aggregated.day_change += asset.day_change;
    });

    const avg_purchase_price = aggregated.total_purchase_cost / aggregated.quantity;
    aggregated.gain_loss_percent = aggregated.total_purchase_cost > 0 ? (aggregated.gain_loss / aggregated.total_purchase_cost) * 100 : 0;
    aggregated.purchase_price = isNaN(avg_purchase_price) ? 0 : avg_purchase_price;
    
    return aggregated;
  };


  useEffect(() => {
    const loadAsset = async () => {
      setIsLoading(true);
      const urlParams = new URLSearchParams(window.location.search);
      const symbol = urlParams.get('symbol');
      
      if (symbol) {
        const assets = await Asset.filter({ symbol });
        if (assets.length > 0) {
          const aggAsset = aggregateAssets(assets);
          setAggregatedAsset(aggAsset);
        }
      }
      setIsLoading(false);
    };
    loadAsset();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen p-4 space-y-6">
        <div className="pt-4 animate-pulse">
          <div className="h-8 bg-gray-300 rounded w-48 mb-4"></div>
          <div className="h-32 bg-gray-300 rounded-2xl mb-6"></div>
          <div className="h-48 bg-gray-300 rounded-2xl"></div>
        </div>
      </div>
    );
  }

  if (!aggregatedAsset) {
    return (
      <div className="min-h-screen p-4 flex items-center justify-center">
        <div className="neomorph rounded-2xl p-8 text-center">
          <p className="text-gray-600">Asset not found</p>
        </div>
      </div>
    );
  }
  
  const asset = aggregatedAsset; // Use aggregated asset for display
  const isPositive = (asset.gain_loss || 0) >= 0;

  return (
    <div className="min-h-screen p-4 space-y-6">
      {/* Header */}
      <div className="pt-4">
        <button
          onClick={() => navigate(createPageUrl("Portfolio"))}
          className="neomorph rounded-xl p-3 mb-4 neomorph-hover transition-all duration-300"
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>

        <div className="neomorph rounded-2xl p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">{asset.symbol}</h1>
              <p className="text-gray-600">{asset.name}</p>
              <p className="text-sm text-gray-500 capitalize">{asset.type} | {asset.brokers.length > 1 ? `${asset.brokers.length} Brokers` : asset.brokers[0]}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-gray-800">
                {format(asset.current_price, { maximumFractionDigits: 2 })}
              </p>
              <div className={`flex items-center justify-end ${
                isPositive ? 'text-green-600' : 'text-red-600'
              }`}>
                {isPositive ? (
                  <TrendingUp className="w-4 h-4 mr-1" />
                ) : (
                  <TrendingDown className="w-4 h-4 mr-1" />
                )}
                <span className="font-medium">
                  {isPositive ? '+' : ''}{format(Math.abs(asset.gain_loss), { maximumFractionDigits: 2 })} 
                  ({isPositive ? '+' : ''}{(asset.gain_loss_percent || 0).toFixed(2)}%)
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Broker Breakdown */}
      {asset.raw_assets.length > 1 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-800">Broker Breakdown</h2>
          <div className="neomorph rounded-2xl p-6 space-y-4">
            {asset.raw_assets.map(rawAsset => (
              <div key={rawAsset.id} className="flex justify-between items-center py-2 border-b border-gray-300/50 last:border-0">
                <div className="flex items-center">
                  <Briefcase className="w-5 h-5 text-gray-600 mr-3"/>
                  <div>
                    <p className="font-semibold text-gray-800">{rawAsset.broker}</p>
                    <p className="text-sm text-gray-600">{rawAsset.quantity} shares</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-800">{format(rawAsset.market_value)}</p>
                  <p className={`text-sm ${rawAsset.gain_loss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {rawAsset.gain_loss >= 0 ? '+' : ''}{format(Math.abs(rawAsset.gain_loss), { maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Asset Chart */}
      <AssetChart asset={asset} />

      {/* Asset Information */}
      <AssetInfo asset={asset} />

      {/* AI Analysis */}
      <AssetAIAnalysis asset={asset} />
    </div>
  );
}
