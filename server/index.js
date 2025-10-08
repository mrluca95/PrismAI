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
const OPENAI_MAX_OUTPUT_TOKENS = Number.isNaN(Number.parseInt(process.env.OPENAI_MAX_OUTPUT_TOKENS, 10)) ? 600 : Number.parseInt(process.env.OPENAI_MAX_OUTPUT_TOKENS, 10);

const PgSession = connectPgSimple(session);

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'https://mrluca95.github.io',
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

const LLM_CACHE_TTL_MS = Number(process.env.LLM_CACHE_TTL_MS || 1000 * 60 * 5);
const LLM_CACHE_MAX_ENTRIES = Number(process.env.LLM_CACHE_MAX_ENTRIES || 50);
const PRICE_CACHE_TTL_MS = Number(process.env.PRICE_CACHE_TTL_MS || 1000 * 60 * 2);
const PRICE_CACHE_MAX_ENTRIES = Number(process.env.PRICE_CACHE_MAX_ENTRIES || 100);
const PRICE_MAX_SYMBOLS_PER_REQUEST = Number(process.env.PRICE_MAX_SYMBOLS_PER_REQUEST || 5);
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

const mapToStooqSymbol = (symbol) => {
  const cleaned = String(symbol || '').trim().toLowerCase();
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
  ['BTC', { name: 'Bitcoin', type: 'crypto' }],
  ['ETH', { name: 'Ethereum', type: 'crypto' }],
]);

const buildLlmCacheKey = ({ prompt, schema, system_instruction, add_context_from_internet }) =>
  JSON.stringify({
    prompt,
    schema,
    system_instruction,
    add_context_from_internet: Boolean(add_context_from_internet),
  });

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

