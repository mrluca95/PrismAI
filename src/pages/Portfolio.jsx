import React, { useState, useEffect } from "react";
import { Asset } from "@/entities/all";
import AssetTypeChart from "@/components/portfolio/AssetTypeChart";
import SectorAllocation from "@/components/portfolio/SectorAllocation";
import BrokerAllocation from "@/components/portfolio/BrokerAllocation";
import PortfolioBreakdown from "@/components/portfolio/PortfolioBreakdown";
import CategoryDetailModal from "@/components/portfolio/CategoryDetailModal";
import HoldingsSection from "@/components/portfolio/HoldingsSection.jsx";

export default function Portfolio() {
  const [assets, setAssets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(null);

  useEffect(() => {
    loadAssets();
  }, []);

  const loadAssets = async () => {
    setIsLoading(true);
    const data = await Asset.list();
    setAssets(data);
    setIsLoading(false);
  };

  const handleCategorySelect = (category) => {
    setSelectedCategory(category);
  };

  return (
    <div className="min-h-screen p-4 space-y-6">
      <div className="pt-4 space-y-2">
        <h1 className="text-2xl font-bold text-purple-900">Portfolio Overview</h1>
        <p className="text-purple-700">Analyze your allocation, performance, and holdings in one place.</p>
      </div>

      <HoldingsSection assets={assets} isLoading={isLoading} onRefresh={loadAssets} />

      <AssetTypeChart assets={assets} isLoading={isLoading} onCategorySelect={handleCategorySelect} />
      <PortfolioBreakdown assets={assets} isLoading={isLoading} />
      <SectorAllocation assets={assets} isLoading={isLoading} />
      <BrokerAllocation assets={assets} isLoading={isLoading} />

      <CategoryDetailModal
        isOpen={!!selectedCategory}
        onClose={() => setSelectedCategory(null)}
        category={selectedCategory}
        assets={assets.filter((a) => a.type === selectedCategory)}
      />
    </div>
  );
}




