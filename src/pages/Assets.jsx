import React, { useState, useEffect, useCallback } from "react";
import { Asset } from "@/entities/Asset";
import { createPageUrl } from "@/utils";
import { useNavigate } from "react-router-dom";
import { Edit, Filter, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { InvokeLLM } from "@/integrations/Core";
import AssetCard from "../components/assets/AssetCard";
import AssetFilters from "../components/assets/AssetFilters";
import AssetManagement from "../components/assets/AssetManagement";

export default function Assets() {
  const [rawAssets, setRawAssets] = useState([]);
  const [aggregatedAssets, setAggregatedAssets] = useState([]);
  const [filteredAssets, setFilteredAssets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showManagement, setShowManagement] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [marketStatusData, setMarketStatusData] = useState({});
  const [isFetchingMarketStatus, setIsFetchingMarketStatus] = useState(false);
  const [filters, setFilters] = useState({
    type: "all",
    broker: "all",
    sortBy: "market_value"
  });
  const navigate = useNavigate();

  const aggregateAssets = useCallback((assets) => {
    const assetMap = new Map();

    assets.forEach(asset => {
      if (!assetMap.has(asset.symbol)) {
        assetMap.set(asset.symbol, {
          symbol: asset.symbol,
          name: asset.name,
          type: asset.type,
          current_price: asset.current_price,
          brokers: [],
          quantity: 0,
          market_value: 0,
          total_purchase_cost: 0,
          gain_loss: 0,
          day_change: 0,
          raw_assets: []
        });
      }

      const aggregated = assetMap.get(asset.symbol);
      aggregated.brokers.push(asset.broker);
      aggregated.quantity += asset.quantity;
      aggregated.market_value += asset.market_value;
      aggregated.total_purchase_cost += asset.purchase_price * asset.quantity;
      aggregated.gain_loss += asset.gain_loss;
      aggregated.day_change += asset.day_change;
      aggregated.raw_assets.push(asset);
    });

    return Array.from(assetMap.values()).map(agg => {
      const avg_purchase_price = agg.total_purchase_cost / agg.quantity;
      agg.gain_loss_percent = agg.total_purchase_cost > 0 ? (agg.gain_loss / agg.total_purchase_cost) * 100 : 0;
      agg.purchase_price = isNaN(avg_purchase_price) ? 0 : avg_purchase_price;
      return agg;
    });
  }, []);

  const loadAssets = useCallback(async () => {
    setIsLoading(true);
    const data = await Asset.list();
    setRawAssets(data);
    const aggregated = aggregateAssets(data);
    setAggregatedAssets(aggregated);
    setIsLoading(false);
  }, [aggregateAssets]);

  const fetchMarketStatusForSymbol = useCallback(async (symbol, type) => {
    try {
      const prompt = `For the asset symbol ${symbol} (type: ${type}), what is its current market status (open/closed) and, if closed, what is the next upcoming opening time? Provide the response ONLY in JSON format:
        {
          "status": "open" | "closed",
          "next_opening_time": "YYYY-MM-DDTHH:MM:SSZ" | null,
          "exchange_name": "NYSE" | "NASDAQ" | "Binance" | null
        }
        If you cannot determine the opening time, return null for "next_opening_time". The "exchange_name" should be the primary exchange.`;

      const response = await InvokeLLM({
        prompt: prompt,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["open", "closed"] },
            next_opening_time: { type: "string", nullable: true },
            exchange_name: { type: "string", nullable: true }
          },
          required: ["status"]
        }
      });
      return { symbol, data: response };
    } catch (error) {
      console.error(`Failed to fetch market status for ${symbol}:`, error);
      return { symbol, data: { status: "unknown", next_opening_time: null, exchange_name: null } };
    }
  }, []);

  const loadMarketStatuses = useCallback(async () => {
    if (aggregatedAssets.length === 0) return;
    setIsFetchingMarketStatus(true);

    const uniqueSymbols = [...new Set(aggregatedAssets.map(asset => asset.symbol))];
    const statusPromises = uniqueSymbols.map(symbol => {
      const assetType = aggregatedAssets.find(asset => asset.symbol === symbol)?.type;
      return fetchMarketStatusForSymbol(symbol, assetType);
    });

    const results = await Promise.all(statusPromises);
    const newMarketStatusData = Object.fromEntries(results.map(res => [res.symbol, res.data]));
    setMarketStatusData(newMarketStatusData);
    setIsFetchingMarketStatus(false);
  }, [aggregatedAssets, fetchMarketStatusForSymbol]);

  const applyFilters = useCallback(() => {
    let filtered = [...aggregatedAssets];

    if (filters.type !== "all") {
      filtered = filtered.filter(asset => asset.type === filters.type);
    }

    if (filters.broker !== "all") {
      filtered = filtered.filter(asset => asset.brokers.includes(filters.broker));
    }

    filtered.sort((a, b) => {
      switch (filters.sortBy) {
        case "gain_loss":
          return (b.gain_loss || 0) - (a.gain_loss || 0);
        case "day_change":
          return (b.day_change || 0) - (a.day_change || 0);
        case "name":
          return a.name.localeCompare(b.name);
        default: // market_value
          return (b.market_value || 0) - (a.market_value || 0);
      }
    });

    setFilteredAssets(filtered);
  }, [aggregatedAssets, filters]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  useEffect(() => {
    if (aggregatedAssets.length > 0) {
      loadMarketStatuses();
    }
  }, [aggregatedAssets, loadMarketStatuses]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  const handleAssetClick = (asset) => {
    navigate(`${createPageUrl("AssetDetail")}?symbol=${asset.symbol}`);
  };

  return (
    <div className="min-h-screen p-4 space-y-6">
      {/* Header */}
      <div className="pt-4">
        <div className="flex justify-between items-center mb-2">
          <h1 className="text-2xl font-bold text-gray-800">Assets</h1>
          <button
            onClick={() => setShowManagement(!showManagement)}
            className="neomorph rounded-xl p-3 neomorph-hover transition-all duration-300"
          >
            <Edit className="w-5 h-5 text-gray-700" />
          </button>
        </div>
        <p className="text-gray-600">
          {showManagement ? "Edit and manage your assets" : "View and analyze individual assets"}
        </p>
      </div>

      {showManagement ? (
        <AssetManagement assets={rawAssets} onAssetsChange={loadAssets} />
      ) : (
        <>
          {/* Filters Toggle */}
          <div className="flex justify-end">
            <button
              onClick={() => setIsFiltersOpen(!isFiltersOpen)}
              className="neomorph rounded-xl px-4 py-3 neomorph-hover transition-all duration-300 flex items-center space-x-2"
            >
              <Filter className="w-5 h-5 text-gray-700" />
              <span className="text-sm font-medium text-gray-800">Filter & Sort</span>
              <ChevronDown 
                className={`w-5 h-5 text-gray-700 transition-transform duration-300 ${isFiltersOpen ? 'rotate-180' : ''}`}
              />
            </button>
          </div>

          {/* Collapsible Filters Section */}
          <AnimatePresence>
            {isFiltersOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="mb-6">
                  <AssetFilters 
                    filters={filters}
                    onFilterChange={setFilters}
                    assets={rawAssets}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Asset Grid */}
          <div className="space-y-3">
            {isLoading ? (
              Array(6).fill(0).map((_, i) => (
                <div key={i} className="neomorph rounded-2xl p-4 animate-pulse">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="h-5 bg-gray-300 rounded w-24 mb-2"></div>
                      <div className="h-4 bg-gray-300 rounded w-32"></div>
                    </div>
                    <div className="text-right">
                      <div className="h-5 bg-gray-300 rounded w-20 mb-1"></div>
                      <div className="h-4 bg-gray-300 rounded w-16"></div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              filteredAssets.map((asset) => (
                <AssetCard 
                  key={asset.symbol} 
                  asset={asset} 
                  onClick={() => handleAssetClick(asset)}
                  marketStatusInfo={marketStatusData[asset.symbol]}
                  isFetchingMarketStatus={isFetchingMarketStatus}
                />
              ))
            )}
          </div>

          {filteredAssets.length === 0 && !isLoading && (
            <div className="neomorph rounded-2xl p-8 text-center">
              <p className="text-gray-600">No assets match your current filters</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}