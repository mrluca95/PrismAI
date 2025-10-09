
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Transaction } from '@/entities/Transaction';
import { Asset } from '@/entities/Asset';
import { FetchPriceDetails, SearchSymbols, InvokeLLM, FetchQuotes } from '@/integrations/Core';
import { Loader2, Search } from 'lucide-react';
import { debounce } from 'lodash';
import AutocompleteInput from '../ui/AutocompleteInput';
import { useCurrency } from '@/context/CurrencyContext.jsx';

const getLogoUrl = (symbol) => {
  if (!symbol) {
    return null;
  }
  const upper = String(symbol).toUpperCase();
  return `https://storage.googleapis.com/iex/api/logos/${upper}.png`;
};

// Popular stock symbols for autocompletion
const POPULAR_SYMBOLS = [
  'AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX', 'BTC', 'ETH',
  'SPY', 'QQQ', 'VOO', 'VTI', 'BND', 'GLD', 'SLV', 'COIN', 'AMD', 'INTC',
  'JPM', 'BAC', 'WMT', 'PG', 'JNJ', 'KO', 'PEP', 'DIS', 'V', 'MA'
];

const POPULAR_SUGGESTIONS = POPULAR_SYMBOLS.map((symbol) => ({
  value: symbol,
  label: symbol,
  name: symbol,
  logo: getLogoUrl(symbol),
}));

