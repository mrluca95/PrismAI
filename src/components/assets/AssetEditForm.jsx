import React, { useState, useEffect } from 'react';
import { Asset } from '@/entities/Asset';
import { Loader2 } from 'lucide-react';

export default function AssetEditForm({ asset, onSuccess, onCancel }) {
  const [formData, setFormData] = useState({
    symbol: asset?.symbol || '',
    name: asset?.name || '',
    type: asset?.type || 'stock',
    broker: asset?.broker || '',
    quantity: asset?.quantity || '',
    current_price: asset?.current_price || '',
    purchase_price: asset?.purchase_price || ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [uniqueBrokers, setUniqueBrokers] = useState([]);

  useEffect(() => {
    const fetchBrokers = async () => {
      const allAssets = await Asset.list();
      const brokers = [...new Set(allAssets.map(a => a.broker))];
      setUniqueBrokers(brokers);
    };
    fetchBrokers();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.symbol || !formData.quantity || !formData.current_price) {
      setError('Symbol, quantity, and current price are required.');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const quantity = parseFloat(formData.quantity);
      const currentPrice = parseFloat(formData.current_price);
      const purchasePrice = parseFloat(formData.purchase_price) || currentPrice;
      const marketValue = quantity * currentPrice;
      const gainLoss = marketValue - (quantity * purchasePrice);
      const gainLossPercent = purchasePrice > 0 ? (gainLoss / (quantity * purchasePrice)) * 100 : 0;

      const updatedData = {
        ...formData,
        symbol: formData.symbol.toUpperCase(),
        quantity,
        current_price: currentPrice,
        purchase_price: purchasePrice,
        market_value: marketValue,
        gain_loss: gainLoss,
        gain_loss_percent: gainLossPercent,
        day_change: asset?.day_change || 0,
        day_change_percent: asset?.day_change_percent || 0
      };

      await Asset.update(asset.id, updatedData);
      onSuccess();
    } catch (err) {
      console.error('Failed to update asset:', err);
      setError('Failed to update asset. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-purple-700 block mb-2">Symbol</label>
          <input
            type="text"
            name="symbol"
            value={formData.symbol}
            onChange={handleChange}
            className="w-full neomorph-inset rounded-xl px-4 py-2 text-gray-800 bg-transparent"
            placeholder="AAPL"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-purple-700 block mb-2">Type</label>
          <select
            name="type"
            value={formData.type}
            onChange={handleChange}
            className="w-full neomorph-inset rounded-xl px-4 py-2 text-gray-800 bg-transparent"
          >
            <option value="stock">Stock</option>
            <option value="etf">ETF</option>
            <option value="crypto">Crypto</option>
            <option value="bond">Bond</option>
            <option value="mutual_fund">Mutual Fund</option>
          </select>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-purple-700 block mb-2">Name</label>
        <input
          type="text"
          name="name"
          value={formData.name}
          onChange={handleChange}
          className="w-full neomorph-inset rounded-xl px-4 py-2 text-gray-800 bg-transparent"
          placeholder="Apple Inc."
        />
      </div>

      <div>
        <label className="text-sm font-medium text-purple-700 block mb-2">Broker</label>
        <input
          type="text"
          name="broker"
          value={formData.broker}
          onChange={handleChange}
          list="broker-list-edit"
          className="w-full neomorph-inset rounded-xl px-4 py-2 text-gray-800 bg-transparent"
          placeholder="Interactive Brokers"
        />
        <datalist id="broker-list-edit">
          {uniqueBrokers.map(b => <option key={b} value={b} />)}
        </datalist>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-purple-700 block mb-2">Quantity</label>
          <input
            type="number"
            step="0.01"
            name="quantity"
            value={formData.quantity}
            onChange={handleChange}
            className="w-full neomorph-inset rounded-xl px-4 py-2 text-gray-800 bg-transparent"
            placeholder="100"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-purple-700 block mb-2">Current Price</label>
          <input
            type="number"
            step="0.01"
            name="current_price"
            value={formData.current_price}
            onChange={handleChange}
            className="w-full neomorph-inset rounded-xl px-4 py-2 text-gray-800 bg-transparent"
            placeholder="150.00"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-purple-700 block mb-2">Purchase Price (avg)</label>
        <input
          type="number"
          step="0.01"
          name="purchase_price"
          value={formData.purchase_price}
          onChange={handleChange}
          className="w-full neomorph-inset rounded-xl px-4 py-2 text-gray-800 bg-transparent"
          placeholder="140.00"
        />
      </div>

      {error && (
        <div className="text-red-600 text-sm bg-red-50 p-3 rounded-xl">
          {error}
        </div>
      )}

      <div className="flex justify-end space-x-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="neomorph rounded-xl px-6 py-2 text-purple-700 font-medium neomorph-hover transition-all duration-300 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="neomorph rounded-xl px-6 py-2 bg-purple-600 text-white font-medium neomorph-hover transition-all duration-300 disabled:opacity-50 flex items-center space-x-2"
        >
          {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
          <span>{isSubmitting ? 'Updating...' : 'Update Asset'}</span>
        </button>
      </div>
    </form>
  );
}