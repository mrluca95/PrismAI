import { Transaction } from '../entities/Transaction.js';
import PriceProvider from './priceProvider.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const normaliseDate = (input) => {
  const d = new Date(input);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

const dateKey = (date) => normaliseDate(date).toISOString().slice(0, 10);

export const RANGE_KEYS = ['1D', '1W', '1M', '3M', 'YTD', '1Y', '5Y', 'ALL'];

const determineStartDate = (rangeKey, asOfDate, earliestDate) => {
  const end = normaliseDate(asOfDate);
  switch (rangeKey) {
    case '1D':
      return new Date(end.getTime() - 4 * DAY_MS);
    case '1W':
      return new Date(end.getTime() - 7 * DAY_MS);
    case '1M':
      return new Date(end.getTime() - 31 * DAY_MS);
    case '3M':
      return new Date(end.getTime() - 93 * DAY_MS);
    case 'YTD':
      return new Date(Date.UTC(end.getUTCFullYear(), 0, 1));
    case '1Y':
      return new Date(end.getTime() - 365 * DAY_MS);
    case '5Y':
      return new Date(end.getTime() - 5 * 365 * DAY_MS);
    case 'ALL':
    default:
      return earliestDate ? normaliseDate(earliestDate) : new Date(end.getTime() - 365 * DAY_MS);
  }
};

const buildDateIndex = (start, end) => {
  const dates = [];
  for (let ts = start.getTime(); ts <= end.getTime(); ts += DAY_MS) {
    dates.push(new Date(ts));
  }
  return dates;
};

const collectSymbolsFromAssets = (assets = []) => {
  return [...new Set(assets.map((asset) => String(asset.symbol || '').trim().toUpperCase()).filter(Boolean))];
};

const buildSyntheticTransactionsFromAssets = (assets = []) => {
  return assets.map((asset) => ({
    asset_symbol: asset.symbol,
    type: 'buy',
    quantity: asset.quantity,
    price: asset.purchase_price || asset.current_price || 0,
    date: asset.created_at || new Date().toISOString(),
    broker: asset.broker || 'Imported',
    synthetic: true,
  }));
};

export async function getPortfolioSeries({
  rangeKey = '1M',
  asOfDate = new Date(),
  assets = [],
  transactions = null,
  priceProvider = new PriceProvider(),
} = {}) {
  const safeRangeKey = String(rangeKey || '1M').toUpperCase();

  const txns = Array.isArray(transactions)
    ? [...transactions]
    : await Transaction.list();

  const inputTransactions = txns.length === 0 ? buildSyntheticTransactionsFromAssets(assets) : txns;

  const sortedTxns = [...inputTransactions]
    .filter((tx) => tx && tx.asset_symbol && Number.isFinite(Number(tx.quantity)))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const earliestTxnDate = sortedTxns.length > 0 ? sortedTxns[0].date : null;
  const startDate = determineStartDate(safeRangeKey, asOfDate, earliestTxnDate);
  const endDate = normaliseDate(asOfDate);

  const symbols = new Set();
  sortedTxns.forEach((tx) => {
    const sym = String(tx.asset_symbol || '').trim().toUpperCase();
    if (sym) symbols.add(sym);
  });
  collectSymbolsFromAssets(assets).forEach((sym) => symbols.add(sym));

  const dateIndex = buildDateIndex(startDate, endDate);
  const symbolList = [...symbols];

  const priceSeries = new Map();
  const priceSources = [];
  for (const symbol of symbolList) {
    const closes = await priceProvider.getDailyCloses(symbol, startDate, endDate);
    priceSeries.set(symbol, closes);
    priceSources.push({ symbol, source: closes.source, lastFetched: closes.lastFetched });
  }

  const holdings = Object.create(null);
  const lastPrice = Object.create(null);
  const dailyPoints = [];

  let prevValue = null;
  let twrIndex = 1;
  let cashBalance = 0;

  let txnCursor = 0;

  for (let idx = 0; idx < dateIndex.length; idx += 1) {
    const date = dateIndex[idx];
    const key = dateKey(date);
    let cashFlow = 0;

    while (txnCursor < sortedTxns.length) {
      const tx = sortedTxns[txnCursor];
      const txKey = dateKey(tx.date || tx.created_at || tx.updated_at || new Date());
      if (txKey > key) break;
      if (txKey === key) {
        const qty = Number(tx.quantity) || 0;
        const price = Number(tx.price) || 0;
        const sym = String(tx.asset_symbol || '').trim().toUpperCase();
        if (!holdings[sym]) holdings[sym] = 0;
        if (String(tx.type || 'buy').toLowerCase() === 'sell') {
          holdings[sym] -= qty;
          const proceeds = qty * price;
          cashBalance += proceeds; // sale adds cash
          cashFlow -= proceeds; // assume withdrawal of proceeds unless reinvested
          cashBalance += cashFlow; // apply withdrawal
        } else {
          holdings[sym] += qty;
          const cost = qty * price;
          cashFlow += cost; // external deposit to fund purchase
          cashBalance += cost; // deposit increases cash
          cashBalance -= cost; // buying asset spends cash
        }
      }
      txnCursor += 1;
    }

    let holdingsValue = 0;
    for (const symbol of symbolList) {
      const priceEntry = priceSeries.get(symbol)[idx];
      if (priceEntry && Number.isFinite(priceEntry.close)) {
        lastPrice[symbol] = priceEntry.close;
      }
      const priceToUse = lastPrice[symbol];
      const shares = holdings[symbol] || 0;
      if (Number.isFinite(priceToUse) && shares !== 0) {
        holdingsValue += shares * priceToUse;
      }
    }

    const totalValue = holdingsValue + cashBalance;

    if (prevValue === null) {
      prevValue = totalValue;
      dailyPoints.push({ date, value: totalValue, twrIndex, cashFlow });
      continue;
    }

    const denominator = prevValue !== 0 ? prevValue : 1;
    const dailyReturn = (totalValue - cashFlow - prevValue) / denominator;
    twrIndex = twrIndex * (1 + dailyReturn);

    dailyPoints.push({ date, value: totalValue, twrIndex, cashFlow });
    prevValue = totalValue;
  }

  const metadata = {
    pointCount: dailyPoints.length,
    startDate,
    endDate,
    rangeKey: safeRangeKey,
    symbols: symbolList,
    priceSources,
  };

  if (dailyPoints.length <= 3) {
    console.warn('[getPortfolioSeries] sparse series detected', metadata);
  }

  return { points: dailyPoints, ...metadata };
}

export default getPortfolioSeries;
