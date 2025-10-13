import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import crypto from 'node:crypto';
import OpenAI from 'openai';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import passport, { configurePassport } from './auth/passport.js';
import { config, getTierLimits } from './lib/config.js';
import { requireAuth, optionalAuth } from './middleware/auth.js';
import { getUsage, assertWithinQuota, consumeUsage } from './lib/usage.js';
import { sanitizeUser, getUserById, getUserByEmail, createUser, updateUser } from './lib/users.js';
import { AuthProvider } from './lib/auth-providers.js';

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const PORT = process.env.PORT || 4000;
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const DEFAULT_SYSTEM_PROMPT = process.env.OPENAI_SYSTEM_PROMPT || 'You are Prism AI, an investment copilot. Provide concise, well-structured answers, and never fabricate data you cannot verify.';
const OPENAI_MAX_OUTPUT_TOKENS = Number.isNaN(Number.parseInt(process.env.OPENAI_MAX_OUTPUT_TOKENS, 10)) ? 1500 : Number.parseInt(process.env.OPENAI_MAX_OUTPUT_TOKENS, 10);

const PgSession = connectPgSimple(session);

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'https://mrluca95.github.io',
  'https://www.prismai-portfolio.com',
  'https://prismai-portfolio.com',
];
const allowedOrigins = config.cors.allowedOrigins.length ? config.cors.allowedOrigins : DEFAULT_ALLOWED_ORIGINS;
const GOOGLE_AUTH_ENABLED = Boolean(config.google.clientId && config.google.clientSecret && config.google.callbackUrl);

if (config.isProduction) {
  app.set('trust proxy', 1);
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin ' + origin + ' not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

const sessionOptions = {
  name: 'prism.sid',
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: config.session.cookieSecure,
    sameSite: config.session.cookieSecure ? 'none' : 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 30,
  },
};

if (config.session.cookieDomain) {
  sessionOptions.cookie.domain = config.session.cookieDomain;
}

if (process.env.DATABASE_URL) {
  sessionOptions.store = new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: 'user_sessions',
    createTableIfMissing: true,
  });
} else {
  console.warn('[server] DATABASE_URL is not set. Falling back to in-memory session store; not recommended for production.');
}

if (!process.env.SESSION_SECRET) {
  console.warn('[server] SESSION_SECRET is not set. Using fallback secret; configure a strong secret in production.');
}

configurePassport();
app.use(session(sessionOptions));
app.use(passport.initialize());
app.use(passport.session());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/auth/', authLimiter);

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 180,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

let openaiClient = null;
if (process.env.OPENAI_API_KEY) {
  openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
} else {
  console.warn('[server] OPENAI_API_KEY is not set. AI endpoints will return 500 until you provide one.');
}

const uploadStore = new Map();

const sanitizeOpenAIError = (error, fallback = 'AI request failed.') => {
  const status = error?.status ?? error?.response?.status ?? 502;
  let message = fallback;

  const responseMessage = error?.response?.data?.error?.message
    || error?.response?.data?.error
    || error?.response?.data
    || error?.message;

  if (typeof responseMessage === 'string' && responseMessage.trim().length > 0) {
    message = responseMessage;
  }

  if (typeof message === 'string') {
    message = message.replace(/(sk|OPENAI)[-_A-Za-z0-9]+/g, '[redacted key]');
  } else {
    message = fallback;
  }

  if (status === 401) {
    return { status: 500, message: 'OpenAI rejected the configured API key. Verify OPENAI_API_KEY on the server.' };
  }
  if (status === 429) {
    return { status: 429, message: 'OpenAI rate limit hit. Please wait and retry.' };
  }

  return { status: status || 502, message };
};

const LLM_CACHE_TTL_MS = Number(process.env.LLM_CACHE_TTL_MS || 1000 * 60 * 5);
const LLM_CACHE_MAX_ENTRIES = Number(process.env.LLM_CACHE_MAX_ENTRIES || 50);
const PRICE_CACHE_TTL_MS = Number(process.env.PRICE_CACHE_TTL_MS || 1000 * 60 * 2);
const PRICE_CACHE_MAX_ENTRIES = Number(process.env.PRICE_CACHE_MAX_ENTRIES || 100);
const PRICE_MAX_SYMBOLS_PER_REQUEST = Number(process.env.PRICE_MAX_SYMBOLS_PER_REQUEST || 0);
const PRICE_HISTORY_TTL_MS = Number(process.env.PRICE_HISTORY_TTL_MS || 1000 * 60 * 60 * 6);
const PRICE_HISTORY_MAX_ENTRIES = Number(process.env.PRICE_HISTORY_MAX_ENTRIES || 50);
const PRICE_INTRADAY_TTL_MS = Number(process.env.PRICE_INTRADAY_TTL_MS || 1000 * 60 * 5);
const PRICE_INTRADAY_MAX_ENTRIES = Number(process.env.PRICE_INTRADAY_MAX_ENTRIES || 50);
const PRICE_INTRADAY_LOOKBACK_MS = Number(process.env.PRICE_INTRADAY_LOOKBACK_MS || 1000 * 60 * 60 * 24 * 30);

const llmCache = new Map();
const llmInFlight = new Map();
const priceCache = new Map();
const priceInFlight = new Map();
const priceHistoryCache = new Map();
const priceHistoryInFlight = new Map();
const priceIntradayCache = new Map();
const priceIntradayInFlight = new Map();

const SYMBOL_SEARCH_TTL_MS = Number(process.env.SYMBOL_SEARCH_TTL_MS || 1000 * 60 * 10);
const SYMBOL_SEARCH_MAX_RESULTS = Number(process.env.SYMBOL_SEARCH_MAX_RESULTS || 25);
const symbolSearchCache = new Map();

const YAHOO_CHART_HEADERS = {
  'User-Agent': 'PrismAI/1.0 (+https://github.com/mrluca95/PrismAI)',
  Accept: 'application/json',
};

const yahooSymbolCache = new Map();

const mapYahooChartType = (instrumentType = '') => {
  const lowered = String(instrumentType || '').toLowerCase();
  if (lowered.includes('etf')) return 'etf';
  if (lowered.includes('mutual')) return 'mutual_fund';
  if (lowered.includes('bond')) return 'bond';
  if (lowered.includes('crypto')) return 'crypto';
  if (lowered.includes('currency')) return 'currency';
  return 'stock';
};

const buildYahooQuoteEntry = (symbol, yahooSymbol, chartResult) => {
  const meta = chartResult?.meta || {};
  const quote = chartResult?.indicators?.quote?.[0] || {};
  const closes = Array.isArray(quote?.close) ? quote.close : [];

  let price = Number(meta?.regularMarketPrice);
  if (!Number.isFinite(price) && closes.length > 0) {
    price = Number(closes[closes.length - 1]);
  }
  if (!Number.isFinite(price)) {
    return null;
  }

  const timestamp = Number.isFinite(meta?.regularMarketTime)
    ? new Date(meta.regularMarketTime * 1000).toISOString()
    : null;
  const previousClose = Number(meta?.chartPreviousClose ?? meta?.previousClose);
  const currency = meta?.currency || null;
  const exchange = meta?.fullExchangeName || meta?.exchangeName || null;
  const name = meta?.longName || meta?.shortName || null;
  const typeGuess = mapYahooChartType(meta?.instrumentType || meta?.quoteType || '');

  return {
    source: 'yahoo_chart',
    value: {
      price,
      previousClose: Number.isFinite(previousClose) ? previousClose : null,
      currency,
      exchange,
      timestamp,
    },
    meta: {
      name,
      type: typeGuess,
      yahooSymbol,
    },
    timestamp: nowMs(),
  };
};

