
import React, { useState, useEffect, useCallback } from 'react';
import { Transaction } from '@/entities/Transaction';
import { Asset } from '@/entities/Asset';
import { FetchPriceDetails } from '@/integrations/Core';
import { Loader2, Search } from 'lucide-react';
import { debounce } from 'lodash';
import AutocompleteInput from '../ui/AutocompleteInput';
import { useCurrency } from '@/context/CurrencyContext.jsx';

// Popular stock symbols for autocompletion
const POPULAR_SYMBOLS = [
  'AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX', 'BTC', 'ETH',
  'SPY', 'QQQ', 'VOO', 'VTI', 'BND', 'GLD', 'SLV', 'COIN', 'AMD', 'INTC',
  'JPM', 'BAC', 'WMT', 'PG', 'JNJ', 'KO', 'PEP', 'DIS', 'V', 'MA'
];

export default function TransactionForm({ assets, onSuccess, onCancel }) {
  const { format } = useCurrency();
  const [formData, setFormData] = useState({
    asset_symbol: '',
    type: 'buy',
    quantity: '',
    date: new Date().toISOString().split('T')[0], // YYYY-MM-DD format
    broker: '' // Initialize broker to empty for autocompletion
  });
  const [fetchedAssetInfo, setFetchedAssetInfo] = useState({ 
    historical_price: '', 
    current_price: '', 
    name: '', 
    type: '' 
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [isFetchingPrice, setIsFetchingPrice] = useState(false);
  const [priceError, setPriceError] = useState('');
  const [symbolSuggestions, setSymbolSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const uniqueBrokers = [...new Set(assets.map(asset => asset.broker))];
  
  // Get all unique symbols from existing assets plus popular ones
  const allSymbols = [...new Set([
    ...assets.map(asset => asset.symbol),
    ...POPULAR_SYMBOLS
  ])].sort();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Handle symbol input for suggestions
    if (name === 'asset_symbol') {
      const filteredSuggestions = allSymbols.filter(symbol =>
        symbol.toLowerCase().includes(value.toLowerCase()) && value.length > 0
      ).slice(0, 8);
      setSymbolSuggestions(filteredSuggestions);
      setShowSuggestions(value.length > 0 && filteredSuggestions.length > 0);
    }
  };

  const handleBrokerChange = (value) => {
    setFormData(prev => ({ ...prev, broker: value }));
  };

  const handleSymbolSelect = (symbol) => {
    setFormData(prev => ({ ...prev, asset_symbol: symbol }));
    setShowSuggestions(false);
    setSymbolSuggestions([]);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchAssetDetails = useCallback(
    debounce(async (rawSymbol, date) => {
      const symbol = (rawSymbol || '').trim().toUpperCase();
      if (!symbol || !date) {
        return;
      }

      setIsFetchingPrice(true);
      setPriceError('');
      setFetchedAssetInfo({ historical_price: '', historical_price_date: '', current_price: '', name: '', type: '' });

      const existingAsset = assets.find((asset) => asset.symbol === symbol);

      try {
        const result = await FetchPriceDetails({ symbol, date });
        const historical = Number(result?.historical_price);
        const current = Number(result?.current_price);
        if (Number.isFinite(historical) && Number.isFinite(current)) {
          const resolvedName = result.name || (existingAsset && existingAsset.name) || symbol;
          const resolvedType = result.type || (existingAsset && existingAsset.type) || 'stock';

          setFetchedAssetInfo({
            historical_price: historical,
            historical_price_date: result.historical_price_date || date,
            current_price: current,
            name: resolvedName,
            type: resolvedType,
          });
        } else {
          throw new Error('Invalid response from price service.');
        }
      } catch (err) {
        console.error('Failed to fetch asset details:', err);
        setPriceError(err.message || 'Could not fetch price data. Please check symbol/date.');
      } finally {
        setIsFetchingPrice(false);
      }
    }, 500),
    [assets]
  ); // 500ms debounce

  useEffect(() => {
    fetchAssetDetails(formData.asset_symbol.toUpperCase(), formData.date);
  }, [formData.asset_symbol, formData.date, fetchAssetDetails]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.asset_symbol || !formData.quantity || !fetchedAssetInfo.historical_price || !fetchedAssetInfo.current_price || !formData.date || !formData.broker) {
      setError('All fields must be filled and asset details must be fetched successfully.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    
    try {
      const transactionQuantity = parseFloat(formData.quantity);
      const historicalPrice = parseFloat(fetchedAssetInfo.historical_price);
      const currentPrice = parseFloat(fetchedAssetInfo.current_price);
      const symbol = formData.asset_symbol.toUpperCase();

      const existingAssets = await Asset.filter({ symbol });
      const existingAsset = existingAssets.length > 0 ? existingAssets[0] : null;
      const assetName = fetchedAssetInfo.name || (existingAsset && existingAsset.name) || symbol;
      const assetType = fetchedAssetInfo.type || (existingAsset && existingAsset.type) || 'stock';

      if (formData.type === 'buy') {
        if (existingAsset) {
          const old_quantity = existingAsset.quantity || 0;
          const old_avg_price = existingAsset.purchase_price || 0;
          const new_quantity = old_quantity + transactionQuantity;
          const new_avg_price = ((old_quantity * old_avg_price) + (transactionQuantity * historicalPrice)) / new_quantity;
          
          const updatedAsset = {
            quantity: new_quantity,
            purchase_price: new_avg_price,
            current_price: currentPrice,
            market_value: new_quantity * currentPrice,
            gain_loss: (currentPrice - new_avg_price) * new_quantity,
            gain_loss_percent: new_avg_price > 0 ? ((currentPrice - new_avg_price) / new_avg_price) * 100 : 0,
            day_change: 0,
            day_change_percent: 0
          };
          
          await Asset.update(existingAsset.id, updatedAsset);
        } else {
          const newAsset = {
            symbol,
            name: assetName,
            type: assetType,
            broker: formData.broker,
            quantity: transactionQuantity,
            purchase_price: historicalPrice,
            current_price: currentPrice,
            market_value: transactionQuantity * currentPrice,
            gain_loss: (currentPrice - historicalPrice) * transactionQuantity,
            gain_loss_percent: historicalPrice > 0 ? ((currentPrice - historicalPrice) / historicalPrice) * 100 : 0,
            day_change: 0,
            day_change_percent: 0
          };
          
          await Asset.create(newAsset);
        }
      } else { // Sell
        if (!existingAsset || existingAsset.quantity < transactionQuantity) {
          throw new Error("Not enough shares to sell.");
        }
        const new_quantity = existingAsset.quantity - transactionQuantity;
        if (new_quantity > 0) {
          const updatedAsset = {
            quantity: new_quantity,
            current_price: currentPrice,
            market_value: new_quantity * currentPrice,
            gain_loss: (currentPrice - existingAsset.purchase_price) * new_quantity,
            gain_loss_percent: existingAsset.purchase_price > 0 ? ((currentPrice - existingAsset.purchase_price) / existingAsset.purchase_price) * 100 : 0
          };
          await Asset.update(existingAsset.id, updatedAsset);
        } else {
          await Asset.delete(existingAsset.id);
        }
      }

      await Transaction.create({
        asset_symbol: symbol,
        type: formData.type,
        quantity: transactionQuantity,
        price: historicalPrice, // Use historical price for the transaction record
        date: new Date(formData.date).toISOString(),
        broker: formData.broker,
        total_cost: transactionQuantity * historicalPrice,
      });

      onSuccess();
    } catch (err) {
      console.error("Failed to save transaction:", err);
      setError(err.message || 'Failed to save transaction. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const gainLossPreview = fetchedAssetInfo.historical_price && fetchedAssetInfo.current_price ? 
    ((fetchedAssetInfo.current_price - fetchedAssetInfo.historical_price) / fetchedAssetInfo.historical_price) * 100 : 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <p className="text-red-500 text-sm">{error}</p>}
      
      <div className="relative">
        <label className="text-sm font-medium text-purple-800 mb-2 block">Asset Symbol</label>
        <div className="relative">
          <input
            type="text"
            name="asset_symbol"
            value={formData.asset_symbol}
            onChange={handleChange}
            onFocus={() => formData.asset_symbol && setShowSuggestions(symbolSuggestions.length > 0)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="e.g., AAPL, BTC"
            className="w-full neomorph-inset rounded-xl px-4 py-3 text-purple-900 bg-transparent uppercase pr-10"
            autoComplete="off"
            required
          />
          <Search className="absolute right-3 top-3 w-5 h-5 text-purple-500" />
        </div>
        
        {/* Suggestions dropdown */}
        {showSuggestions && (
          <div className="absolute z-10 w-full mt-1 neomorph rounded-xl bg-purple-100 max-h-48 overflow-y-auto">
            {symbolSuggestions.map((symbol) => (
              <button
                key={symbol}
                type="button"
                onClick={() => handleSymbolSelect(symbol)}
                className="w-full px-4 py-2 text-left text-purple-800 hover:bg-purple-200 first:rounded-t-xl last:rounded-b-xl transition-colors"
              >
                {symbol}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-purple-800 mb-2 block">Type</label>
          <select name="type" value={formData.type} onChange={handleChange} className="w-full neomorph-inset rounded-xl px-4 py-3 text-purple-900 bg-transparent">
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-purple-800 mb-2 block">Broker</label>
          <AutocompleteInput
            value={formData.broker}
            onChange={handleBrokerChange}
            suggestions={uniqueBrokers}
            placeholder="e.g., Fidelity"
            className="w-full neomorph-inset rounded-xl px-4 py-3 text-purple-900 bg-transparent"
            required
            name="broker"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-purple-800 mb-2 block">Quantity</label>
          <input type="number" step="any" name="quantity" value={formData.quantity} onChange={handleChange} placeholder="0.00" className="w-full neomorph-inset rounded-xl px-4 py-3 text-purple-900 bg-transparent" required />
        </div>
        <div>
          <label className="text-sm font-medium text-purple-800 mb-2 block">Purchase Date</label>
          <input type="date" name="date" value={formData.date} onChange={handleChange} className="w-full neomorph-inset rounded-xl px-4 py-3 text-purple-900 bg-transparent" required />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-purple-800 mb-2 block">Price Information</label>
        <div className="w-full neomorph-inset rounded-xl px-4 py-3 bg-transparent min-h-[48px]">
          {isFetchingPrice ? (
            <div className="flex items-center space-x-2 text-purple-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Fetching historical and current prices...</span>
            </div>
          ) : priceError ? (
            <span className="text-red-500 text-sm">{priceError}</span>
          ) : fetchedAssetInfo.historical_price && fetchedAssetInfo.current_price ? (
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-sm text-purple-700">Purchase Price ({fetchedAssetInfo.historical_price_date || formData.date}):</span>
                <span className="font-semibold text-purple-900">
                  {format(fetchedAssetInfo.historical_price, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-purple-700">Current Price:</span>
                <span className="font-semibold text-purple-900">
                  {format(fetchedAssetInfo.current_price, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-purple-200">
                <span className="text-sm text-purple-700">Expected Gain/Loss:</span>
                <span className={`font-semibold ${gainLossPreview >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {gainLossPreview >= 0 ? '+' : ''}{gainLossPreview.toFixed(2)}%
                </span>
              </div>
            </div>
          ) : (
            <span className="text-purple-600">Enter symbol and date to fetch price data</span>
          )}
        </div>
      </div>
      
      <div className="flex justify-end space-x-4 pt-4">
        <button type="button" onClick={onCancel} className="neomorph rounded-xl px-6 py-3 font-semibold text-purple-700 neomorph-hover transition-all">
          Cancel
        </button>
        <button type="submit" disabled={isSubmitting || isFetchingPrice || !fetchedAssetInfo.historical_price || !fetchedAssetInfo.current_price} className="neomorph rounded-xl px-6 py-3 font-semibold text-purple-800 neomorph-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed">
          {isSubmitting ? <Loader2 className="animate-spin w-5 h-5" /> : 'Save Transaction'}
        </button>
      </div>
    </form>
  );
}


