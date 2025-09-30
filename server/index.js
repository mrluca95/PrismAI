import "dotenv/config";
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import crypto from 'node:crypto';
import OpenAI from 'openai';

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const PORT = process.env.PORT || 4000;
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const DEFAULT_SYSTEM_PROMPT = process.env.OPENAI_SYSTEM_PROMPT || 'You are Prism AI, an investment copilot. Provide concise, well-structured answers, and never fabricate data you cannot verify.';

app.use(cors());
app.use(express.json({ limit: '1mb' }));

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

const llmCache = new Map();
const llmInFlight = new Map();
const priceCache = new Map();
const priceInFlight = new Map();
const priceHistoryCache = new Map();
const priceHistoryInFlight = new Map();

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
    { role: 'system', content: system.join('\n\n') },
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

app.post('/api/invoke-llm', async (req, res) => {
  if (!openaiClient) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured on the server.' });
  }

  const { prompt, response_json_schema: schema, system_instruction, add_context_from_internet } = req.body || {};
  if (!prompt) {
    return res.status(400).json({ error: 'prompt is required' });
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

  if (cacheEnabled) {
    const cachedEntry = llmCache.get(cacheKey);
    if (isCacheEntryFresh(cachedEntry, LLM_CACHE_TTL_MS)) {
      return sendResponse(cachedEntry, true);
    }
  }

  const inFlight = llmInFlight.get(cacheKey);
  if (inFlight) {
    try {
      const entry = await inFlight;
      return sendResponse(entry, true);
    } catch (error) {
      llmInFlight.delete(cacheKey);
    }
  }

  const request = (async () => {
    const response = await openaiClient.chat.completions.create({
      model: MODEL,
      messages: buildMessages(prompt, system_instruction, add_context_from_internet),
      temperature: 0.3,
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
    return sendResponse(entry, false);
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

app.post('/api/upload', upload.single('file'), (req, res) => {
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
  res.json({ file_url: id, size: req.file.size, name: req.file.originalname });
});

app.post('/api/extract', async (req, res) => {
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

  const record = uploadStore.get(fileId);
  if (!record) {
    return res.status(404).json({ error: 'Uploaded file not found. Upload a new file and retry.' });
  }

  const sendSuccess = (payload) => {
    uploadStore.delete(fileId);
    res.json({ status: 'success', output: payload });
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
            content:
              'You are a portfolio data extraction assistant. Only return JSON that strictly matches the supplied schema.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: instructions },
              {
                type: 'image_url',
                image_url: { url: `data:${record.mimeType};base64,${base64}` },
              },
            ],
          },
        ],
      });

      const contentText = extractTextFromResponse(response);
      const parsed = parseModelJson(contentText);
      return sendSuccess(parsed);
    }

    const text = record.buffer.toString('utf-8');
    const truncated = text.length > 12000 ? `${text.slice(0, 12000)}\n...[truncated]` : text;

    const response = await openaiClient.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are a portfolio data extraction assistant. Only return JSON that strictly matches the provided schema. Use numbers where possible. Omit entries you cannot infer confidently.',
        },
        {
          role: 'user',
          content: `Extract the portfolio holdings from the following broker export. Ensure the JSON matches the schema.\n\nFile name: ${record.originalName}\n\n--- FILE CONTENT START ---\n${truncated}\n--- FILE CONTENT END ---`,
        },
      ],
      temperature: 0.2,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'portfolio_extraction',
          schema,
        },
      },
    });

    const contentText = extractTextFromResponse(response);
    const parsed = parseModelJson(contentText);
    return sendSuccess(parsed);
  } catch (error) {
    console.error('[server] extract error', error);
    if (error?.raw) {
      return res.status(502).json({ error: error.message, raw: error.raw });
    }
    const message = error?.response?.data ?? error.message ?? 'Unexpected error';
    res.status(502).json({ error: message });
  }
});

app.post('/api/prices/details', async (req, res) => {
  const { symbol: rawSymbol, date: rawDate } = req.body || {};
  const symbol = normalizeSymbol(rawSymbol);
  const date = rawDate ? String(rawDate) : null;

  if (!symbol) {
    return res.status(400).json({ error: 'symbol is required' });
  }
  if (!date) {
    return res.status(400).json({ error: 'date is required' });
  }

  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ALPHA_VANTAGE_API_KEY is not configured on the server.' });
  }

  const currentCacheEntry = priceCache.get(symbol);
  const currentFromCache = isCacheEntryFresh(currentCacheEntry, PRICE_CACHE_TTL_MS);

  try {
    const currentQuote = currentFromCache
      ? currentCacheEntry
      : await resolvePriceQuote(symbol, apiKey);

    let currentPrice = currentQuote?.value?.price ?? null;
    let currentTimestamp = currentQuote?.value?.timestamp ?? null;

    const historicalSeries = await resolveHistoricalSeries(symbol, apiKey);
    if (!historicalSeries || !historicalSeries.series?.length) {
      return res.status(502).json({ error: 'Unable to retrieve historical data for symbol.' });
    }

    const historicalEntry = findClosestTradingDay(historicalSeries.series, date);
    if (!historicalEntry) {
      return res.status(404).json({ error: 'No historical price available for the requested date.' });
    }

    const meta = pickSymbolMeta(symbol);

    const responsePayload = {
      symbol,
      historical_price: historicalEntry.close,
      historical_price_date: historicalEntry.date,
      current_price: currentPrice,
      current_price_timestamp: currentTimestamp,
      name: meta.name,
      type: meta.type,
      meta: {
        current_from_cache: currentFromCache,
        historical_age_ms: Math.max(0, nowMs() - (historicalSeries.timestamp || 0)),
      },
    };

    if (!currentFromCache && currentQuote && PRICE_CACHE_TTL_MS > 0) {
      priceCache.set(symbol, currentQuote);
      pruneCache(priceCache, PRICE_CACHE_MAX_ENTRIES);
    }

    return res.json(responsePayload);
  } catch (error) {
    console.error('[server] price details error', error);
    if (error?.isRateLimit) {
      return res.status(429).json({ error: error.message || 'External price API rate limit hit.' });
    }
    return res.status(502).json({ error: error.message || 'Failed to retrieve price information.' });
  }
});
app.post('/api/prices', async (req, res) => {
  const { symbols = [] } = req.body || {};

  if (!Array.isArray(symbols) || symbols.length === 0) {
    return res.status(400).json({ error: 'symbols must be a non-empty array' });
  }

  const uniqueSymbols = [...new Set(symbols.map((symbol) => String(symbol || '').trim().toUpperCase()).filter(Boolean))];
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















