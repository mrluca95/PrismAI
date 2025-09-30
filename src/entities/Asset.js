import { readCollection, writeCollection, generateId, nowIso } from './storage';

const STORAGE_KEY = 'assets';

const demoAssets = [
  {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    type: 'stock',
    broker: 'Fidelity',
    quantity: 25,
    purchase_price: 142.15,
    current_price: 189.63,
    previous_price: 185.50,
  },
  {
    symbol: 'TSLA',
    name: 'Tesla Motors',
    type: 'stock',
    broker: 'Robinhood',
    quantity: 8,
    purchase_price: 215.32,
    current_price: 252.81,
    previous_price: 248.10,
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    type: 'crypto',
    broker: 'Coinbase',
    quantity: 2.5,
    purchase_price: 1750.40,
    current_price: 1898.33,
    previous_price: 1876.12,
  },
  {
    symbol: 'VOO',
    name: 'Vanguard S&P 500 ETF',
    type: 'etf',
    broker: 'Vanguard',
    quantity: 12,
    purchase_price: 403.21,
    current_price: 427.55,
    previous_price: 425.12,
  }
];

let seeded = false;

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normaliseSymbol = (symbol = '') => symbol.toString().trim().toUpperCase();

const calculateDerived = (asset) => {
  const quantity = toNumber(asset.quantity);
  const currentPrice = toNumber(asset.current_price);
  const purchasePrice = toNumber(asset.purchase_price, currentPrice);
  const marketValue = quantity * currentPrice;
  const totalCost = quantity * purchasePrice;

  const gainLoss = asset.gain_loss !== undefined
    ? toNumber(asset.gain_loss)
    : marketValue - totalCost;

  const gainLossPercent = asset.gain_loss_percent !== undefined
    ? toNumber(asset.gain_loss_percent)
    : totalCost > 0
      ? (gainLoss / totalCost) * 100
      : 0;

  const dayChange = asset.day_change !== undefined
    ? toNumber(asset.day_change)
    : 0;

  const dayChangePercent = asset.day_change_percent !== undefined
    ? toNumber(asset.day_change_percent)
    : (marketValue - dayChange) > 0
      ? (dayChange / (marketValue - dayChange)) * 100
      : 0;

  return {
    ...asset,
    quantity,
    current_price: currentPrice,
    purchase_price: purchasePrice,
    market_value: Number(marketValue.toFixed(2)),
    gain_loss: Number(gainLoss.toFixed(2)),
    gain_loss_percent: Number(gainLossPercent.toFixed(2)),
    day_change: Number(dayChange.toFixed(2)),
    day_change_percent: Number(dayChangePercent.toFixed(2))
  };
};

const ensureSeed = () => {
  if (seeded) {
    return;
  }
  const current = readCollection(STORAGE_KEY);
  if (!current || current.length === 0) {
    const now = nowIso();
    const seededAssets = demoAssets.map((asset) => {
      const withMeta = {
        id: generateId(),
        created_at: now,
        updated_at: now,
        ...asset,
        symbol: normaliseSymbol(asset.symbol),
      };
      return calculateDerived(withMeta);
    });
    writeCollection(STORAGE_KEY, seededAssets);
  }
  seeded = true;
};

const clone = (asset) => ({ ...asset });

const findIndex = (collection, id) => collection.findIndex((item) => item.id === id);

const assertAssetExists = (index, id) => {
  if (index === -1) {
    throw new Error(`Asset with id ${id} was not found`);
  }
};

const sortAssets = (collection) => {
  return [...collection].sort((a, b) => {
    const symbolCompare = a.symbol.localeCompare(b.symbol);
    if (symbolCompare !== 0) {
      return symbolCompare;
    }
    return (b.updated_at || '').localeCompare(a.updated_at || '');
  });
};

export const Asset = {
  async list() {
    ensureSeed();
    const collection = readCollection(STORAGE_KEY);
    return sortAssets(collection).map(clone);
  },

  async filter(criteria = {}) {
    const entries = await this.list();
    return entries.filter((asset) => {
      return Object.entries(criteria).every(([key, value]) => {
        if (value === undefined || value === null) {
          return true;
        }
        return asset[key] === value;
      });
    });
  },

  async create(input) {
    ensureSeed();
    const collection = readCollection(STORAGE_KEY);
    const now = nowIso();
    const payload = calculateDerived({
      id: generateId(),
      created_at: now,
      updated_at: now,
      symbol: normaliseSymbol(input.symbol || 'ASSET'),
      name: input.name || input.symbol || 'Untitled Asset',
      type: input.type || 'stock',
      broker: input.broker || 'Manual Entry',
      quantity: input.quantity,
      purchase_price: input.purchase_price ?? input.current_price,
      current_price: input.current_price ?? input.purchase_price ?? 0,
      market_value: input.market_value,
      gain_loss: input.gain_loss,
      gain_loss_percent: input.gain_loss_percent,
      day_change: input.day_change,
      day_change_percent: input.day_change_percent,
      previous_price: input.previous_price,
    });
    collection.push(payload);
    writeCollection(STORAGE_KEY, collection);
    return clone(payload);
  },

  async update(id, updates) {
    ensureSeed();
    const collection = readCollection(STORAGE_KEY);
    const index = findIndex(collection, id);
    assertAssetExists(index, id);

    const merged = {
      ...collection[index],
      ...updates,
      symbol: updates.symbol ? normaliseSymbol(updates.symbol) : collection[index].symbol,
      updated_at: nowIso(),
    };

    const recalculated = calculateDerived(merged);
    collection[index] = recalculated;
    writeCollection(STORAGE_KEY, collection);
    return clone(recalculated);
  },

  async delete(id) {
    ensureSeed();
    const collection = readCollection(STORAGE_KEY);
    const index = findIndex(collection, id);
    assertAssetExists(index, id);
    collection.splice(index, 1);
    writeCollection(STORAGE_KEY, collection);
    return true;
  },
};

export default Asset;