const buildYahooSymbolCandidates = (symbol) => {
  const candidates = new Set();
  const trimmed = String(symbol || '').trim();
  if (!trimmed) {
    return [];
  }

  const collapsed = trimmed.replace(/\s+/g, '');
  const dotted = trimmed.replace(/\s+/g, '.');
  const dashed = trimmed.replace(/\s+/g, '-');

  candidates.add(trimmed);
  candidates.add(collapsed);
  candidates.add(dotted);
  candidates.add(dashed);

  if (!trimmed.includes('.')) {
    candidates.add(`${collapsed}.US`);
    candidates.add(`${trimmed}.US`);
  }

  return Array.from(candidates).filter(Boolean);
};

const fetchYahooChart = async (symbol, { range = '1d', interval = '1m' } = {}) => {
  if (!symbol) {
    return null;
  }
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set('range', range);
  url.searchParams.set('interval', interval);
  url.searchParams.set('includePrePost', 'true');

  const response = await fetch(url, { headers: YAHOO_CHART_HEADERS });
  if (!response.ok) {
    const error = new Error(`Yahoo chart responded with ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const json = await response.json();
  if (json?.chart?.error) {
    // Treat "Not Found" as a soft miss — return null so we can try alternatives.
    if (json.chart.error.code === 'Not Found') {
      return null;
    }
    const error = new Error(json.chart.error.description || 'Yahoo chart returned an error response.');
    error.code = json.chart.error.code;
    throw error;
  }

  const result = json?.chart?.result?.[0];
  if (!result?.meta) {
    return null;
  }
  return result;
};

const fetchYahooSymbolSearchPayload = async (query) => {
  const trimmed = String(query || '').trim();
  if (!trimmed) {
    return { symbols: [] };
  }

  const normalized = trimmed.toLowerCase();
  const cached = symbolSearchCache.get(normalized);
  if (cached && Number.isFinite(SYMBOL_SEARCH_TTL_MS) && SYMBOL_SEARCH_TTL_MS > 0 && nowMs() - cached.timestamp < SYMBOL_SEARCH_TTL_MS) {
    return cached.value;
  }

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(trimmed)}&quotesCount=${SYMBOL_SEARCH_MAX_RESULTS}&newsCount=0&enableFuzzyQuery=false&lang=en-US&region=US`;
    const response = await fetch(url, { headers: YAHOO_CHART_HEADERS });
    if (!response.ok) {
      throw new Error(`Yahoo search responded with ${response.status}`);
    }

    const json = await response.json();
    const symbols = (json?.quotes || []).map((quote) => ({
      symbol: String(quote?.symbol || '').toUpperCase(),
      name: quote?.shortname || quote?.longname || quote?.name || '',
      exchange: quote?.exchange || quote?.exchDisp || '',
      type: quote?.quoteType || quote?.typeDisp || '',
    })).filter((entry) => entry.symbol);

    const payload = { symbols };
    symbolSearchCache.set(normalized, { value: payload, timestamp: nowMs() });
    return payload;
  } catch (error) {
    console.warn(`[prices] yahoo symbol search failed for ${trimmed}`, error);
    return { symbols: [] };
  }
};

const resolveYahooQuoteEntry = async (symbol) => {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) {
    return null;
  }

  const metadata = KNOWN_SYMBOL_META.get(normalized) || null;
  const candidates = [];
  if (metadata?.yahooSymbol) {
    candidates.push(metadata.yahooSymbol);
  }
  const cachedSymbol = yahooSymbolCache.get(normalized);
  if (cachedSymbol) {
    candidates.push(cachedSymbol);
  }
  candidates.push(...buildYahooSymbolCandidates(normalized));

  const attempted = new Set();
  for (const candidate of candidates) {
    const key = String(candidate || '').trim();
    if (!key || attempted.has(key)) {
      continue;
    }
    attempted.add(key);
    try {
      const chartResult = await fetchYahooChart(key);
      if (!chartResult) {
        continue;
      }
      const entry = buildYahooQuoteEntry(normalized, key, chartResult);
      if (entry) {
        yahooSymbolCache.set(normalized, key);
        return { entry, chart: chartResult };
      }
    } catch (error) {
      console.warn(`[prices] yahoo chart failed for ${normalized} via ${key}`, error);
    }
  }

  const searchPayload = await fetchYahooSymbolSearchPayload(normalized);
  for (const match of searchPayload.symbols || []) {
    const key = String(match?.symbol || '').toUpperCase();
    if (!key || attempted.has(key)) {
      continue;
    }
    attempted.add(key);
    try {
      const chartResult = await fetchYahooChart(key);
      if (!chartResult) {
        continue;
      }
      const entry = buildYahooQuoteEntry(normalized, key, chartResult);
      if (entry) {
        yahooSymbolCache.set(normalized, key);
        return { entry, chart: chartResult };
      }
    } catch (error) {
      console.warn(`[prices] yahoo chart failed for ${normalized} via search symbol ${key}`, error);
    }
  }

  return null;
};

const extractSeriesFromChart = (chartResult) => {
  if (!chartResult) {
    return [];
  }
  const timestamps = Array.isArray(chartResult?.timestamp) ? chartResult.timestamp : [];
  const closes = Array.isArray(chartResult?.indicators?.quote?.[0]?.close)
    ? chartResult.indicators.quote[0].close
    : [];

  if (timestamps.length === 0 || closes.length === 0) {
    return [];
  }

  const series = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const time = timestamps[i];
    const close = closes[i];
    const closeNumber = Number(close);
    if (!Number.isFinite(time) || !Number.isFinite(closeNumber)) {
      continue;
    }
    series.push({
      timestamp: new Date(time * 1000).toISOString(),
      close: closeNumber,
    });
  }
  return series;
};

const chooseYahooRangeForTarget = (diffMs, hasTime) => {
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (hasTime && diffDays <= 5) {
    return { range: '5d', interval: '5m' };
  }
  if (diffDays <= 30) {
    return { range: '1mo', interval: '1d' };
  }
  if (diffDays <= 365) {
    return { range: '1y', interval: '1d' };
  }
  if (diffDays <= 365 * 5) {
    return { range: '5y', interval: '1wk' };
  }
  return { range: 'max', interval: '1mo' };
};

const mapToStooqSymbol = (symbol) => {
  const cleaned = String(symbol || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!cleaned) {
    return null;
  }
  if (cleaned.includes('.')) {
    const root = cleaned.split('.')[0];
    return `${root}.us`;
  }
  return `${cleaned}.us`;
};

