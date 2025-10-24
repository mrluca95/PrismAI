const DEFAULT_RATES = Object.freeze({
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 157,
  CHF: 0.9,
  CAD: 1.37,
  AUD: 1.5,
});

const SUPPORTED_CODES = Object.keys(DEFAULT_RATES);

const PROVIDER_URL = process.env.CURRENCY_RATES_URL || 'https://open.er-api.com/v6/latest/USD';
const CACHE_TTL_MS = parseDuration(process.env.CURRENCY_CACHE_TTL_MS, 6 * 60 * 60 * 1000);
const REQUEST_TIMEOUT_MS = parseDuration(process.env.CURRENCY_RATES_TIMEOUT_MS, 5000);

let cache = {
  base: 'USD',
  rates: { ...DEFAULT_RATES },
  fetchedAt: null,
  fetchedMs: 0,
  provider: 'static',
  fallback: true,
  error: null,
};

let refreshPromise = null;

function parseDuration(value, fallback) {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const sanitizeRates = (source) => {
  const next = { ...DEFAULT_RATES };
  if (source && typeof source === 'object') {
    for (const code of SUPPORTED_CODES) {
      const raw = source[code];
      const numeric = Number(raw);
      if (Number.isFinite(numeric) && numeric > 0) {
        next[code] = numeric;
      }
    }
  }
  next.USD = 1;
  return next;
};

const withTimeout = async (promiseFactory) => {
  if (!Number.isFinite(REQUEST_TIMEOUT_MS) || REQUEST_TIMEOUT_MS <= 0) {
    return promiseFactory();
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await promiseFactory(controller);
  } finally {
    clearTimeout(timer);
  }
};

const fetchRatesFromProvider = async () => withTimeout(async (controller) => {
  const response = await fetch(PROVIDER_URL, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    signal: controller?.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    const snippet = text ? text.slice(0, 120) : '';
    throw new Error(`Currency provider responded with status ${response.status}${snippet ? `: ${snippet}` : ''}`);
  }

  return response.json();
});

async function refreshRatesInternal() {
  try {
    const payload = await fetchRatesFromProvider();
    const sanitized = sanitizeRates(payload?.rates);
    const updatedAt = payload?.time_last_update_unix
      ? new Date(payload.time_last_update_unix * 1000).toISOString()
      : new Date().toISOString();

    cache = {
      base: typeof payload?.base_code === 'string' ? payload.base_code.toUpperCase() : 'USD',
      rates: sanitized,
      fetchedAt: updatedAt,
      fetchedMs: Date.now(),
      provider: payload?.provider || 'open.er-api.com',
      fallback: false,
      error: null,
    };
  } catch (error) {
    const message = error?.message || 'Unable to refresh currency rates.';
    console.error('[server] currency refresh failed', message);
    cache = {
      ...cache,
      fetchedMs: Date.now(),
      fallback: true,
      error: message,
    };
  }

  return cache;
}

export async function getCurrencyRates({ forceRefresh = false } = {}) {
  const now = Date.now();
  const ttl = Number.isFinite(CACHE_TTL_MS) && CACHE_TTL_MS > 0 ? CACHE_TTL_MS : 6 * 60 * 60 * 1000;
  const needsRefresh = forceRefresh || !cache.fetchedAt || (now - cache.fetchedMs) > ttl;

  if (needsRefresh) {
    if (!refreshPromise) {
      refreshPromise = refreshRatesInternal().finally(() => {
        refreshPromise = null;
      });
    }
    await refreshPromise;
  }

  return {
    base: cache.base,
    rates: { ...cache.rates },
    asOf: cache.fetchedAt,
    provider: cache.provider,
    fallback: cache.fallback,
    error: cache.error,
  };
}

export const defaultRates = DEFAULT_RATES;
