#!/usr/bin/env node
/**
 * Functional smoke test for the dashboard performance chart.
 * Fetches earliest/previous/latest price snapshots for a list of symbols
 * using Yahoo Finance's free chart endpoint (same strategy as the UI).
 *
 * Usage:
 *   node scripts/test-holdings-fetch.mjs AAPL MSFT
 *   node scripts/test-holdings-fetch.mjs --file holdings.json
 *
 * The JSON file format can be either an array of strings or an array of
 * objects containing a `symbol` property.
 */

import { readFile } from "fs/promises";
import process from "process";

const YAHOO_CHART_ENDPOINT = "https://query1.finance.yahoo.com/v8/finance/chart";
const YAHOO_QUERY =
  "range=max&interval=1d&includePrePost=false&lang=en-US&region=US&corsDomain=finance.yahoo.com";
const FREE_DATA_REFRESH_MS = 6 * 60 * 60 * 1000;

const snapshotCache = new Map();

const formatDate = (date) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(date);

const parseChartResult = (result) => {
  const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const quote = result?.indicators?.quote?.[0] || {};
  const closes = Array.isArray(quote?.close) ? quote.close : [];

  const readPoint = (index) => {
    const timestamp = timestamps[index];
    const close = Number(closes[index]);
    if (!timestamp || !Number.isFinite(close)) {
      return null;
    }
    return { date: new Date(timestamp * 1000), price: close };
  };

  let earliest = null;
  for (let index = 0; index < timestamps.length; index += 1) {
    earliest = readPoint(index);
    if (earliest) break;
  }
  if (!earliest) throw new Error("No usable price points in chart response.");

  let latest = null;
  let latestIndex = -1;
  for (let index = timestamps.length - 1; index >= 0; index -= 1) {
    latest = readPoint(index);
    if (latest) {
      latestIndex = index;
      break;
    }
  }
  if (!latest) throw new Error("Latest price missing from chart response.");

  let previous = null;
  for (let index = latestIndex - 1; index >= 0; index -= 1) {
    previous = readPoint(index);
    if (previous) break;
  }
  if (!previous) {
    previous = earliest;
  }

  return {
    earliest,
    previous,
    latest,
    currency: String(result?.meta?.currency || "USD").toUpperCase(),
  };
};

const fetchSnapshot = async (symbol) => {
  const normalized = String(symbol || "").trim().toUpperCase();
  if (!normalized) {
    throw new Error("Symbol is required.");
  }
  const cached = snapshotCache.get(normalized);
  if (cached && Date.now() - cached.fetchedAt < FREE_DATA_REFRESH_MS) {
    return cached.snapshot;
  }

  const url = `${YAHOO_CHART_ENDPOINT}/${encodeURIComponent(normalized)}?${YAHOO_QUERY}`;
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Yahoo Finance responded with ${response.status}`);
  }
  const payload = await response.json();
  const chartResult = payload?.chart?.result?.[0];
  if (!chartResult) {
    const errorMessage = payload?.chart?.error?.description || "Chart result unavailable.";
    throw new Error(errorMessage);
  }
  const parsed = parseChartResult(chartResult);
  const snapshot = {
    symbol: normalized,
    ...parsed,
    fetchedAt: Date.now(),
  };
  snapshotCache.set(normalized, snapshot);
  return snapshot;
};

const readSymbolsFromFile = async (filePath) => {
  const content = await readFile(filePath, "utf-8");
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`Could not parse JSON in ${filePath}: ${error.message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Expected an array in ${filePath}.`);
  }

  return parsed
    .map((entry) => {
      if (typeof entry === "string") {
        return entry;
      }
      if (entry && typeof entry === "object" && entry.symbol) {
        return entry.symbol;
      }
      return null;
    })
    .filter(Boolean)
    .map((symbol) => String(symbol).trim().toUpperCase());
};

const parseArgs = async () => {
  const args = process.argv.slice(2);
  const fileFlagIndex = args.indexOf("--file");
  if (fileFlagIndex !== -1) {
    const filePath = args[fileFlagIndex + 1];
    if (!filePath) {
      throw new Error("Missing value after --file");
    }
    const symbols = await readSymbolsFromFile(filePath);
    return { symbols, source: `file:${filePath}` };
  }

  const positionalSymbols = args.filter((arg) => !arg.startsWith("--")).map((arg) => arg.trim().toUpperCase());
  if (positionalSymbols.length > 0) {
    return { symbols: positionalSymbols, source: "cli" };
  }

  return { symbols: ["AAPL", "MSFT"], source: "default" };
};

const main = async () => {
  try {
    const { symbols, source } = await parseArgs();
    if (symbols.length === 0) {
      throw new Error("No symbols provided. Pass tickers as arguments or via --file filePath.");
    }

    console.log(`Fetching holdings snapshots for ${symbols.join(", ")} (source: ${source})`);

    const results = await Promise.allSettled(symbols.map((symbol) => fetchSnapshot(symbol)));

    const failures = results.filter((result) => result.status === "rejected");
    const successes = results.filter((result) => result.status === "fulfilled");

    successes.forEach(({ value }) => {
      console.log(`\nSymbol: ${value.symbol}`);
      console.log(`  Currency: ${value.currency}`);
      console.log(`  Earliest: ${formatDate(value.earliest.date)} @ ${value.earliest.price}`);
      console.log(`  Previous: ${formatDate(value.previous.date)} @ ${value.previous.price}`);
      console.log(`  Latest:   ${formatDate(value.latest.date)} @ ${value.latest.price}`);
    });

    if (failures.length > 0) {
      failures.forEach(({ reason }, index) => {
        console.error(`\n[Error ${index + 1}] ${reason.message || reason}`);
      });
      throw new Error(`${failures.length} of ${symbols.length} symbol lookups failed.`);
    }

    console.log("\nAll holdings snapshots fetched successfully.");
  } catch (error) {
    console.error(`\nSnapshot test failed: ${error.message || error}`);
    process.exitCode = 1;
  }
};

main();