const fetchDailySeriesFromStooq = async (symbol) => {
  const stooqSymbol = mapToStooqSymbol(symbol);
  if (!stooqSymbol) {
    return null;
  }
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&i=d`;
  const response = await fetch(url);

  if (!response.ok) {
    const error = new Error(`Stooq responded with ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const csv = await response.text();
  const lines = csv.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length <= 1) {
    return null;
  }

  const series = [];
  for (let i = 1; i < lines.length; i += 1) {
    const parts = lines[i].split(',');
    if (parts.length < 5) {
      continue;
    }
    const [date, , , , close] = parts;
    const closeNumber = Number(close);
    if (!date || Number.isNaN(closeNumber)) {
      continue;
    }
    series.push({
      date,
      close: closeNumber,
    });
  }

  if (series.length === 0) {
    return null;
  }

  return {
    series,
    timestamp: nowMs(),
    source: 'stooq',
  };
};

const mapUsage = (usage) => ({
  llmCalls: usage.llmCalls,
  priceRequests: usage.priceRequests,
  uploads: usage.uploads,
  periodStart: usage.periodStart,
  periodEnd: usage.periodEnd,
});

const buildUserEnvelope = async (user) => {
  if (!user) {
    return { user: null };
  }
  const safeUser = sanitizeUser(user);
  const usage = await getUsage(safeUser.id);
  const limits = getTierLimits(safeUser.tier);
  return {
    user: safeUser,
    limits,
    usage: mapUsage(usage),
  };
};

const respondWithCurrentUser = async (req, res, status = 200) => {
  if (!req.user) {
    return res.status(status).json({ user: null });
  }
  const freshUser = await getUserById(req.user.id);
  const payload = await buildUserEnvelope(freshUser);
  return res.status(status).json(payload);
};

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().trim().min(1).max(120).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const tierUpdateSchema = z.object({
  tier: z.enum(['FREE', 'PLUS', 'PRO']),
  monthlyInsights: z.number().int().positive().optional(),
  monthlyQuotes: z.number().int().positive().optional(),
});

const profileUpdateSchema = z.object({
  onboardingCompleted: z.boolean().optional(),
  plan: z.string().optional(),
  profile: z.record(z.any()).optional(),
});

const loginUser = (req, user) => new Promise((resolve, reject) => {
  req.login(user, (err) => {
    if (err) {
      reject(err);
    } else {
      resolve();
    }
  });
});

const nowMs = () => Date.now();

const cloneValue = (value) => {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch (error) {
      // fall back to JSON clone below
    }
  }
  return JSON.parse(JSON.stringify(value));
};

const isCacheEntryFresh = (entry, ttl) => Boolean(entry && Number.isFinite(ttl) && ttl > 0 && nowMs() - entry.timestamp < ttl);

const pruneCache = (cache, maxEntries) => {
  if (!Number.isFinite(maxEntries) || maxEntries <= 0) {
    return;
  }
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (typeof oldestKey === 'undefined') {
      break;
    }
    cache.delete(oldestKey);
  }
};

const normalizeSymbol = (value) => String(value || '').trim().toUpperCase();

const KNOWN_SYMBOL_META = new Map([
  ['AAPL', { name: 'Apple Inc.', type: 'stock' }],
  ['MSFT', { name: 'Microsoft Corporation', type: 'stock' }],
  ['GOOGL', { name: 'Alphabet Inc. Class A', type: 'stock' }],
  ['AMZN', { name: 'Amazon.com, Inc.', type: 'stock' }],
  ['TSLA', { name: 'Tesla, Inc.', type: 'stock' }],
  ['META', { name: 'Meta Platforms, Inc.', type: 'stock' }],
  ['NVDA', { name: 'NVIDIA Corporation', type: 'stock' }],
  ['NFLX', { name: 'Netflix, Inc.', type: 'stock' }],
  ['SPY', { name: 'SPDR S&P 500 ETF Trust', type: 'etf' }],
  ['QQQ', { name: 'Invesco QQQ Trust', type: 'etf' }],
  ['VOO', { name: 'Vanguard S&P 500 ETF', type: 'etf' }],
  ['VTI', { name: 'Vanguard Total Stock Market ETF', type: 'etf' }],
  ['BND', { name: 'Vanguard Total Bond Market ETF', type: 'bond' }],
  ['GLD', { name: 'SPDR Gold Shares', type: 'etf' }],
  ['SLV', { name: 'iShares Silver Trust', type: 'etf' }],
  ['BTC', { name: 'Bitcoin', type: 'crypto', yahooSymbol: 'BTC-USD' }],
  ['ETH', { name: 'Ethereum', type: 'crypto', yahooSymbol: 'ETH-USD' }],
  ['BRK B', { name: 'Berkshire Hathaway Inc. Class B', type: 'stock', yahooSymbol: 'BRK-B' }],
  ['NESN', { name: 'Nestlé S.A.', type: 'stock', yahooSymbol: 'NESN.SW' }],
  ['CLS', { name: 'Celestica Inc.', type: 'stock', yahooSymbol: 'CLS.TO' }],
  ['IAG', { name: 'International Consolidated Airlines Group S.A.', type: 'stock', yahooSymbol: 'IAG.L' }],
]);

const buildLlmCacheKey = ({ prompt, schema, system_instruction, add_context_from_internet }) =>
  JSON.stringify({
    prompt,
    schema,
    system_instruction,
    add_context_from_internet: Boolean(add_context_from_internet),
  });

const extractJsonFromResponse = (response) => {
  const message = response?.choices?.[0]?.message;
  const content = message?.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part && typeof part === 'object') {
        if (part.output && typeof part.output === 'object') {
          return part.output;
        }
        if (part.json && typeof part.json === 'object') {
          return part.json;
        }
        if (part.parsed && typeof part.parsed === 'object') {
          return part.parsed;
        }
        if (part.type === 'output_json_schema' && typeof part.output === 'object') {
          return part.output;
        }
        if (part.type === 'json_schema' && typeof part.data === 'object') {
          return part.data;
        }
      }
    }
  }
  if (content && typeof content === 'object' && content.output && typeof content.output === 'object') {
    return content.output;
  }
  return null;
};

