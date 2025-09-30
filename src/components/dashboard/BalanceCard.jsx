import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { formatDistanceToNow } from 'date-fns';
import { useCurrency } from '@/context/CurrencyContext.jsx';

export default function BalanceCard({ totalValue, totalGainLoss, totalGainLossPercent, isLoading, lastUpdated }) {
  const { currency, format, cycleCurrency } = useCurrency();
  const isPositive = totalGainLoss >= 0;
  const hasData = totalValue > 0;

  if (isLoading && !lastUpdated) {
    return (
      <div className="neomorph rounded-3xl p-8 animate-pulse">
        <div className="h-6 bg-purple-200 rounded w-32 mb-4"></div>
        <div className="h-12 bg-purple-200 rounded w-48 mb-4"></div>
        <div className="h-5 bg-purple-200 rounded w-40"></div>
      </div>
    );
  }

  return (
    <div className="neomorph rounded-3xl p-8 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-400/10 to-purple-600/10 rounded-full transform translate-x-8 -translate-y-8"></div>

      <div className="flex justify-between items-start mb-2">
        <p className="text-purple-700 font-medium">Total Portfolio Value</p>
        {lastUpdated && (
          <p className="text-xs text-purple-600 opacity-75">
            Updated {formatDistanceToNow(new Date(lastUpdated), { addSuffix: true })}
          </p>
        )}
      </div>

      <div className="mb-6">
        {hasData ? (
          <button onClick={cycleCurrency} className="text-left group">
            <h1 className="text-4xl font-bold gradient-text mb-2 group-hover:scale-105 transition-transform duration-200">
              {format(totalValue)}
            </h1>
            <p className="text-xs text-purple-600 opacity-75">Tap to switch currency | {currency}</p>
          </button>
        ) : (
          <div className="text-center py-8">
            <h1 className="text-2xl font-bold text-purple-400 mb-2">No data available</h1>
            <p className="text-purple-600 text-sm">Add your first transaction to get started</p>
          </div>
        )}
      </div>

      {hasData && (
        <div className={`flex items-center transition-all duration-300 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
          {isPositive ? <TrendingUp className="w-5 h-5 mr-2" /> : <TrendingDown className="w-5 h-5 mr-2" />}
          <span className="font-semibold text-lg">
            {isPositive ? '+' : ''}{format(Math.abs(totalGainLoss))} ({isPositive ? '+' : ''}{totalGainLossPercent.toFixed(2)}%)
          </span>
          <span className="ml-2 text-purple-600 text-sm">All Time</span>
        </div>
      )}
    </div>
  );
}
