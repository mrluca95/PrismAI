import { readCollection, writeCollection, generateId, nowIso, clearItem } from './storage';

const STORAGE_KEY = 'ai_insights';

let currentUserId = null;

const storageKeyFor = (userId = currentUserId) => (userId ? `${STORAGE_KEY}_${userId}` : STORAGE_KEY);

const readInsights = () => readCollection(storageKeyFor());
const writeInsights = (collection) => writeCollection(storageKeyFor(), collection);

const migrateLegacyData = (userId) => {
  if (!userId) {
    return;
  }
  const legacyCollection = readCollection(STORAGE_KEY);
  if (legacyCollection && legacyCollection.length > 0) {
    clearItem(STORAGE_KEY);
  }
};

const clone = (insight) => ({
  ...insight,
  related_assets: [...(insight.related_assets || [])],
});

const sortCollection = (collection, sortBy) => {
  if (!sortBy) {
    return [...collection];
  }
  const direction = sortBy.startsWith('-') ? -1 : 1;
  const field = sortBy.replace(/^[-+]/, '') || 'created_date';

  return [...collection].sort((a, b) => {
    const aValue = a[field];
    const bValue = b[field];

    if (field === 'created_date') {
      const aTime = new Date(aValue || 0).getTime();
      const bTime = new Date(bValue || 0).getTime();
      return direction * (aTime - bTime);
    }

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return direction * (aValue - bValue);
    }

    return direction * String(aValue || '').localeCompare(String(bValue || ''));
  });
};

const AIInsight = {
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

  async list(sortBy = '-created_date', limit) {
    let collection = readInsights();
    collection = sortCollection(collection, sortBy);
    if (typeof limit === 'number') {
      collection = collection.slice(0, limit);
    }
    return collection.map(clone);
  },

  async create({ title, description, type = 'opportunity', priority = 'medium', related_assets = [] }) {
    const collection = readInsights();
    const payload = {
      id: generateId(),
      created_date: nowIso(),
      title: title || 'Portfolio Insight',
      description: description || '',
      type,
      priority,
      related_assets: related_assets.filter(Boolean),
    };
    collection.unshift(payload);
    writeInsights(collection);
    return clone(payload);
  },
};

export { AIInsight };

export default AIInsight;
