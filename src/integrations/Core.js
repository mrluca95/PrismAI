import { Asset } from '@/entities/Asset';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/?$/, '');
const HAS_BACKEND = Boolean(API_BASE_URL);
const FALLBACK_UPLOAD_STORE = new Map();

const delay = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));

const randomId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

async function requestJson(path, { method = 'POST', body, headers = {} } = {}) {
  if (!HAS_BACKEND) {
    throw new Error('API base URL is not configured. Set VITE_API_BASE_URL to your backend URL.');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...headers,
    },
    body,
    credentials: 'include',
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (parseError) {
    throw new Error(text || 'Received non-JSON response from server');
  }

  if (!response.ok) {
    const message = data?.message || data?.error || response.statusText || 'Request failed';
    const error = new Error(message);
    error.status = response.status;
    if (data && typeof data === 'object') {
      if (data.error && typeof data.error === 'string') {
        error.code = data.error;
      }
      if (data.details !== undefined) {
        error.details = data.details;
      }
    }
    throw error;
  }

  return data;
}

// ----------------------
// Backend integrations
// ----------------------

export async function InvokeLLM(options = {}) {
  if (!HAS_BACKEND) {
    return fallbackInvokeLLM(options);
  }

  const response = await requestJson('/api/invoke-llm', {
    body: JSON.stringify(options),
    headers: {
      'Content-Type': 'application/json',
    },
  });
  return response.result;
}

export async function UploadFile({ file }) {
  if (!(file instanceof File || (typeof Blob !== 'undefined' && file instanceof Blob))) {
    throw new Error('A File or Blob must be provided to UploadFile');
  }

  if (!HAS_BACKEND) {
    const id = `uploaded://${randomId()}`;
    FALLBACK_UPLOAD_STORE.set(id, file);
    return { file_url: id, name: file.name, size: file.size };
  }

  const formData = new FormData();
  formData.append('file', file);
  return requestJson('/api/upload', {
    body: formData,
    method: 'POST',
  });
}

