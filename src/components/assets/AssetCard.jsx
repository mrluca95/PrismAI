import React from "react";
import { TrendingUp, TrendingDown, CircleDot, Clock } from "lucide-react";
import moment from "moment";
import { useCurrency } from '@/context/CurrencyContext.jsx';

const assetTypeColors = {
  stock: "bg-blue-100 text-blue-800",
  etf: "bg-green-100 text-green-800",
  crypto: "bg-purple-100 text-purple-800",
  bond: "bg-yellow-100 text-yellow-800",
  mutual_fund: "bg-indigo-100 text-indigo-800",
};

export default function AssetCard({ asset, onClick, marketStatusInfo, isFetchingMarketStatus }) {
  const { format } = useCurrency();
  const isPositive = (asset.gain_loss || 0) >= 0;

  const getBrokerDisplay = () => {
    if (asset.brokers?.length > 1) {
      return `Multiple Brokers (${asset.brokers.length})`;
    }
    return asset.broker || asset.brokers?.[0] || 'N/A';
  };

  const formatOpeningTime = (nextOpeningTime) => {
    if (!nextOpeningTime) return null;
    const openTime = moment(nextOpeningTime);
    const now = moment();

    if (openTime.isSame(now, 'day')) {
      return `${openTime.format('h:mm A')}`;
    } else if (openTime.isSame(now.clone().add(1, 'day'), 'day')) {
      return `Tomorrow ${openTime.format('h:mm A')}`;
    } else {
      return openTime.format('MMM D, h:mm A');
    }
  };

  return (
    <div
      onClick={onClick}
      className="neomorph rounded-2xl p-4 neomorph-hover transition-all duration-300 cursor-pointer"
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-1">
            <h3 className="font-bold text-gray-800">{asset.symbol}</h3>
            <span className={`px-2 py-1 text-xs font-medium rounded-lg ${assetTypeColors[asset.type]}`}>
              {asset.type.toUpperCase()}
            </span>
          </div>
          <p className="text-gray-600 text-sm">{asset.name}</p>
          <p className="text-gray-500 text-xs">{getBrokerDisplay()}</p>
        </div>

        <div className="text-right">
          {marketStatusInfo && marketStatusInfo.status !== "unknown" && (
            <div className="flex items-center justify-end mb-1">
              {marketStatusInfo.status === "open" && (
                <span className="flex items-center text-green-600 text-xs font-medium">
                  <CircleDot className="w-3 h-3 mr-1 fill-current" />
                  Open
                </span>
              )}
              {marketStatusInfo.status === "closed" && (
                <span className="flex items-center text-orange-600 text-xs font-medium">
                  <Clock className="w-3 h-3 mr-1" />
                  {marketStatusInfo.next_opening_time ?
                    `Opens ${formatOpeningTime(marketStatusInfo.next_opening_time)}` :
                    'Closed'
                  }
                </span>
              )}
            </div>
          )}
          {marketStatusInfo && marketStatusInfo.status === "unknown" && (
            <div className="flex items-center justify-end mb-1">
              <span className="flex items-center text-gray-500 text-xs font-medium">
                <Clock className="w-3 h-3 mr-1" />
                Status Unknown
              </span>
            </div>
          )}
          {isFetchingMarketStatus && !marketStatusInfo && (
            <div className="h-4 bg-gray-300 rounded w-16 mb-1 animate-pulse"></div>
          )}

          <p className="font-bold text-gray-800">{format(asset.market_value)}</p>
          <p className={`text-sm font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {isPositive ? '+' : ''}{format(Math.abs(asset.gain_loss), { maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-600">
          {asset.quantity} shares @ {format(asset.current_price, { maximumFractionDigits: 2 })}
        </div>

        <div className={`flex items-center ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
          {isPositive ? (
            <TrendingUp className="w-4 h-4 mr-1" />
          ) : (
            <TrendingDown className="w-4 h-4 mr-1" />
          )}
          <span className="text-sm font-medium">
            {isPositive ? '+' : ''}{(asset.gain_loss_percent || 0).toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  );
}
