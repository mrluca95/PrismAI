import React from "react";
import { Filter } from "lucide-react";

export default function AssetFilters({ filters, onFilterChange, assets }) {
  const uniqueTypes = [...new Set(assets.map(asset => asset.type))];
  const uniqueBrokers = [...new Set(assets.map(asset => asset.broker))];

  return (
    <div className="neomorph rounded-2xl p-4">
      <div className="flex items-center mb-4">
        <Filter className="w-5 h-5 text-gray-600 mr-2" />
        <span className="font-semibold text-gray-800">Filters</span>
      </div>
      
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">Asset Type</label>
          <select
            value={filters.type}
            onChange={(e) => onFilterChange({ ...filters, type: e.target.value })}
            className="w-full neomorph-inset rounded-xl px-4 py-2 text-gray-800 bg-transparent"
          >
            <option value="all">All Types</option>
            {uniqueTypes.map(type => (
              <option key={type} value={type}>{type.toUpperCase()}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">Broker</label>
          <select
            value={filters.broker}
            onChange={(e) => onFilterChange({ ...filters, broker: e.target.value })}
            className="w-full neomorph-inset rounded-xl px-4 py-2 text-gray-800 bg-transparent"
          >
            <option value="all">All Brokers</option>
            {uniqueBrokers.map(broker => (
              <option key={broker} value={broker}>{broker}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">Sort By</label>
          <select
            value={filters.sortBy}
            onChange={(e) => onFilterChange({ ...filters, sortBy: e.target.value })}
            className="w-full neomorph-inset rounded-xl px-4 py-2 text-gray-800 bg-transparent"
          >
            <option value="market_value">Market Value</option>
            <option value="gain_loss">Total Gain/Loss</option>
            <option value="day_change">Day Change</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>
    </div>
  );
}