export async function ExtractDataFromUploadedFile({ file_url: fileUrl, json_schema: schema }) {
  if (!schema) {
    throw new Error('json_schema is required when extracting data');
  }

  if (!HAS_BACKEND) {
    return fallbackExtractData();
  }

  return requestJson('/api/extract', {
    body: JSON.stringify({ file_url: fileUrl, json_schema: schema }),
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function FetchPriceDetails({ symbol, date, time, preferOpenAI = false, expectedName = "" }) {
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  if (!normalizedSymbol) {
    throw new Error('symbol is required');
  }
  if (!date) {
    throw new Error('date is required');
  }
  const normalizedTime = time ? String(time).trim() : '';

  if (!HAS_BACKEND) {
    return fallbackFetchPriceDetails({ symbol: normalizedSymbol, date, time: normalizedTime });
  }

  const payload = { symbol: normalizedSymbol, date };
  if (normalizedTime) {
    payload.time = normalizedTime;
  }

  return requestJson('/api/prices/details', {
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function FetchPriceTimeline({ symbol, timeline = '1M' }) {
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  if (!normalizedSymbol) {
    throw new Error('symbol is required');
  }

  const timelineKey = String(timeline || '1M').toUpperCase();

  if (!HAS_BACKEND) {
    return fallbackFetchPriceTimeline({ symbol: normalizedSymbol, timeline: timelineKey });
  }

  return requestJson('/api/prices/history', {
    body: JSON.stringify({ symbol: normalizedSymbol, timeline: timelineKey }),
    headers: { 'Content-Type': 'application/json' },
  });
}
export async function SearchSymbols(query = '') {
  const trimmed = String(query || '').trim();
  if (!trimmed) {
    return { symbols: [] };
  }

  if (!HAS_BACKEND) {
    return fallbackSearchSymbols(trimmed);
  }

  const endpoint = `/api/symbols/search?q=${encodeURIComponent(trimmed)}`;

  try {
    const response = await requestJson(endpoint, { method: 'GET' });
    return response || { symbols: [] };
  } catch (error) {
    console.warn('[Core] symbol search failed, falling back to local directory', error);
    return fallbackSearchSymbols(trimmed);
  }
}

export async function FetchQuotes(symbols = []) {
  const input = Array.isArray(symbols) ? symbols : [];
  const uniqueSymbols = [...new Set(input.map((symbol) => String(symbol || '').trim().toUpperCase()).filter(Boolean))];
  if (uniqueSymbols.length === 0) {
    return {};
  }

  if (!HAS_BACKEND) {
    throw new Error('Price updates require the Prism AI backend to be running.');
  }

  const response = await requestJson('/api/prices', {
    body: JSON.stringify({ symbols: uniqueSymbols }),
    headers: { 'Content-Type': 'application/json' },
  });
  return response.data || {};
}

// ----------------------
// Legacy fallbacks (mocked data)
// ----------------------

const fallbackSearchSymbols = (query) => {
  const lowered = String(query || '').trim().toLowerCase();
  if (!lowered) {
    return { symbols: [] };
  }
  const matches = Object.entries(symbolDirectory)
    .filter(([symbol, meta]) => {
      const label = `${symbol} ${meta?.name || ''}`.toLowerCase();
      return label.includes(lowered);
    })
    .slice(0, 10)
    .map(([symbol, meta]) => ({
      symbol,
      name: meta?.name || '',
      exchange: meta?.exchange || '',
      type: meta?.type || '',
    }));
  return { symbols: matches };
};

const symbolDirectory = {
  AAPL: { name: 'Apple Inc.', type: 'stock', exchange: 'NASDAQ' },
  MSFT: { name: 'Microsoft Corporation', type: 'stock', exchange: 'NASDAQ' },
  GOOGL: { name: 'Alphabet Inc. Class A', type: 'stock', exchange: 'NASDAQ' },
  AMZN: { name: 'Amazon.com, Inc.', type: 'stock', exchange: 'NASDAQ' },
  META: { name: 'Meta Platforms, Inc.', type: 'stock', exchange: 'NASDAQ' },
  TSLA: { name: 'Tesla Motors', type: 'stock', exchange: 'NASDAQ' },
  NVDA: { name: 'NVIDIA Corporation', type: 'stock', exchange: 'NASDAQ' },
  SPY: { name: 'SPDR S&P 500 ETF Trust', type: 'etf', exchange: 'NYSE' },
  QQQ: { name: 'Invesco QQQ Trust', type: 'etf', exchange: 'NASDAQ' },
  VOO: { name: 'Vanguard S&P 500 ETF', type: 'etf', exchange: 'NYSE' },
  ETH: { name: 'Ethereum', type: 'crypto', exchange: 'Coinbase' },
  BTC: { name: 'Bitcoin', type: 'crypto', exchange: 'Coinbase' },
};

const hashNumber = (value) => {
  const stringValue = value.toString();
  let hash = 0;
  for (let i = 0; i < stringValue.length; i += 1) {
    hash = (hash * 31 + stringValue.charCodeAt(i)) % 100000;
  }
  return hash;
};

const pseudoPrice = (symbol) => {
  const base = hashNumber(symbol);
  return 80 + (base % 500) + ((base % 97) / 10);
};

const fallbackExtractSymbols = (prompt) => {
  if (!prompt) {
    return [];
  }
  const matches = prompt.match(/[A-Z]{2,6}/g) || [];
  const blacklist = new Set(['JSON', 'HTTP', 'HTTPS', 'LLM', 'URL', 'ENUM']);
  return [...new Set(matches.filter((token) => !blacklist.has(token)))];
};

const fallbackChooseSector = (symbol) => {
  const sectorMap = {
    AAPL: 'Technology',
    TSLA: 'Consumer Discretionary',
    ETH: 'Other',
    BTC: 'Other',
    VOO: 'Financial Services',
  };
  return sectorMap[symbol] || 'Other';
};

const fallbackFormatInsight = (symbols) => {
  const headline = symbols.length > 1 ? 'Balance Concentration' : 'Stay Opportunistic';
  const focus = symbols.length > 0 ? symbols.join(', ') : 'your holdings';
  return `**${headline}**\n\n${focus} show steady momentum this week. Consider trimming profits into cash or reallocating into defensive sectors to smooth volatility.\n\n[Source](https://www.investopedia.com/terms/p/portfolio-diversification.asp)`;
};

const fallbackFormatAssetAnalysis = (symbol, name, type, currentPrice, gainLossPercent) => {
  return `**Performance Assessment**\n\n- ${name} is trading near $${currentPrice.toFixed(2)}, reflecting ${gainLossPercent >= 0 ? 'upside momentum' : 'recent pressure'}.\n\n**Key Drivers**\n\n- Recent news keeps ${symbol} in focus; monitor earnings and macro guidance.\n- ${type === 'crypto' ? 'On-chain activity remains elevated.' : 'Analysts expect stable revenue growth.'}\n\n**Outlook**\n\n- Maintain position with periodic reviews. Consider stop-loss protection if your risk budget is tight.`;
};

const fallbackBuildMarketStatus = (prompt) => {
  const isCrypto = /type:\s*crypto/i.test(prompt);
  const now = new Date();
  if (isCrypto) {
    return { status: 'open', next_opening_time: null, exchange_name: 'Coinbase' };
  }
  const utcHour = now.getUTCHours();
  const utcDay = now.getUTCDay(); // 0 Sunday
  const marketOpenHour = 13; // 13:30 UTC
  const marketCloseHour = 20; // 20:00 UTC roughly
  const isWeekend = utcDay === 6 || utcDay === 0;
  if (!isWeekend && utcHour >= marketOpenHour && utcHour < marketCloseHour) {
    return { status: 'open', next_opening_time: null, exchange_name: 'NYSE' };
  }
  const next = new Date(now);
  do {
    next.setUTCDate(next.getUTCDate() + 1);
  } while (next.getUTCDay() === 6 || next.getUTCDay() === 0);
  next.setUTCHours(marketOpenHour, 30, 0, 0);
  return { status: 'closed', next_opening_time: next.toISOString(), exchange_name: 'NYSE' };
};

const fallbackFetchPriceDetails = async ({ symbol, date, time }) => {
  await delay(80);
  const upperSymbol = String(symbol || '').trim().toUpperCase();
  const basePrice = pseudoPrice(upperSymbol);
  const meta = symbolDirectory[upperSymbol] || { name: `${upperSymbol} Holdings`, type: 'stock' };

  const targetDate = new Date(date);
  const today = new Date();
  const diffDays = Math.max(0, Math.floor((today - targetDate) / (1000 * 60 * 60 * 24)));
  const historical = basePrice * (1 - Math.min(diffDays, 30) * 0.0025);
  const purchaseTimestamp = (() => {
    if (!date) return null;
    try {
      const iso = `${date}T${(time || '00:00').padStart(5, '0')}:00`;
      const parsed = new Date(iso);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    } catch (error) {
      return null;
    }
  })();

  return {
    symbol: upperSymbol,
    historical_price: Number(historical.toFixed(2)),
    historical_price_date: date,
    historical_price_timestamp: purchaseTimestamp,
    current_price: Number(basePrice.toFixed(2)),
    current_price_timestamp: new Date().toISOString(),
    name: meta.name,
    type: meta.type,
    meta: { fallback: true },
  };
};
const fallbackFetchPriceTimeline = async ({ symbol, timeline }) => {
  await delay(80);
  const upperSymbol = String(symbol || '').trim().toUpperCase();
  const meta = symbolDirectory[upperSymbol] || { name: `${upperSymbol} Holdings`, type: 'stock' };
  const basePrice = pseudoPrice(upperSymbol);
  const timelineKey = String(timeline || '1M').toUpperCase();

  const DAY_MS = 24 * 60 * 60 * 1000;
  const startOfYear = new Date(new Date().getFullYear(), 0, 1).getTime();
  const daysSinceYTD = Math.max(30, Math.floor((Date.now() - startOfYear) / DAY_MS));

  const fallbackConfig = {
    '1D': { points: 24, stepMs: DAY_MS / 24 },
    '1W': { points: 7, stepMs: DAY_MS },
    '1M': { points: 30, stepMs: DAY_MS },
    '3M': { points: 90, stepMs: DAY_MS },
    'YTD': { points: daysSinceYTD, stepMs: DAY_MS },
    '1Y': { points: 52, stepMs: 7 * DAY_MS },
    ALL: { points: 120, stepMs: 30 * DAY_MS },
  };

  const config = fallbackConfig[timelineKey] || fallbackConfig['1M'];
  const series = [];
  const nowMs = Date.now();

  for (let index = config.points - 1; index >= 0; index -= 1) {
    const timestamp = new Date(nowMs - index * config.stepMs);
    const progress = (config.points - index) / Math.max(config.points, 1);
    const drift = (progress - 0.5) * 0.08 * basePrice;
    const noise = (Math.random() - 0.5) * 0.02 * basePrice;
    const price = Math.max(0.01, basePrice + drift + noise);
    series.push({
      timestamp: timestamp.toISOString(),
      close: Number(price.toFixed(2)),
    });
  }

  return {
    symbol: upperSymbol,
    name: meta.name,
    type: meta.type,
    currency: 'USD',
    timezone: 'UTC',
    timeline: timelineKey,
    series,
    meta: {
      provider: 'fallback',
      range: timelineKey,
      interval: config.stepMs,
    },
  };
};
const fallbackBuildAssetDetail = (prompt) => {
  const symbols = fallbackExtractSymbols(prompt);
  const symbol = symbols.find((item) => item !== 'JSON') || 'ASSET';
  const meta = symbolDirectory[symbol] || { name: `${symbol} Holdings`, type: 'stock' };
  const current = pseudoPrice(symbol);
  const historical = current * 0.95;
  return {
    historical_price: Number(historical.toFixed(2)),
    current_price: Number(current.toFixed(2)),
    name: meta.name,
    type: meta.type,
  };
};

async function fallbackInvokeLLM(options = {}) {
  const { prompt = '', response_json_schema: schema } = options;
  await delay();

  if (schema && schema.properties) {
    const props = schema.properties;
    if (Object.prototype.hasOwnProperty.call(props, 'status')) {
      return fallbackBuildMarketStatus(prompt);
    }
    if (Object.prototype.hasOwnProperty.call(props, 'historical_price') && Object.prototype.hasOwnProperty.call(props, 'current_price')) {
      return fallbackBuildAssetDetail(prompt);
    }
  }

  if (/current market price/i.test(prompt)) {
    const symbols = fallbackExtractSymbols(prompt);
    const priced = symbols.reduce((acc, symbol) => {
      acc[symbol] = Number(pseudoPrice(symbol).toFixed(2));
      return acc;
    }, {});
    if (Object.keys(priced).length === 0) {
      priced.AAPL = Number(pseudoPrice('AAPL').toFixed(2));
    }
    return JSON.stringify(priced);
  }

  if (/primary market sector/i.test(prompt)) {
    const symbols = fallbackExtractSymbols(prompt);
    const mapped = symbols.reduce((acc, symbol) => {
      acc[symbol] = fallbackChooseSector(symbol);
      return acc;
    }, {});
    if (Object.keys(mapped).length === 0) {
      mapped.AAPL = 'Technology';
    }
    return JSON.stringify(mapped);
  }

  if (/portfolio summary/i.test(prompt) || /generate a new, unique, and actionable investment insight/i.test(prompt)) {
    const symbols = fallbackExtractSymbols(prompt);
    return fallbackFormatInsight(symbols);
  }

  if (/investment analysis/i.test(prompt)) {
    const symbols = fallbackExtractSymbols(prompt);
    const symbol = symbols[0] || 'ASSET';
    const meta = symbolDirectory[symbol] || { name: `${symbol} Holdings`, type: 'stock' };
    const currentPrice = pseudoPrice(symbol);
    const gainLossPercent = ((currentPrice - currentPrice * 0.92) / (currentPrice * 0.92)) * 100;
    return fallbackFormatAssetAnalysis(symbol, meta.name, meta.type, currentPrice, gainLossPercent);
  }

  if (/investment analysis for the '(.+)' category/i.test(prompt)) {
    const match = prompt.match(/the '([^']+)' category/i);
    const name = match ? match[1] : 'This';
    return `**Overall Performance**\n\n- ${name} assets continue to drive the portfolio. Gains remain concentrated in a handful of positions.\n\n**Concentration Risk**\n\n- Consider capping exposure at 25% to reduce drawdown risk.\n\n**Actionable Insight**\n\n- Add a complementary position in a defensive sector to balance momentum.`;
  }

  return 'Prism AI helper response ready.';
}

async function fallbackExtractData() {
  await delay(220);
  const existingAssets = await Asset.list();
  const sample = existingAssets.slice(0, 3).map((asset) => ({
    symbol: asset.symbol,
    name: asset.name,
    quantity: asset.quantity,
    current_price: asset.current_price,
    market_value: asset.market_value,
    purchase_price: asset.purchase_price,
    type: asset.type,
  }));
  if (sample.length === 0) {
    sample.push({
      symbol: 'AAPL',
      name: 'Apple Inc.',
      quantity: 10,
      current_price: Number(pseudoPrice('AAPL').toFixed(2)),
      market_value: Number((10 * pseudoPrice('AAPL')).toFixed(2)),
      purchase_price: 150,
      type: 'stock',
    });
  }
  return {
    status: 'success',
    output: {
      assets: sample,
    },
  };
}




export { requestJson };