const tryParseLooseJson = (raw) => {
  if (!raw || typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const parseCandidate = (candidate) => {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      return null;
    }
  };
  const direct = parseCandidate(trimmed);
  if (direct) {
    return direct;
  }
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]+?)```/i);
  if (fenceMatch) {
    const candidate = fenceMatch[1];
    const parsed = parseCandidate(candidate.trim());
    if (parsed) {
      return parsed;
    }
  }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    const parsed = parseCandidate(candidate);
    if (parsed) {
      return parsed;
    }
  }
  const firstBracket = trimmed.indexOf('[');
  const lastBracket = trimmed.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    const candidate = trimmed.slice(firstBracket, lastBracket + 1);
    const parsed = parseCandidate(candidate);
    if (parsed) {
      return parsed;
    }
  }
  return null;
};

const extractTextFromResponse = (response) => {
  if (!response) {
    return '';
  }
  if (typeof response === 'string') {
    return response;
  }
  if (typeof response.output_text === 'string') {
    return response.output_text;
  }
  if (Array.isArray(response.output)) {
    return response.output
      .flatMap((item) =>
        Array.isArray(item?.content)
          ? item.content
              .map((chunk) => {
                if (typeof chunk === 'string') {
                  return chunk;
                }
                if (typeof chunk?.text === 'string') {
                  return chunk.text;
                }
                if (typeof chunk?.value === 'string') {
                  return chunk.value;
                }
                return '';
              })
              .filter(Boolean)
          : []
      )
      .join('\n');
  }
  if (Array.isArray(response.choices)) {
    const choice = response.choices[0];
    const messageContent = choice?.message?.content;
    if (typeof messageContent === 'string') {
      return messageContent;
    }
    if (Array.isArray(messageContent)) {
      return messageContent
        .map((part) => {
          if (typeof part === 'string') {
            return part;
          }
          if (typeof part?.text === 'string') {
            return part.text;
          }
          return '';
        })
        .join('');
    }
  }
  if (response.data?.length) {
    const item = response.data[0];
    const text = Array.isArray(item?.content)
      ? item.content.map((c) => c?.text || '').join('')
      : '';
    if (text) {
      return text;
    }
  }
  return '';
};

const parseModelJson = (raw) => {
  try {
    return JSON.parse(raw);
  } catch (error) {
    const err = new Error('Model returned invalid JSON');
    err.cause = error;
    err.raw = raw;
    throw err;
  }
};

const buildMessages = (prompt, systemInstruction, addContext) => {
  const system = [DEFAULT_SYSTEM_PROMPT];
  if (systemInstruction) {
    system.push(systemInstruction);
  }
  if (addContext) {
    system.push('When the user asks for market data, respond with your best available knowledge and explain any limitations.');
  }
  return [
    { role: 'system', content: system.join('\n') },
    { role: 'user', content: prompt },
  ];
};

const buildStooqQuoteEntry = async (symbol) => {
  try {
    const stooqData = await fetchDailySeriesFromStooq(symbol);
    const series = stooqData?.series || [];
    if (series.length === 0) {
      return null;
    }
    const sorted = [...series]
      .map((entry) => ({ ...entry, dateObj: new Date(entry.date) }))
      .filter((entry) => !Number.isNaN(entry.dateObj?.getTime()))
      .sort((a, b) => b.dateObj - a.dateObj);
    const latest = sorted[0];
    if (!latest) {
      return null;
    }
    const price = Number(latest.close);
    if (!Number.isFinite(price)) {
      return null;
    }
    const timestampGuess = latest.dateObj ? new Date(latest.dateObj) : new Date();
    timestampGuess.setHours(20, 0, 0, 0);
    return {
      source: 'stooq',
      value: {
        price,
        previousClose: null,
        currency: null,
        exchange: 'stooq',
        timestamp: timestampGuess.toISOString(),
      },
      meta: { name: KNOWN_SYMBOL_META.get(symbol)?.name || null, type: 'stock' },
      timestamp: nowMs(),
    };
  } catch (error) {
    console.warn(`[prices] stooq quote fallback failed for ${symbol}`, error);
    return null;
  }
};

const resolveYahooHistoricalPrice = async (symbol, targetDateTime) => {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) {
    return null;
  }
  const target = targetDateTime ? new Date(targetDateTime) : new Date();
  if (Number.isNaN(target.getTime())) {
    return null;
  }

  try {
    const resolved = await resolveYahooQuoteEntry(normalized);
    const yahooSymbol = resolved?.entry?.meta?.yahooSymbol || yahooSymbolCache.get(normalized);
    if (!yahooSymbol) {
      return null;
    }

    const now = Date.now();
    const diffMs = Math.abs(now - target.getTime());
    const hasTimeComponent = targetDateTime instanceof Date && !Number.isNaN(targetDateTime?.getTime()) && (target.getUTCHours() !== 0 || target.getUTCMinutes() !== 0);
    const rangeConfig = chooseYahooRangeForTarget(diffMs, hasTimeComponent);
    const chart = await fetchYahooChart(yahooSymbol, rangeConfig);
    if (!chart) {
      return null;
    }
    const series = extractSeriesFromChart(chart);
    if (series.length === 0) {
      return null;
    }

    const targetMs = target.getTime();
    let chosen = null;
    for (let i = series.length - 1; i >= 0; i -= 1) {
      const point = series[i];
      const ts = new Date(point.timestamp).getTime();
      if (!Number.isFinite(ts) || !Number.isFinite(point.close)) {
        continue;
      }
      if (ts <= targetMs) {
        chosen = point;
        break;
      }
      if (!chosen) {
        chosen = point;
      }
    }

    if (!chosen || !Number.isFinite(chosen.close)) {
      return null;
    }

    return {
      price: Number(chosen.close),
      date: chosen.timestamp.slice(0, 10),
      timestamp: chosen.timestamp,
    };
  } catch (error) {
    console.warn(`[prices] yahoo historical price failed for ${symbol}`, error);
    return null;
  }
};

const isValidQuoteEntry = (entry) => Boolean(entry && Number.isFinite(entry?.value?.price));

const resolvePriceQuote = async (symbol) => {
  const cacheKey = normalizeSymbol(symbol);
  const cached = priceCache.get(cacheKey);
  if (isCacheEntryFresh(cached, PRICE_CACHE_TTL_MS)) {
    return cached;
  }

  const inFlight = priceInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const request = (async () => {
    let entry = null;
    try {
      const resolved = await resolveYahooQuoteEntry(cacheKey);
      if (resolved?.entry) {
        entry = resolved.entry;
      }
    } catch (error) {
      console.warn(`[prices] yahoo quote resolution failed for ${cacheKey}`, error);
    }

    if (!isValidQuoteEntry(entry)) {
      entry = await buildStooqQuoteEntry(cacheKey);
    }

    if (entry && PRICE_CACHE_TTL_MS > 0) {
      priceCache.set(cacheKey, entry);
      pruneCache(priceCache, PRICE_CACHE_MAX_ENTRIES);
    }
    return entry;
  })();

  priceInFlight.set(cacheKey, request);

  try {
    return await request;
  } finally {
    priceInFlight.delete(cacheKey);
  }
};
const resolveIntradaySeries = async (symbol) => {
  const cacheKey = normalizeSymbol(symbol);
  const cached = priceIntradayCache.get(cacheKey);
  if (isCacheEntryFresh(cached, PRICE_INTRADAY_TTL_MS)) {
    return cached;
  }

  const inFlight = priceIntradayInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const request = (async () => {
    try {
      const resolved = await resolveYahooQuoteEntry(cacheKey);
      const yahooSymbol = resolved?.entry?.meta?.yahooSymbol || yahooSymbolCache.get(cacheKey);
      if (!yahooSymbol) {
        return null;
      }
      const chart = await fetchYahooChart(yahooSymbol, { range: '5d', interval: '5m' });
      if (!chart) {
        return null;
      }
      const series = extractSeriesFromChart(chart);
      if (series.length === 0) {
        return null;
      }
      const entry = { series, timestamp: nowMs() };
      if (PRICE_INTRADAY_TTL_MS > 0) {
        priceIntradayCache.set(cacheKey, entry);
        pruneCache(priceIntradayCache, PRICE_INTRADAY_MAX_ENTRIES);
      }
      return entry;
    } catch (error) {
      console.warn(`[prices] yahoo intraday lookup failed for ${cacheKey}`, error);
      return null;
    }
  })();

  priceIntradayInFlight.set(cacheKey, request);

  try {
    return await request;
  } finally {
    priceIntradayInFlight.delete(cacheKey);
  }
};
const resolveHistoricalSeries = async (symbol) => {
  const cacheKey = normalizeSymbol(symbol);
  const cached = priceHistoryCache.get(cacheKey);
  if (isCacheEntryFresh(cached, PRICE_HISTORY_TTL_MS)) {
    return cached;
  }

  const inFlight = priceHistoryInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const request = (async () => {
    try {
      const resolved = await resolveYahooQuoteEntry(cacheKey);
      const yahooSymbol = resolved?.entry?.meta?.yahooSymbol || yahooSymbolCache.get(cacheKey);
      if (!yahooSymbol) {
        return null;
      }
      const chart = await fetchYahooChart(yahooSymbol, { range: 'max', interval: '1d' });
      if (!chart) {
        return null;
      }
      const series = extractSeriesFromChart(chart).map((point) => ({
        date: point.timestamp.slice(0, 10),
        close: point.close,
      }));
      if (series.length === 0) {
        return null;
      }
      const entry = { series, timestamp: nowMs() };
      if (PRICE_HISTORY_TTL_MS > 0) {
        priceHistoryCache.set(cacheKey, entry);
        pruneCache(priceHistoryCache, PRICE_HISTORY_MAX_ENTRIES);
      }
      return entry;
    } catch (error) {
      console.warn(`[prices] yahoo historical series failed for ${cacheKey}`, error);
      return null;
    }
  })();

  priceHistoryInFlight.set(cacheKey, request);

  try {
    return await request;
  } finally {
    priceHistoryInFlight.delete(cacheKey);
  }
};

const findClosestTradingDay = (series = [], targetDate) => {
  if (!Array.isArray(series) || series.length === 0) {
    return null;
  }

  const target = new Date(targetDate);
  if (Number.isNaN(target.getTime())) {
    return null;
  }

  const targetIso = target.toISOString().slice(0, 10);
  const exact = series.find((entry) => entry.date === targetIso);
  if (exact) {
    return exact;
  }

  const earlier = series
    .filter((entry) => entry.date < targetIso)
    .sort((a, b) => (a.date > b.date ? -1 : 1));
  if (earlier.length > 0) {
    return earlier[0];
  }

  return series.sort((a, b) => (a.date < b.date ? 1 : -1))[0];
};
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', model: MODEL });
});

app.get('/auth/providers', (req, res) => {
  res.json({ google: GOOGLE_AUTH_ENABLED });
});

app.get('/auth/me', optionalAuth, async (req, res) => respondWithCurrentUser(req, res));

app.post('/auth/register', async (req, res) => {
  try {
    const incoming = { ...req.body } || {};
    if (typeof incoming.name === 'string') {
      const trimmedName = incoming.name.trim();
      if (trimmedName.length === 0) {
        delete incoming.name;
      } else {
        incoming.name = trimmedName;
      }
    }
    const body = registerSchema.parse(incoming);
    const email = body.email.toLowerCase();
    const existing = await getUserByEmail(email);
    if (existing) {
      return res.status(409).json({
        error: 'ACCOUNT_EXISTS',
        message: 'An account with this email already exists. Try signing in instead.',
      });
    }
    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await createUser({
      email,
      name: body.name?.trim() || null,
      passwordHash,
      providers: [
        {
          provider: AuthProvider.EMAIL,
          providerId: email,
        },
      ],
    });
    await loginUser(req, user);
    const payload = await buildUserEnvelope(user);
    return res.status(201).json(payload);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstIssue = error.errors?.[0];
      let message = 'Please double-check the information you entered and try again.';
      if (firstIssue?.path?.includes('email')) {
        message = 'Please enter a valid email address.';
      } else if (firstIssue?.path?.includes('password')) {
        message = 'Password must be at least 8 characters long.';
      } else if (firstIssue?.path?.includes('name')) {
        message = 'Name must be between 1 and 120 characters.';
      }
      return res.status(400).json({ error: 'INVALID_REQUEST', message, details: error.errors });
    }
    console.error('[auth] register error', error);
    return res.status(500).json({ error: 'REGISTER_FAILED', message: 'Failed to register user.' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const body = loginSchema.parse(req.body);
    const email = body.email.toLowerCase();
    const user = await getUserByEmail(email, { includeSensitive: true });
    if (!user) {
      return res.status(404).json({
        error: 'ACCOUNT_NOT_FOUND',
        message: "We couldn't find an account with that email address.",
      });
    }
    if (!user.passwordHash) {
      return res.status(403).json({
        error: 'PASSWORD_LOGIN_UNAVAILABLE',
        message: "This account was created with Google Sign-In. Use the Google option to continue.",
      });
    }
    const passwordValid = await bcrypt.compare(body.password, user.passwordHash);
    if (!passwordValid) {
      return res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: "Incorrect password. Please try again.",
      });
    }
    const safeUser = sanitizeUser(user);
    await loginUser(req, safeUser);
    const payload = await buildUserEnvelope(safeUser);
    return res.json(payload);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Please provide a valid email and password.', details: error.errors });
    }
    console.error('[auth] login error', error);
    return res.status(500).json({ error: 'LOGIN_FAILED', message: 'Failed to login.' });
  }
});

app.post('/auth/logout', (req, res) => {
  req.logout((logoutErr) => {
    if (logoutErr) {
      console.error('[auth] logout error', logoutErr);
      return res.status(500).json({ error: 'Failed to logout.' });
    }
    if (req.session) {
      req.session.destroy((sessionErr) => {
        if (sessionErr) {
          console.error('[auth] session destroy error', sessionErr);
        }
      });
    }
    res.clearCookie('prism.sid', {
      httpOnly: true,
      secure: config.session.cookieSecure,
      sameSite: config.session.cookieSecure ? 'none' : 'lax',
      domain: config.session.cookieDomain,
      path: '/',
    });
    return res.status(204).send();
  });
});

if (GOOGLE_AUTH_ENABLED) {
  app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'consent' }));
  app.get(
    '/auth/google/callback',
    passport.authenticate('google', {
      failureRedirect: config.oauth.failureRedirect,
      session: true,
    }),
    async (req, res) => {
      res.redirect(config.oauth.successRedirect);
    },
  );
} else {
  app.get('/auth/google', (req, res) => res.status(404).json({ error: 'Google OAuth not configured.' }));
  app.get('/auth/google/callback', (req, res) => res.status(404).json({ error: 'Google OAuth not configured.' }));
}

app.get('/api/symbols/search', requireAuth, async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (!query) {
    return res.json({ symbols: [] });
  }

  const payload = await fetchYahooSymbolSearchPayload(query);
  return res.json(payload);
});

app.get('/api/health', optionalAuth, (req, res) => {
  res.json({ status: 'ok', model: MODEL });
});

app.post('/api/account/tier', requireAuth, async (req, res) => {
  try {
    const body = tierUpdateSchema.parse(req.body);
    const limits = getTierLimits(body.tier);
    const user = await updateUser(req.user.id, {
      tier: body.tier,
      monthlyInsights: body.monthlyInsights ?? limits.insights,
      monthlyQuotes: body.monthlyQuotes ?? limits.quotes,
    });
    const payload = await buildUserEnvelope(user);
    return res.json(payload);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'INVALID_REQUEST', details: error.errors });
    }
    console.error('[account] tier update error', error);
    return res.status(500).json({ error: 'Failed to update subscription tier.' });
  }
});

app.patch('/api/account/profile', requireAuth, async (req, res) => {
  try {
    const body = profileUpdateSchema.parse(req.body ?? {});
    const data = {};
    if (Object.prototype.hasOwnProperty.call(body, 'onboardingCompleted')) {
      data.onboardingCompleted = body.onboardingCompleted;
    }
    if (body.plan) {
      data.plan = body.plan;
    }
    if (body.profile !== undefined) {
      data.profile = body.profile ?? null;
    }
    const user = await updateUser(req.user.id, data);
    const payload = await buildUserEnvelope(user);
    return res.json(payload);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'INVALID_REQUEST', details: error.errors });
    }
    console.error('[account] profile update error', error);
    return res.status(500).json({ error: 'Failed to update profile.' });
  }
});


app.post('/api/invoke-llm', requireAuth, async (req, res) => {
  if (!openaiClient) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured on the server.' });
  }

  const { prompt, response_json_schema: schema, system_instruction, add_context_from_internet } = req.body || {};
  if (!prompt) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  try {
    const usage = await getUsage(req.user.id);
    assertWithinQuota(req.user, usage);
  } catch (error) {
    const status = error.status || 429;
    return res.status(status).json({ error: error.message || 'Insight quota exceeded.' });
  }

  const cacheKey = buildLlmCacheKey({ prompt, schema, system_instruction, add_context_from_internet });
  const cacheEnabled = Number.isFinite(LLM_CACHE_TTL_MS) && LLM_CACHE_TTL_MS > 0;

  const sendResponse = (entry, cached) => {
    const payload = { result: cloneValue(entry.value) };
    if (cacheEnabled) {
      payload.meta = {
        cached,
        ageMs: Math.max(0, nowMs() - entry.timestamp),
      };
    }
    return res.json(payload);
  };

  const finalizeResponse = async (entry, cached) => {
    try {
      await consumeUsage(req.user, { insightCalls: 1 });
    } catch (usageError) {
      const status = usageError.status || 429;
      return res.status(status).json({ error: usageError.message || 'Insight quota exceeded.' });
    }
    return sendResponse(entry, cached);
  };

  if (cacheEnabled) {
    const cachedEntry = llmCache.get(cacheKey);
    if (isCacheEntryFresh(cachedEntry, LLM_CACHE_TTL_MS)) {
      return finalizeResponse(cachedEntry, true);
    }
  }

  const inFlight = llmInFlight.get(cacheKey);
  if (inFlight) {
    try {
      const entry = await inFlight;
      return finalizeResponse(entry, true);
    } catch (error) {
      llmInFlight.delete(cacheKey);
    }
  }

  const request = (async () => {
    const response = await openaiClient.chat.completions.create({
      model: MODEL,
      messages: buildMessages(prompt, system_instruction, add_context_from_internet),
      temperature: 0.2,
      top_p: 0.8,
      presence_penalty: 0,
      frequency_penalty: 0,
      max_tokens: OPENAI_MAX_OUTPUT_TOKENS,
      response_format: schema
        ? {
            type: 'json_schema',
            json_schema: {
              name: 'response',
              schema,
            },
          }
        : undefined,
    });

    let value;
    if (schema) {
      const structured = extractJsonFromResponse(response);
      if (structured) {
        value = structured;
      } else {
        const content = extractTextFromResponse(response);
        const repaired = tryParseLooseJson(content);
        if (repaired) {
          value = repaired;
        } else {
          console.error('[server] Failed to parse JSON response from OpenAI', content);
          const error = new Error('Model returned invalid JSON');
          error.raw = content;
          throw error;
        }
      }
    } else {
      const content = extractTextFromResponse(response);
      value = content.trim();
    }

    const entry = { value, timestamp: nowMs() };
    if (cacheEnabled) {
      llmCache.set(cacheKey, entry);
      pruneCache(llmCache, LLM_CACHE_MAX_ENTRIES);
    }
    return entry;
  })();

  llmInFlight.set(cacheKey, request);

  try {
    const entry = await request;
    return finalizeResponse(entry, false);
  } catch (error) {
    if (error?.raw) {
      llmInFlight.delete(cacheKey);
      return res.status(502).json({ error: error.message, raw: error.raw });
    }
    const sanitised = sanitizeOpenAIError(error, 'Unexpected error');
    console.error('[server] invoke-llm error', sanitised.message, error);
    return res.status(sanitised.status).json({ error: sanitised.message });
  } finally {
    llmInFlight.delete(cacheKey);
  }
});



app.post('/api/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'file is required' });
  }
  const id = crypto.randomUUID();
  uploadStore.set(id, {
    buffer: req.file.buffer,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    uploadedAt: new Date(),
  });

  try {
    await consumeUsage(req.user, { uploads: 1 });
  } catch (error) {
    uploadStore.delete(id);
    const status = error.status || 429;
    return res.status(status).json({ error: error.message || 'Upload quota exceeded.' });
  }

  res.json({ file_url: id, size: req.file.size, name: req.file.originalname });
});



app.post('/api/extract', requireAuth, async (req, res) => {
  if (!openaiClient) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured on the server.' });
  }

  const { file_url: fileId, json_schema: schema } = req.body || {};
  if (!fileId) {
    return res.status(400).json({ error: 'file_url is required' });
  }
  if (!schema) {
    return res.status(400).json({ error: 'json_schema is required' });
  }

  try {
    const usage = await getUsage(req.user.id);
    assertWithinQuota(req.user, usage);
  } catch (error) {
    const status = error.status || 429;
    return res.status(status).json({ error: error.message || 'Insight quota exceeded.' });
  }

  const record = uploadStore.get(fileId);
  if (!record) {
    return res.status(404).json({ error: 'Uploaded file not found. Upload a new file and retry.' });
  }

  const sendSuccess = async (payload) => {
    uploadStore.delete(fileId);
    try {
      await consumeUsage(req.user, { insightCalls: 1 });
    } catch (usageError) {
      const status = usageError.status || 429;
      return res.status(status).json({ error: usageError.message || 'Insight quota exceeded.' });
    }
    return res.json({ status: 'success', output: payload });
  };

  try {
    if (record.mimeType?.startsWith('image/')) {
      const instructions = [
        'Extract all visible holdings from the provided portfolio screenshot.',
        'Return JSON that strictly matches the supplied schema.',
        'Symbols must be uppercase (e.g., AAPL).',
        'If a value cannot be determined confidently, omit that asset.',
      ].join('\n');

      const base64 = record.buffer.toString('base64');
      const response = await openaiClient.chat.completions.create({
        model: MODEL,
        temperature: 0.1,
        top_p: 0.6,
        presence_penalty: 0,
        frequency_penalty: 0,
        max_tokens: Math.min(OPENAI_MAX_OUTPUT_TOKENS, 500),
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'portfolio_extraction',
            schema,
          },
        },
        messages: [
          {
            role: 'system',
            content: instructions,
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: instructions },
              { type: 'image_url', image_url: { url: `data:${record.mimeType};base64,${base64}` } },
            ],
          },
        ],
      });

      const structured = extractJsonFromResponse(response);
      if (!structured) {
        const content = extractTextFromResponse(response);
        const repaired = tryParseLooseJson(content);
        if (repaired) {
          return sendSuccess(repaired);
        }
        console.error('[server] Failed to parse JSON response from OpenAI', content);
        const error = new Error('Model returned invalid JSON');
        error.raw = content;
        throw error;
      }
      return sendSuccess(structured);
    }

    const text = record.buffer.toString('utf8');
    const prompt = [
      'Extract all investment holdings from the provided document.',
      'Return JSON matching the supplied schema. Ensure every symbol is uppercase.',
      'If a value cannot be determined confidently, omit that asset.',
      'Document content:',
      '---',
      text,
      '---',
    ].join('\n');

    const response = await openaiClient.chat.completions.create({
      model: MODEL,
      temperature: 0.1,
      top_p: 0.6,
      presence_penalty: 0,
      frequency_penalty: 0,
      max_tokens: Math.min(OPENAI_MAX_OUTPUT_TOKENS, 500),
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'document_extraction',
          schema,
        },
      },
      messages: [
        { role: 'system', content: 'You are an assistant that extracts investment data and returns JSON strictly matching the provided schema.' },
        { role: 'user', content: prompt },
      ],
    });

    const structured = extractJsonFromResponse(response);
    if (!structured) {
      const content = extractTextFromResponse(response);
      const repaired = tryParseLooseJson(content);
      if (repaired) {
        return sendSuccess(repaired);
      }
      console.error('[server] Failed to parse JSON response from OpenAI', content);
      const error = new Error('Model returned invalid JSON');
      error.raw = content;
      throw error;
    }
    return sendSuccess(structured);
  } catch (error) {
    if (error?.raw) {
      return res.status(502).json({ error: error.message, raw: error.raw });
    }
    const sanitised = sanitizeOpenAIError(error, 'Extraction failed.');
    console.error('[server] extract error', sanitised.message, error);
    return res.status(sanitised.status).json({ error: sanitised.message });
  }
});



app.post('/api/prices/details', requireAuth, async (req, res) => {
  const { symbol, date, time } = req.body || {};
  if (!symbol) {
    return res.status(400).json({ error: 'symbol is required' });
  }

  const normalizedSymbol = normalizeSymbol(symbol);
  const metadata = KNOWN_SYMBOL_META.get(normalizedSymbol) || null;
  let resolvedName = metadata?.name || null;
  let resolvedType = metadata?.type || null;

  const limits = getTierLimits(req.user.tier);
  const usage = await getUsage(req.user.id);
  if (usage.priceRequests + 1 > limits.quotes) {
    return res.status(429).json({ error: 'Price data quota exceeded for current billing period.' });
  }

  let targetDate = null;
  let targetDateTime = null;

  if (date) {
    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({ error: 'date must be a valid ISO date string (YYYY-MM-DD)' });
    }
    targetDate = parsedDate;
    targetDateTime = new Date(parsedDate);
  }

  if (targetDate && typeof time === 'string' && time.trim()) {
    const [hours, minutes] = time.trim().split(':').map((value) => Number.parseInt(value, 10));
    if (Number.isFinite(hours) && Number.isFinite(minutes)) {
      targetDateTime.setHours(hours, minutes, 0, 0);
    }
  } else if (targetDateTime) {
    targetDateTime.setHours(16, 0, 0, 0);
  }

  try {
    let quoteEntry = null;
    try {
      quoteEntry = await resolvePriceQuote(normalizedSymbol);
    } catch (quoteError) {
      if (quoteError?.isRateLimit || quoteError?.status) {
        console.warn(`[prices] primary quote provider unavailable for ${normalizedSymbol}`, quoteError);
      } else {
        throw quoteError;
      }
    }

    const now = new Date();
    let currentPrice = Number(quoteEntry?.value?.price);
    let currentPriceTimestamp = quoteEntry?.value?.timestamp || null;
    let priceSource = quoteEntry?.source || null;
    if (quoteEntry?.meta?.name && !resolvedName) {
      resolvedName = quoteEntry.meta.name;
    }
    if (quoteEntry?.meta?.type && !resolvedType) {
      resolvedType = quoteEntry.meta.type;
    }

    let stooqSeries;
    let stooqSeriesLoaded = false;
    const ensureStooqSeries = async () => {
      if (stooqSeriesLoaded) {
        return stooqSeries;
      }
      stooqSeries = await fetchDailySeriesFromStooq(normalizedSymbol);
      stooqSeriesLoaded = true;
      if (stooqSeries?.series?.length) {
        priceHistoryCache.set(normalizedSymbol, stooqSeries);
        pruneCache(priceHistoryCache, PRICE_HISTORY_MAX_ENTRIES);
      }
      return stooqSeries;
    };

    if (!Number.isFinite(currentPrice)) {
      try {
        const stooqData = await ensureStooqSeries();
        if (stooqData?.series?.length) {
          const sorted = [...stooqData.series]
            .map((entry) => ({ ...entry, dateObj: new Date(entry.date) }))
            .filter((entry) => !Number.isNaN(entry.dateObj.getTime()))
            .sort((a, b) => b.dateObj - a.dateObj);
          const latest = sorted[0];
          if (latest) {
            currentPrice = Number(latest.close);
            const timestampGuess = new Date(latest.dateObj);
            timestampGuess.setHours(20, 0, 0, 0);
            currentPriceTimestamp = timestampGuess.toISOString();
            priceSource = 'stooq';
          }
        }
      } catch (fallbackError) {
        console.warn(`[prices] fallback current price failed for ${normalizedSymbol}`, fallbackError);
      }
    }

    if (!Number.isFinite(currentPrice)) {
      return res.status(404).json({ error: 'No quote data returned for provided symbol.' });
    }

    if (!priceSource) {
      priceSource = 'yahoo_chart';
    }

    let historicalPrice = null;
    let historicalPriceDate = null;
    let historicalPriceTimestamp = null;

    if (targetDate) {
      const targetComparisonDate = targetDateTime || targetDate;

      if (targetDateTime && time) {
        const diffMs = now.getTime() - targetDateTime.getTime();
        if (diffMs >= 0 && diffMs <= PRICE_INTRADAY_LOOKBACK_MS) {
          try {
            const intradaySeries = await resolveIntradaySeries(normalizedSymbol);
            const parsedSeries = (intradaySeries?.series || [])
              .map((entry) => ({ ...entry, date: new Date(entry.timestamp) }))
              .filter((entry) => !Number.isNaN(entry.date.getTime()))
              .sort((a, b) => b.date - a.date);
            const intradayMatch = parsedSeries.find((entry) => entry.date <= targetDateTime);
            if (intradayMatch) {
              historicalPrice = Number(intradayMatch.close);
              historicalPriceDate = intradayMatch.timestamp.slice(0, 10);
              historicalPriceTimestamp = intradayMatch.timestamp;
            }
          } catch (intradayError) {
            console.warn(`[prices] intraday series lookup failed for ${normalizedSymbol}`, intradayError);
          }
        }
      }

      if (!Number.isFinite(historicalPrice)) {
        try {
          const historicalSeries = await resolveHistoricalSeries(normalizedSymbol);
          const series = historicalSeries?.series || [];
          const parsedDaily = series
            .map((entry) => ({ ...entry, dateObj: new Date(entry.date) }))
            .filter((entry) => !Number.isNaN(entry.dateObj.getTime()))
            .sort((a, b) => b.dateObj - a.dateObj);
          const matchDaily = parsedDaily.find((entry) => entry.dateObj <= targetComparisonDate);
          if (matchDaily) {
            historicalPrice = Number(matchDaily.close);
            historicalPriceDate = matchDaily.date;
            const timestampGuess = new Date(matchDaily.dateObj);
            timestampGuess.setHours(16, 0, 0, 0);
            historicalPriceTimestamp = timestampGuess.toISOString();
          }
        } catch (historyError) {
          console.warn('[prices] failed to load historical series', historyError);
        }
      }

      if (!Number.isFinite(historicalPrice)) {
        try {
          const stooqData = await ensureStooqSeries();
          if (stooqData?.series?.length) {
            const sorted = [...stooqData.series]
              .map((entry) => ({ ...entry, dateObj: new Date(entry.date) }))
              .filter((entry) => !Number.isNaN(entry.dateObj.getTime()))
              .sort((a, b) => b.dateObj - a.dateObj);
            const stooqMatch = sorted.find((entry) => entry.dateObj <= targetComparisonDate);
            if (stooqMatch) {
              historicalPrice = Number(stooqMatch.close);
              historicalPriceDate = stooqMatch.date;
              const timestampGuess = new Date(stooqMatch.dateObj);
              timestampGuess.setHours(16, 0, 0, 0);
              historicalPriceTimestamp = timestampGuess.toISOString();
            }
          }
        } catch (stooqError) {
          console.warn(`[prices] stooq historical fallback failed for ${normalizedSymbol}`, stooqError);
        }
      }

      if (!Number.isFinite(historicalPrice)) {
        const yahooHistorical = await resolveYahooHistoricalPrice(normalizedSymbol, targetDateTime || targetDate || now);
        if (yahooHistorical) {
          historicalPrice = yahooHistorical.price;
          historicalPriceDate = yahooHistorical.date;
          historicalPriceTimestamp = yahooHistorical.timestamp;
        }
      }
    }

    if (!Number.isFinite(historicalPrice)) {
      historicalPrice = currentPrice;
      historicalPriceDate = targetDate ? targetDate.toISOString().slice(0, 10) : null;
      historicalPriceTimestamp = targetDateTime ? targetDateTime.toISOString() : currentPriceTimestamp;
    }

    await consumeUsage(req.user, { quoteRequests: 1 });

    const responseMetadata = resolvedName || resolvedType
      ? { ...(metadata || {}), name: resolvedName || metadata?.name || null, type: resolvedType || metadata?.type || null }
      : metadata;

    return res.json({
      symbol: normalizedSymbol,
      name: resolvedName || metadata?.name || normalizedSymbol,
      type: resolvedType || metadata?.type || null,
      current_price: currentPrice,
      current_price_timestamp: currentPriceTimestamp,
      historical_price: historicalPrice,
      historical_price_date: historicalPriceDate,
      historical_price_timestamp: historicalPriceTimestamp,
      provider: priceSource || 'stooq',
      metadata: responseMetadata,
    });
  } catch (error) {
    console.error('[server] price details error', error);
    if (error?.isRateLimit) {
      return res.status(429).json({ error: error.message || 'External price API rate limit hit.' });
    }
    return res.status(502).json({ error: error.message || 'Failed to retrieve price information.' });
  }
});

app.post('/api/prices', requireAuth, async (req, res) => {
  const { symbols = [] } = req.body || {};

  if (!Array.isArray(symbols) || symbols.length === 0) {
    return res.status(400).json({ error: 'symbols must be a non-empty array' });
  }

  const uniqueSymbols = [...new Set(symbols.map((symbol) => normalizeSymbol(symbol)).filter(Boolean))];
  if (uniqueSymbols.length === 0) {
    return res.status(400).json({ error: 'No valid symbols provided' });
  }

  if (Number.isFinite(PRICE_MAX_SYMBOLS_PER_REQUEST) && PRICE_MAX_SYMBOLS_PER_REQUEST > 0 && uniqueSymbols.length > PRICE_MAX_SYMBOLS_PER_REQUEST) {
    return res.status(400).json({ error: `You can request up to ${PRICE_MAX_SYMBOLS_PER_REQUEST} symbols at a time.` });
  }

  const limits = getTierLimits(req.user.tier);
  const usage = await getUsage(req.user.id);
  if (usage.priceRequests + uniqueSymbols.length > limits.quotes) {
    return res.status(429).json({ error: 'Price data quota exceeded for current billing period.' });
  }

  const results = {};
  const cacheHits = [];
  const staleFallbacks = new Map();
  const symbolsToFetch = [];

  for (const symbol of uniqueSymbols) {
    const cacheEntry = priceCache.get(symbol);
    if (isCacheEntryFresh(cacheEntry, PRICE_CACHE_TTL_MS)) {
      results[symbol] = cloneValue(cacheEntry.value);
      cacheHits.push(symbol);
      continue;
    }
    if (cacheEntry) {
      staleFallbacks.set(symbol, cacheEntry);
    }
    symbolsToFetch.push(symbol);
  }

  const fetchErrors = [];

  for (const symbol of symbolsToFetch) {
    try {
      const entry = await resolvePriceQuote(symbol);
      if (entry && entry.value) {
        results[symbol] = cloneValue(entry.value);
      } else if (!results[symbol] && staleFallbacks.has(symbol)) {
        const fallback = cloneValue(staleFallbacks.get(symbol).value);
        fallback.stale = true;
        results[symbol] = fallback;
      }
    } catch (error) {
      console.error(`[server] price fetch error for ${symbol}`, error);
      fetchErrors.push({ symbol, message: error.message });
      if (!results[symbol] && staleFallbacks.has(symbol)) {
        const fallback = cloneValue(staleFallbacks.get(symbol).value);
        fallback.stale = true;
        results[symbol] = fallback;
      }
    }
  }

  if (Object.keys(results).length === 0) {
    if (fetchErrors.length > 0) {
      return res.status(502).json({ error: fetchErrors[0].message || 'Failed to retrieve prices.' });
    }
    return res.status(404).json({ error: 'No quote data returned for provided symbols.' });
  }

  try {
    await consumeUsage(req.user, { quoteRequests: uniqueSymbols.length });
  } catch (usageError) {
    const status = usageError.status || 429;
    return res.status(status).json({ error: usageError.message || 'Price data quota exceeded for current billing period.' });
  }

  const payload = { data: results };
  if (cacheHits.length > 0 || fetchErrors.length > 0) {
    payload.meta = {};
    if (cacheHits.length > 0) {
      payload.meta.cacheHits = cacheHits;
    }
    if (fetchErrors.length > 0) {
      payload.meta.partialFailures = fetchErrors;
    }
  }

  return res.json(payload);
});



app.listen(PORT, () => {
  console.log(`[server] Prism AI backend listening on http://localhost:${PORT}`);
});



















