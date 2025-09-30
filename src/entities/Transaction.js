import { readCollection, writeCollection, generateId, nowIso } from './storage';

const STORAGE_KEY = 'transactions';

export const Transaction = {
  async list() {
    const collection = readCollection(STORAGE_KEY);
    return [...collection].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  },

  async create(data) {
    const collection = readCollection(STORAGE_KEY);
    const payload = {
      id: generateId(),
      created_at: nowIso(),
      ...data,
    };
    collection.push(payload);
    writeCollection(STORAGE_KEY, collection);
    return { ...payload };
  },
};

export default Transaction;
