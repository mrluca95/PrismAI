const STORAGE_PREFIX = 'prism_ai_';
const fallbackStore = new Map();

const getStore = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
};

const buildKey = (key) => `${STORAGE_PREFIX}${key}`;

export function readItem(key, defaultValue) {
  const storageKey = buildKey(key);
  const store = getStore();
  if (store) {
    const raw = store.getItem(storageKey);
    if (!raw) {
      return defaultValue;
    }
    try {
      return JSON.parse(raw);
    } catch (error) {
      console.warn('Failed to parse stored value for', storageKey, error);
      return defaultValue;
    }
  }
  if (!fallbackStore.has(storageKey) && defaultValue !== undefined) {
    fallbackStore.set(storageKey, defaultValue);
  }
  return fallbackStore.get(storageKey) ?? defaultValue;
}

export function writeItem(key, value) {
  const storageKey = buildKey(key);
  const store = getStore();
  try {
    const serialized = JSON.stringify(value);
    if (store) {
      store.setItem(storageKey, serialized);
    } else {
      fallbackStore.set(storageKey, value);
    }
  } catch (error) {
    console.error('Failed to store value for', storageKey, error);
  }
  return value;
}

export function clearItem(key) {
  const storageKey = buildKey(key);
  const store = getStore();
  if (store) {
    store.removeItem(storageKey);
  }
  fallbackStore.delete(storageKey);
}

export function readCollection(key) {
  const value = readItem(key, []);
  return Array.isArray(value) ? value : [];
}

export function writeCollection(key, value) {
  if (!Array.isArray(value)) {
    throw new Error('writeCollection expects an array value');
  }
  return writeItem(key, value);
}

export function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function nowIso() {
  return new Date().toISOString();
}