const fetchPriceFromAlphaVantage = async (symbol, apiKey) => {
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
  const response = await fetch(url);

  if (!response.ok) {
    const error = new Error(`Alpha Vantage responded with ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const json = await response.json();
  if (json?.Note || json?.Information) {
    const error = new Error(json.Note || json.Information || 'Alpha Vantage rate limit reached. Try again shortly.');
    error.isRateLimit = true;
    throw error;
  }

  const quote = json?.['Global Quote'];
  if (!quote) {
    return null;
  }

  const price = Number(quote['05. price']);
  if (!Number.isFinite(price)) {
    return null;
  }

  const previousClose = Number(quote['08. previous close']);
  const tradingDay = quote['07. latest trading day'];
  const timestamp = tradingDay
    ? new Date(`${tradingDay}T16:00:00Z`).toISOString()
    : new Date().toISOString();

  return {
    value: {
      price,
      previousClose: Number.isFinite(previousClose) ? previousClose : null,
      currency: null,
      exchange: null,
      timestamp,
    },
    timestamp: nowMs(),
  };
};

const resolvePriceQuote = async (symbol, apiKey) => {
  const cached = priceCache.get(symbol);
  if (isCacheEntryFresh(cached, PRICE_CACHE_TTL_MS)) {
    return cached;
  }

  const inFlight = priceInFlight.get(symbol);
  if (inFlight) {
    return inFlight;
  }

  const request = (async () => {
    const entry = await fetchPriceFromAlphaVantage(symbol, apiKey);
    if (entry && PRICE_CACHE_TTL_MS > 0) {
      priceCache.set(symbol, entry);
      pruneCache(priceCache, PRICE_CACHE_MAX_ENTRIES);
    }
    return entry;
  })();

  priceInFlight.set(symbol, request);

  try {
    return await request;
  } finally {
    priceInFlight.delete(symbol);
  }
};
const fetchIntradaySeriesFromAlpha = async (symbol, apiKey) => {
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${encodeURIComponent(symbol)}&interval=5min&outputsize=full&apikey=${apiKey}`;
  const response = await fetch(url);

  if (!response.ok) {
    const error = new Error(`Alpha Vantage responded with ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const json = await response.json();
  if (json?.Note || json?.Information) {
    const error = new Error(json.Note || json.Information || 'Alpha Vantage rate limit reached. Try again shortly.');
    error.isRateLimit = true;
    throw error;
  }

  const series = json?.['Time Series (5min)'];
  if (!series || typeof series !== 'object') {
    return null;
  }

  const parsed = Object.entries(series)
    .map(([timestamp, values]) => ({
      timestamp,
      close: Number(values?.['4. close'] ?? values?.['5. adjusted close'] ?? values?.['1. open'] ?? null),
    }))
    .filter((entry) => Number.isFinite(entry.close));

  return {
    series: parsed,
    timestamp: nowMs(),
  };
};

const resolveIntradaySeries = async (symbol, apiKey) => {
  const cached = priceIntradayCache.get(symbol);
  if (isCacheEntryFresh(cached, PRICE_INTRADAY_TTL_MS)) {
    return cached;
  }

  const inFlight = priceIntradayInFlight.get(symbol);
  if (inFlight) {
    return inFlight;
  }

  const request = (async () => {
    const entry = await fetchIntradaySeriesFromAlpha(symbol, apiKey);
    if (entry && PRICE_INTRADAY_TTL_MS > 0) {
      priceIntradayCache.set(symbol, entry);
      pruneCache(priceIntradayCache, PRICE_INTRADAY_MAX_ENTRIES);
    }
    return entry;
  })();

  priceIntradayInFlight.set(symbol, request);

  try {
    return await request;
  } finally {
    priceIntradayInFlight.delete(symbol);
  }
};
const fetchDailySeriesFromAlpha = async (symbol, apiKey) => {
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&outputsize=compact&apikey=${apiKey}`;
  const response = await fetch(url);

  if (!response.ok) {
    const error = new Error(`Alpha Vantage responded with ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const json = await response.json();
  if (json?.Note || json?.Information) {
    const error = new Error(json.Note || json.Information || 'Alpha Vantage rate limit reached. Try again shortly.');
    error.isRateLimit = true;
    throw error;
  }

  const series = json?.['Time Series (Daily)'];
  if (!series || typeof series !== 'object') {
    return null;
  }

  const parsed = Object.entries(series)
    .map(([date, values]) => ({
      date,
      close: Number(values?.['4. close']) || Number(values?.['5. adjusted close']) || Number(values?.['1. open']) || null,
    }))
    .filter((entry) => entry.close && Number.isFinite(entry.close));

  return {
    series: parsed,
    timestamp: nowMs(),
  };
};

const resolveHistoricalSeries = async (symbol, apiKey) => {
  const cached = priceHistoryCache.get(symbol);
  if (isCacheEntryFresh(cached, PRICE_HISTORY_TTL_MS)) {
    return cached;
  }

  const inFlight = priceHistoryInFlight.get(symbol);
  if (inFlight) {
    return inFlight;
  }

  const request = (async () => {
    const entry = await fetchDailySeriesFromAlpha(symbol, apiKey);
    if (entry && PRICE_HISTORY_TTL_MS > 0) {
      priceHistoryCache.set(symbol, entry);
      pruneCache(priceHistoryCache, PRICE_HISTORY_MAX_ENTRIES);
    }
    return entry;
  })();

  priceHistoryInFlight.set(symbol, request);

  try {
    return await request;
  } finally {
    priceHistoryInFlight.delete(symbol);
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

  const normalized = query.toLowerCase();
  const cached = symbolSearchCache.get(normalized);
  if (cached && Number.isFinite(SYMBOL_SEARCH_TTL_MS) && SYMBOL_SEARCH_TTL_MS > 0 && nowMs() - cached.timestamp < SYMBOL_SEARCH_TTL_MS) {
    return res.json(cached.value);
  }

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=${SYMBOL_SEARCH_MAX_RESULTS}&newsCount=0&enableFuzzyQuery=false&lang=en-US&region=US`;
    const response = await fetch(url, { headers: { 'User-Agent': 'PrismAI/1.0 (+https://github.com/mrluca95/PrismAI)' } });
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

    const payload = { symbols: symbols.slice(0, SYMBOL_SEARCH_MAX_RESULTS) };
    symbolSearchCache.set(normalized, { timestamp: nowMs(), value: payload });
    return res.json(payload);
  } catch (error) {
    console.warn('[server] symbol search error', error);
    return res.status(502).json({ symbols: [] });
  }
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
      max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS,
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

    const content = extractTextFromResponse(response);
    let value = content.trim();

    if (schema) {
      try {
        value = JSON.parse(content);
      } catch (parseError) {
        console.error('[server] Failed to parse JSON response from OpenAI', parseError);
        const error = new Error('Model returned invalid JSON');
        error.raw = content;
        throw error;
      }
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
      return res.status(502).json({ error: error.message, raw: error.raw });
    }
    console.error('[server] invoke-llm error', error);
    const message = error?.response?.data ?? error.message ?? 'Unexpected error';
    return res.status(502).json({ error: message });
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
        max_output_tokens: Math.min(OPENAI_MAX_OUTPUT_TOKENS, 500),
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
              { type: 'input_text', text: instructions },
              { type: 'input_image', image_url: { url: `data:${record.mimeType};base64,${base64}` } },
            ],
          },
        ],
      });

      const content = extractTextFromResponse(response);
      let value = content.trim();
      try {
        value = JSON.parse(content);
      } catch (parseError) {
        console.error('[server] Failed to parse JSON response from OpenAI', parseError);
        const error = new Error('Model returned invalid JSON');
        error.raw = content;
        throw error;
      }
      return sendSuccess(value);
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
      max_output_tokens: Math.min(OPENAI_MAX_OUTPUT_TOKENS, 500),
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

    const content = extractTextFromResponse(response);
    let value = content.trim();
    try {
      value = JSON.parse(content);
    } catch (parseError) {
      console.error('[server] Failed to parse JSON response from OpenAI', parseError);
      const error = new Error('Model returned invalid JSON');
      error.raw = content;
      throw error;
    }
    return sendSuccess(value);
  } catch (error) {
    console.error('[server] extract error', error);
    if (error?.raw) {
      return res.status(502).json({ error: error.message, raw: error.raw });
    }
    return res.status(502).json({ error: error.message || 'Extraction failed.' });
  }
});



