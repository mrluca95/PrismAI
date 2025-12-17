import assert from 'node:assert/strict';
import { getPortfolioSeries } from './portfolioSeries.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const dateKey = (d) => new Date(d).toISOString().slice(0, 10);

class MockPriceProvider {
  constructor(priceMap) {
    this.priceMap = priceMap;
  }

  async getDailyCloses(symbol, startDate, endDate) {
    const map = this.priceMap[symbol] || {};
    const results = [];
    for (let ts = startDate.getTime(); ts <= endDate.getTime(); ts += DAY_MS) {
      const date = new Date(ts);
      const key = dateKey(date);
      const close = map[key] ?? (results.length > 0 ? results[results.length - 1].close : null);
      results.push({ date, close });
    }
    return results;
  }
}

async function runTests() {
  await simpleReturnMatches();
  await depositDoesNotInflate();
  await denseSeriesCounts();
}

async function simpleReturnMatches() {
  const prices = {
    AAA: {
      '2024-01-01': 100,
      '2024-01-02': 110,
      '2024-01-03': 120,
    },
  };
  const provider = new MockPriceProvider(prices);
  const { points } = await getPortfolioSeries({
    rangeKey: '1W',
    asOfDate: new Date('2024-01-03'),
    transactions: [{ asset_symbol: 'AAA', type: 'buy', quantity: 1, price: 100, date: '2024-01-01' }],
    priceProvider: provider,
  });
  const start = points[0];
  const end = points[points.length - 1];
  const simpleReturn = (120 - 100) / 100;
  assert(Math.abs((end.twrIndex - 1) - simpleReturn) < 0.0001, 'TWR should match simple return without flows');
  assert(points.length >= 5, '1W should have multiple points');
}

async function depositDoesNotInflate() {
  const prices = {
    AAA: {
      '2024-01-01': 100,
      '2024-01-02': 100,
      '2024-01-03': 120,
      '2024-01-04': 120,
    },
  };
  const provider = new MockPriceProvider(prices);
  const { points } = await getPortfolioSeries({
    rangeKey: '1W',
    asOfDate: new Date('2024-01-04'),
    transactions: [
      { asset_symbol: 'AAA', type: 'buy', quantity: 1, price: 100, date: '2024-01-01' },
      { asset_symbol: 'AAA', type: 'buy', quantity: 1, price: 120, date: '2024-01-03' },
    ],
    priceProvider: provider,
  });
  const startIndex = points[0].twrIndex;
  const endIndex = points[points.length - 1].twrIndex;
  const performance = endIndex / startIndex - 1;
  assert(performance < 0.21 && performance > 0.19, 'Deposit should not inflate TWR beyond price change (~20%)');
}

async function denseSeriesCounts() {
  const prices = { AAA: { '2024-01-01': 100, '2024-01-10': 100 } };
  const provider = new MockPriceProvider(prices);
  const { pointCount } = await getPortfolioSeries({
    rangeKey: '1M',
    asOfDate: new Date('2024-01-31'),
    transactions: [{ asset_symbol: 'AAA', type: 'buy', quantity: 1, price: 100, date: '2024-01-01' }],
    priceProvider: provider,
  });
  assert(pointCount >= 18, '1M range should include dense daily points');
}

runTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
