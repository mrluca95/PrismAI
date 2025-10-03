import { readCollection, writeCollection, generateId, nowIso, clearItem } from './storage';

const STORAGE_KEY = 'assets';

let currentUserId = null;

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
    day_change_percent: Number(dayChangePercent.toFixed(2)),
  };
};

const storageKeyFor = (userId = currentUserId) => (userId ? `${STORAGE_KEY}_${userId}` : STORAGE_KEY);

const readAssets = () => readCollection(storageKeyFor());
const writeAssets = (collection) => writeCollection(storageKeyFor(), collection);

const migrateLegacyData = (userId) => {
  if (!userId) {
    return;
  }
  const legacyCollection = readCollection(STORAGE_KEY);
  if (legacyCollection && legacyCollection.length > 0) {
    clearItem(STORAGE_KEY);
  }
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

const Asset = {
  setCurrentUser(userId) {
    const normalised = userId ? String(userId) : null;
    if (normalised === currentUserId) {
      return;
    }
    if (normalised) {
      migrateLegacyData(normalised);
    }
    currentUserId = normalised;
  },

  clearAllForCurrentUser() {
    writeCollection(storageKeyFor(), []);
  },

  async list() {
    const collection = sortAssets(readAssets());
    return collection.map(clone);
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
    const collection = readAssets();
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
    writeAssets(collection);
    return clone(payload);
  },

  async update(id, updates) {
    const collection = readAssets();
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
    writeAssets(collection);
    return clone(recalculated);
  },

  async delete(id) {
    const collection = readAssets();
    const index = findIndex(collection, id);
    assertAssetExists(index, id);
    collection.splice(index, 1);
    writeAssets(collection);
    return true;
  },
};

export { Asset };

export default Asset;