app.post('/api/prices/details', requireAuth, async (req, res) => {
  const { symbol, date, time } = req.body || {};
  if (!symbol) {
    return res.status(400).json({ error: 'symbol is required' });
  }

  const normalizedSymbol = normalizeSymbol(symbol);
  const metadata = KNOWN_SYMBOL_META.get(normalizedSymbol) || null;

  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ALPHA_VANTAGE_API_KEY is not configured on the server.' });
  }

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
      quoteEntry = await resolvePriceQuote(normalizedSymbol, apiKey);
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
    let priceSource = quoteEntry?.value ? 'alpha_vantage' : null;

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

    let historicalPrice = null;
    let historicalPriceDate = null;
    let historicalPriceTimestamp = null;

    if (targetDate) {
      const targetComparisonDate = targetDateTime || targetDate;

      if (targetDateTime && time) {
        const diffMs = now.getTime() - targetDateTime.getTime();
        if (diffMs >= 0 && diffMs <= PRICE_INTRADAY_LOOKBACK_MS) {
          try {
            const intradaySeries = await resolveIntradaySeries(normalizedSymbol, apiKey);
            const parsedSeries = (intradaySeries?.series || [])
              .map((entry) => ({ ...entry, date: new Date(entry.timestamp.replace(' ', 'T')) }))
              .filter((entry) => !Number.isNaN(entry.date.getTime()))
              .sort((a, b) => b.date - a.date);
            const intradayMatch = parsedSeries.find((entry) => entry.date <= targetDateTime);
            if (intradayMatch) {
              historicalPrice = Number(intradayMatch.close);
              historicalPriceDate = intradayMatch.timestamp.split(' ')[0];
              historicalPriceTimestamp = intradayMatch.date.toISOString();
            }
          } catch (intradayError) {
            console.warn(`[prices] intraday series lookup failed for ${normalizedSymbol}`, intradayError);
          }
        }
      }

      if (!Number.isFinite(historicalPrice)) {
        try {
          const historicalSeries = await resolveHistoricalSeries(normalizedSymbol, apiKey);
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
    }

    if (!Number.isFinite(historicalPrice)) {
      historicalPrice = currentPrice;
      historicalPriceDate = targetDate ? targetDate.toISOString().slice(0, 10) : null;
      historicalPriceTimestamp = targetDateTime ? targetDateTime.toISOString() : currentPriceTimestamp;
    }

    await consumeUsage(req.user, { quoteRequests: 1 });

    return res.json({
      symbol: normalizedSymbol,
      name: metadata?.name || normalizedSymbol,
      type: metadata?.type || null,
      current_price: currentPrice,
      current_price_timestamp: currentPriceTimestamp,
      historical_price: historicalPrice,
      historical_price_date: historicalPriceDate,
      historical_price_timestamp: historicalPriceTimestamp,
      provider: priceSource || 'stooq',
      metadata,
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

  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ALPHA_VANTAGE_API_KEY is not configured on the server.' });
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
      const entry = await resolvePriceQuote(symbol, apiKey);
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



















