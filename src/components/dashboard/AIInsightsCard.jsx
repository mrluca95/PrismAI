
import React from "react";
import { Brain, AlertTriangle, Target, TrendingUp, RefreshCw } from "lucide-react";
import ReactMarkdown from 'react-markdown';

const insightIcons = {
  risk_alert: AlertTriangle,
  diversification: Target,
  opportunity: TrendingUp,
  market_trend: TrendingUp,
  rebalancing: RefreshCw
};

const insightColors = {
  risk_alert: "text-red-600",
  diversification: "text-blue-600",
  opportunity: "text-green-600",
  market_trend: "text-purple-600",
  rebalancing: "text-orange-600"
};

export default function AIInsightCard({ insight }) {
  const IconComponent = insightIcons[insight.type] || Brain;
  const colorClass = insightColors[insight.type] || "text-gray-600";

  return (
    <div className="neomorph rounded-2xl p-4 neomorph-hover transition-all duration-300 w-80 md:w-96 flex-shrink-0 flex flex-col">
      <div className="flex items-start space-x-4 flex-grow">
        <div className={`neomorph rounded-xl p-3 ${colorClass}`}>
          <IconComponent className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-800">{insight.title}</h3>
            {insight.priority === "high" && (
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
            )}
          </div>
          <div className="prose prose-sm max-w-none text-gray-600 leading-relaxed prose-a:text-purple-600 prose-a:font-semibold prose-strong:text-gray-800">
            <ReactMarkdown>{insight.description}</ReactMarkdown>
          </div>
        </div>
      </div>
      {insight.related_assets && insight.related_assets.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-300/50">
          {insight.related_assets.map((symbol) => (
            <span key={symbol} className="neomorph-inset px-3 py-1 text-xs font-medium text-gray-700 rounded-lg">
              {symbol}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