export default function TransactionForm({ assets, onSuccess, onCancel }) {
  const { format } = useCurrency();
  const [formData, setFormData] = useState({
    asset_symbol: '',
    type: 'buy',
    quantity: '',
    date: new Date().toISOString().split('T')[0], // YYYY-MM-DD format
    time: new Date().toTimeString().slice(0, 5), // HH:mm in local time
    broker: '', // Initialize broker to empty for autocompletion
    manual_price: ''
  });
  const [fetchedAssetInfo, setFetchedAssetInfo] = useState({ 
    historical_price: '', 
    historical_price_date: '', 
    historical_price_timestamp: '', 
    current_price: '', 
    current_price_timestamp: '', 
    name: '', 
    type: '' 
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [isFetchingPrice, setIsFetchingPrice] = useState(false);
  const [priceError, setPriceError] = useState('');
  const [symbolSuggestions, setSymbolSuggestions] = useState(POPULAR_SUGGESTIONS);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [symbolDirectory, setSymbolDirectory] = useState(() => Object.create(null));
  const [logoErrored, setLogoErrored] = useState(false);
  const popularSuggestions = useMemo(() => POPULAR_SUGGESTIONS, []);
  const fetchSymbolSuggestions = useMemo(() => debounce(async (rawQuery) => {
    const query = String(rawQuery || '').trim();
    if (!query) {
      setSymbolSuggestions([...popularSuggestions]);
      setShowSuggestions(false);
      return;
    }

    try {
      const result = await SearchSymbols(query);
      const quotes = Array.isArray(result?.symbols) ? result.symbols : [];
      const normalisedQuery = query.toUpperCase();
      const scoreQuote = (item) => {
        const symbolValue = String(item?.symbol || '').toUpperCase();
        let score = 0;
        if (symbolValue === normalisedQuery) {
          score += 20;
        } else if (symbolValue.startsWith(normalisedQuery)) {
          score += 10;
        }
        const quoteType = String(item?.type || item?.quoteType || '').toLowerCase();
        if (quoteType.includes('equity') || quoteType.includes('stock')) {
          score += 5;
        }
        const exchangeDisplay = String(item?.exchDisp || '').toUpperCase();
        if (exchangeDisplay.includes('NASDAQ') || exchangeDisplay.includes('NYSE')) {
          score += 2;
        }
        return score;
      };
      const sortedQuotes = [...quotes].sort((a, b) => scoreQuote(b) - scoreQuote(a));
      const unique = new Map();
      sortedQuotes.forEach((item) => {
        const symbolValue = String(item?.symbol || '').toUpperCase();
        if (!symbolValue || unique.has(symbolValue)) {
          return;
        }
        const companyName = item?.name || '';
        const label = companyName ? `${symbolValue} · ${companyName}` : symbolValue;
        unique.set(symbolValue, {
          value: symbolValue,
          label,
          name: companyName,
          logo: getLogoUrl(symbolValue),
        });
      });
      const matches = Array.from(unique.values()).slice(0, 20);
      if (matches.length > 0) {
        setSymbolSuggestions(matches);
        setShowSuggestions(true);
        setSymbolDirectory((prev) => {
          const next = { ...prev };
          quotes.forEach((item) => {
            const symbolValue = String(item?.symbol || '').toUpperCase();
            if (!symbolValue) {
              return;
            }
            next[symbolValue] = {
              name: item?.name || next[symbolValue]?.name || '',
              type: item?.type || next[symbolValue]?.type || 'stock',
              exchange: item?.exchange || next[symbolValue]?.exchange || '',
              logo: getLogoUrl(symbolValue),
            };
          });
          return next;
        });
      } else {
        const fallback = popularSuggestions.filter((entry) => entry.value.includes(query.toUpperCase()));
        setSymbolSuggestions(fallback.length ? fallback : [...popularSuggestions]);
        setShowSuggestions(Boolean(query) && fallback.length > 0);
      }
    } catch (error) {
      console.warn('[TransactionForm] symbol lookup failed', error);
      const fallback = popularSuggestions.filter((entry) => entry.value.includes(query.toUpperCase()));
      setSymbolSuggestions(fallback.length ? fallback : [...popularSuggestions]);
      setShowSuggestions(Boolean(query) && fallback.length > 0);
    }
  }, 300), [popularSuggestions]);


  const uniqueBrokers = [...new Set(assets.map((asset) => asset.broker).filter(Boolean))];
  const parsedManualPrice = formData.manual_price !== '' ? Number(formData.manual_price) : NaN;
  const fetchedHistoricalPrice = Number.isFinite(Number(fetchedAssetInfo.historical_price)) ? Number(fetchedAssetInfo.historical_price) : NaN;
  const fetchedCurrentPrice = Number.isFinite(Number(fetchedAssetInfo.current_price)) ? Number(fetchedAssetInfo.current_price) : NaN;
  const effectiveHistoricalPrice = Number.isFinite(fetchedHistoricalPrice) ? fetchedHistoricalPrice : parsedManualPrice;
  const effectiveCurrentPrice = Number.isFinite(fetchedCurrentPrice) ? fetchedCurrentPrice : (Number.isFinite(parsedManualPrice) ? parsedManualPrice : NaN);
  const hasFetchedPrice = Number.isFinite(fetchedHistoricalPrice) && Number.isFinite(fetchedCurrentPrice);
  const hasManualPrice = Number.isFinite(parsedManualPrice);
  const canSubmit = Boolean(formData.asset_symbol && formData.quantity && formData.date && formData.time && formData.broker) && Number.isFinite(effectiveHistoricalPrice);


  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'asset_symbol') {
      const uppercaseValue = value.toUpperCase();
      setFormData((prev) => ({ ...prev, asset_symbol: uppercaseValue }));
      fetchSymbolSuggestions(uppercaseValue);
      return;
    }

    if (name === 'manual_price') {
      setFormData((prev) => ({ ...prev, manual_price: value }));
      setPriceError('');
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleBrokerChange = (value) => {
    setFormData((prev) => ({ ...prev, broker: value }));
  };

  useEffect(() => {
    setLogoErrored(false);
  }, [formData.asset_symbol]);

  useEffect(() => {
    return () => {
      if (typeof fetchSymbolSuggestions.cancel === 'function') {
        fetchSymbolSuggestions.cancel();
      }
    };
  }, [fetchSymbolSuggestions]);

  useEffect(() => {
    fetchSymbolSuggestions(formData.asset_symbol);
  }, [formData.asset_symbol, fetchSymbolSuggestions]);

  const handleSymbolSelect = (symbolOption) => {
    const selected = typeof symbolOption === 'string' ? symbolOption : symbolOption?.value;
    if (!selected) {
      return;
    }
    const upper = selected.toUpperCase();
    setFormData((prev) => ({ ...prev, asset_symbol: upper }));
    setShowSuggestions(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchAssetDetails = useCallback(
    debounce(async (rawSymbol, date, time) => {
      const symbol = (rawSymbol || '').trim().toUpperCase();
      if (!symbol || !date) {
        return;
      }

      setIsFetchingPrice(true);
      setPriceError('');
      setFetchedAssetInfo({ historical_price: '', historical_price_date: '', historical_price_timestamp: '', current_price: '', current_price_timestamp: '', name: '', type: '' });

      const existingAsset = assets.find((asset) => asset.symbol === symbol);

      try {
        const result = await FetchPriceDetails({ symbol, date, time });
        const historical = Number(result?.historical_price);
        const current = Number(result?.current_price);
        if (Number.isFinite(historical) && Number.isFinite(current)) {
          const directoryMeta = symbolDirectory[symbol] || {};
          const resolvedName = result.name || existingAsset?.name || directoryMeta.name || symbol;
          const resolvedType = result.type || existingAsset?.type || directoryMeta.type || 'stock';

          setFetchedAssetInfo({
            historical_price: historical,
            historical_price_date: result.historical_price_date || date,
            historical_price_timestamp: result.historical_price_timestamp || '',
            current_price: current,
            current_price_timestamp: result.current_price_timestamp || '',
            name: resolvedName,
            type: resolvedType,
          });
          setFormData((prev) => ({
            ...prev,
            manual_price: Number.isFinite(historical) ? String(historical) : prev.manual_price,
          }));
        } else {
          throw new Error('Invalid response from price service.');
        }
      } catch (err) {
        console.error('Failed to fetch asset details:', err);
        let fallbackApplied = false;
        try {
          const fallbackQuotes = await FetchQuotes([symbol]);
          const quoteEntry = fallbackQuotes?.[symbol];
          const fallbackPrice = Number(quoteEntry?.price ?? quoteEntry?.value?.price);
          if (Number.isFinite(fallbackPrice)) {
            const directoryMeta = symbolDirectory[symbol] || {};
            const resolvedName = existingAsset?.name || directoryMeta.name || symbol;
            const resolvedType = existingAsset?.type || directoryMeta.type || 'stock';

            setFetchedAssetInfo({
              historical_price: fallbackPrice,
              historical_price_date: date || null,
              historical_price_timestamp: null,
              current_price: fallbackPrice,
              current_price_timestamp: quoteEntry?.timestamp || null,
              name: resolvedName,
              type: resolvedType,
            });
            setFormData((prev) => ({
              ...prev,
              manual_price: Number.isFinite(fallbackPrice) ? String(fallbackPrice) : prev.manual_price,
            }));
            fallbackApplied = true;
            setPriceError('');
          }
        } catch (fallbackError) {
          console.warn('[TransactionForm] fallback quote lookup failed', fallbackError);
        }

        if (!fallbackApplied) {
          setPriceError(err.message || 'Could not fetch price data. Please check symbol/date.');
        }
      } finally {
        setIsFetchingPrice(false);
      }
    }, 500),
    [assets]
  ); // 500ms debounce

  useEffect(() => {
    fetchAssetDetails(formData.asset_symbol.toUpperCase(), formData.date, formData.time);
  }, [formData.asset_symbol, formData.date, formData.time, fetchAssetDetails]);

  const formatTimestampLabel = (timestamp, fallback) => {
    if (timestamp) {
      const parsed = new Date(timestamp);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      }
    }
    return fallback || null;
  };

  const purchasePriceLabel = formatTimestampLabel(
    fetchedAssetInfo.historical_price_timestamp,
    fetchedAssetInfo.historical_price_date
      ? `${fetchedAssetInfo.historical_price_date}${formData.time ? ' ' + formData.time : ''}`
      : null,
  );
  const currentPriceLabel = formatTimestampLabel(
    fetchedAssetInfo.current_price_timestamp,
    null,
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    const parsedManualPrice = formData.manual_price !== '' ? Number(formData.manual_price) : NaN;
    const effectiveHistoricalPrice = Number.isFinite(Number(fetchedAssetInfo.historical_price)) ? Number(fetchedAssetInfo.historical_price) : parsedManualPrice;
    const effectiveCurrentPrice = Number.isFinite(Number(fetchedAssetInfo.current_price)) ? Number(fetchedAssetInfo.current_price) : effectiveHistoricalPrice;
    if (!formData.asset_symbol || !formData.quantity || !formData.date || !formData.time || !formData.broker) {
      setError('All fields must be filled.');
      return;
    }
    if (!Number.isFinite(effectiveHistoricalPrice)) {
      setError('Enter a valid purchase price manually if automatic lookup fails.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    
    try {
      const transactionQuantity = Number.parseFloat(formData.quantity);
      if (!Number.isFinite(transactionQuantity) || transactionQuantity <= 0) {
        throw new Error('Quantity must be a positive number.');
      }
      const purchaseDateTime = new Date(`${formData.date}T${(formData.time || '00:00').padStart(5, '0')}:00`);
      if (Number.isNaN(purchaseDateTime.getTime())) {
        throw new Error('Invalid purchase date/time.');
      }
      const historicalPrice = effectiveHistoricalPrice;
      const currentPrice = Number.isFinite(effectiveCurrentPrice) ? effectiveCurrentPrice : effectiveHistoricalPrice;
      const symbol = formData.asset_symbol.toUpperCase();

      const existingAssets = await Asset.filter({ symbol });
      const existingAsset = existingAssets.length > 0 ? existingAssets[0] : null;
      const directoryMeta = symbolDirectory[symbol] || {};
      const assetName = fetchedAssetInfo.name || existingAsset?.name || directoryMeta.name || symbol;
      const assetType = fetchedAssetInfo.type || existingAsset?.type || directoryMeta.type || 'stock';

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
        price_timestamp: fetchedAssetInfo.historical_price_timestamp || purchaseDateTime.toISOString(),
        date: purchaseDateTime.toISOString(),
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

  const gainLossPreview = Number.isFinite(effectiveHistoricalPrice) && Number.isFinite(effectiveCurrentPrice) && effectiveHistoricalPrice !== 0 ?
    ((effectiveCurrentPrice - effectiveHistoricalPrice) / effectiveHistoricalPrice) * 100 : 0;

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
            className={`w-full neomorph-inset rounded-xl text-purple-900 bg-transparent uppercase pr-10 py-3 ${formData.asset_symbol && !logoErrored ? 'pl-12' : 'pl-4'}`}
            autoComplete="off"
            required
          />
          {formData.asset_symbol && !logoErrored && (
            <img
              src={getLogoUrl(formData.asset_symbol)}
              alt={`${formData.asset_symbol} logo`}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full object-contain bg-white shadow-sm"
              onError={() => setLogoErrored(true)}
            />
          )}
          <Search className="absolute right-3 top-3 w-5 h-5 text-purple-500" />
        </div>
        
        {/* Suggestions dropdown */}
        {showSuggestions && symbolSuggestions.length > 0 && (
          <div className="absolute z-10 w-full mt-1 neomorph rounded-xl bg-purple-100 max-h-60 overflow-y-auto">
            {symbolSuggestions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSymbolSelect(option)}
                className="w-full px-4 py-2 text-left text-purple-800 hover:bg-purple-200 first:rounded-t-xl last:rounded-b-xl transition-colors border-b border-purple-100 last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  {option.logo && (
                    <img
                      src={option.logo}
                      alt={`${option.value} logo`}
                      className="w-6 h-6 rounded-full object-contain bg-white shadow-sm"
                      onError={(event) => { event.currentTarget.style.display = 'none'; }}
                    />
                  )}
                  <div className="flex flex-col">
                    <span className="font-semibold text-purple-900">{option.value}</span>
                    {option.label && option.label !== option.value && (
                      <span className="text-xs text-purple-600">{option.label.replace(`${option.value} · `, '')}</span>
                    )}
                  </div>
                </div>
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
      <div className="mt-3">
        <label className="text-sm font-medium text-purple-800 mb-2 block">Manual Purchase Price</label>
        <input
          type="number"
          step="any"
          name="manual_price"
          value={formData.manual_price}
          onChange={handleChange}
          placeholder="Enter a price if automatic retrieval fails"
          className="w-full neomorph-inset rounded-xl px-4 py-3 text-purple-900 bg-transparent"
        />
        <p className="text-xs text-purple-500 mt-1">This value will be used when we cannot fetch prices automatically.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-sm font-medium text-purple-800 mb-2 block">Quantity</label>
          <input type="number" step="any" name="quantity" value={formData.quantity} onChange={handleChange} placeholder="0.00" className="w-full neomorph-inset rounded-xl px-4 py-3 text-purple-900 bg-transparent" required />
        </div>
        <div>
          <label className="text-sm font-medium text-purple-800 mb-2 block">Purchase Date</label>
          <input type="date" name="date" value={formData.date} onChange={handleChange} className="w-full neomorph-inset rounded-xl px-4 py-3 text-purple-900 bg-transparent" required />
        </div>
        <div>
          <label className="text-sm font-medium text-purple-800 mb-2 block">Purchase Time</label>
          <input type="time" name="time" value={formData.time} onChange={handleChange} className="w-full neomorph-inset rounded-xl px-4 py-3 text-purple-900 bg-transparent" required />
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
                <span className="text-sm text-purple-700">Purchase Price{purchasePriceLabel ? ` (${purchasePriceLabel})` : ''}:</span>
                <span className="font-semibold text-purple-900">
                  {format(fetchedAssetInfo.historical_price, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-purple-700">Current Price{currentPriceLabel ? ` (${currentPriceLabel})` : ''}:</span>
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
        <button type="submit" disabled={isSubmitting || isFetchingPrice || !canSubmit} className="neomorph rounded-xl px-6 py-3 font-semibold text-purple-800 neomorph-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed">
          {isSubmitting ? <Loader2 className="animate-spin w-5 h-5" /> : 'Save Transaction'}
        </button>
      </div>
    </form>
  );
}



