import { readItem, writeItem } from '../entities/storage.js';

const CACHE_PREFIX = 'price_cache_';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const normaliseDate = (input) => {
  const d = new Date(input);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

const dateKey = (date) => normaliseDate(date).toISOString().slice(0, 10);

async function fetchStooqHistory(symbol) {
  const lower = symbol.toLowerCase();
  const url = `https://stooq.pl/db/d/l/?s=${encodeURIComponent(lower)}&i=d`;
  const response = await fetch(url, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Stooq returned ${response.status}`);
  }
  const text = await response.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  const [, ...rows] = lines; // drop header
  return rows
    .map((line) => {
      const [date, open, high, low, close] = line.split(',');
      const parsedClose = Number(close);
      if (!date || !Number.isFinite(parsedClose)) {
        return null;
      }
      return { date: normaliseDate(date), close: parsedClose };
    })
    .filter(Boolean);
}

async function fetchYahooHistory(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=max&interval=1d&includePrePost=false`;
  const response = await fetch(url, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Yahoo Finance returned ${response.status}`);
  }
  const json = await response.json();
  const result = json?.chart?.result?.[0];
  if (!result) {
    throw new Error('Missing price history');
  }
  const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const closes = Array.isArray(result?.indicators?.quote?.[0]?.close)
    ? result.indicators.quote[0].close
    : [];
  const series = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const close = Number(closes[i]);
    if (!Number.isFinite(close)) continue;
    series.push({ date: normaliseDate(new Date(timestamps[i] * 1000)), close });
  }
  if (series.length === 0) {
    throw new Error('Empty price history');
  }
  return series;
}

export class PriceProvider {
  constructor() {
    this.cache = new Map();
  }

  readCache(symbol) {
    if (this.cache.has(symbol)) {
      return this.cache.get(symbol);
    }
    const stored = readItem(`${CACHE_PREFIX}${symbol}`, null);
    if (stored) {
      this.cache.set(symbol, stored);
      return stored;
    }
    return null;
  }

  writeCache(symbol, payload) {
    this.cache.set(symbol, payload);
    writeItem(`${CACHE_PREFIX}${symbol}`, payload);
  }

  async ensureHistory(symbol) {
    const normalized = String(symbol || '').trim().toUpperCase();
    if (!normalized) {
      return { prices: {}, lastFetched: 0, source: 'none' };
    }

    const cached = this.readCache(normalized);
    const now = Date.now();
    if (cached && now - (cached.lastFetched || 0) < ONE_DAY_MS) {
      return cached;
    }

    let series = [];
    let source = 'stooq';
    try {
      series = await fetchStooqHistory(normalized);
    } catch (error) {
      console.warn(`[PriceProvider] stooq failed for ${normalized}`, error?.message || error);
      source = 'yahoo';
      series = await fetchYahooHistory(normalized);
    }

    const prices = series.reduce((acc, point) => {
      acc[dateKey(point.date)] = point.close;
      return acc;
    }, {});

    const payload = { prices, lastFetched: now, source };
    this.writeCache(normalized, payload);
    return payload;
  }

  async getDailyCloses(symbol, startDate, endDate) {
    const history = await this.ensureHistory(symbol);
    const start = normaliseDate(startDate);
    const end = normaliseDate(endDate);
    const prices = history.prices || {};
    const dates = [];
    for (let ts = start.getTime(); ts <= end.getTime(); ts += ONE_DAY_MS) {
      dates.push(new Date(ts));
    }
    const sortedKeys = Object.keys(prices).sort();
    let lastKnown = null;
    const lookup = new Map();
    sortedKeys.forEach((key) => {
      const d = new Date(key);
      lookup.set(dateKey(d), prices[key]);
    });

    const series = dates.map((date) => {
      const key = dateKey(date);
      if (lookup.has(key)) {
        lastKnown = lookup.get(key);
      }
      return { date, close: lastKnown };
    });
    series.source = history.source;
    series.lastFetched = history.lastFetched;
    return series;
  }
}

export default PriceProvider;
