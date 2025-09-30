import { readCollection, writeCollection, generateId, nowIso } from './storage';

const STORAGE_KEY = 'ai_insights';

const demoInsights = [
  {
    title: 'Tech Exposure Check',
    description: '**Tech Exposure Check**\n\nAAPL and TSLA together make up more than 40% of your equity exposure. Consider incrementally adding healthcare or consumer staples names to balance the portfolio.\n\n[Source](https://www.investopedia.com/terms/d/diversification.asp)',
    type: 'diversification',
    priority: 'medium',
    related_assets: ['AAPL', 'TSLA'],
  },
  {
    title: 'Rebalance Growth Winners',
    description: '**Rebalance Growth Winners**\n\nYour growth holdings have outperformed this quarter. Taking a small portion of gains and reallocating to dividend ETFs like VOO can lock in profits without reducing market exposure.\n\n[Source](https://www.fool.com/investing/how-to-invest/rebalancing/)',
    type: 'rebalancing',
    priority: 'low',
    related_assets: ['VOO'],
  },
  {
    title: 'Watch Crypto Volatility',
    description: '**Watch Crypto Volatility**\n\nETH price swings remain elevated. Setting a price alert at +/-5% from today\'s price can help you react quickly without monitoring constantly.',
    type: 'risk_alert',
    priority: 'high',
    related_assets: ['ETH'],
  },
];

let seeded = false;

const ensureSeed = () => {
  if (seeded) {
    return;
  }
  const existing = readCollection(STORAGE_KEY);
  if (!existing || existing.length === 0) {
    const now = nowIso();
    const payload = demoInsights.map((insight, index) => ({
      id: generateId(),
      created_date: new Date(new Date(now).getTime() - index * 3600 * 1000).toISOString(),
      ...insight,
    }));
    writeCollection(STORAGE_KEY, payload);
  }
  seeded = true;
};

const clone = (insight) => ({
  ...insight,
  related_assets: [...(insight.related_assets || [])],
});

const sortCollection = (collection, sortBy) => {
  if (!sortBy) {
    return [...collection];
  }
  const direction = sortBy.startsWith('-') ? -1 : 1;
  const field = sortBy.replace(/^[-+]/, '') || 'created_date';

  return [...collection].sort((a, b) => {
    const aValue = a[field];
    const bValue = b[field];

    if (field === 'created_date') {
      const aTime = new Date(aValue || 0).getTime();
      const bTime = new Date(bValue || 0).getTime();
      return direction * (aTime - bTime);
    }

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return direction * (aValue - bValue);
    }

    return direction * String(aValue || '').localeCompare(String(bValue || ''));
  });
};

export const AIInsight = {
  async list(sortBy = '-created_date', limit) {
    ensureSeed();
    let collection = readCollection(STORAGE_KEY);
    collection = sortCollection(collection, sortBy);
    if (typeof limit === 'number') {
      collection = collection.slice(0, limit);
    }
    return collection.map(clone);
  },

  async create({ title, description, type = 'opportunity', priority = 'medium', related_assets = [] }) {
    ensureSeed();
    const collection = readCollection(STORAGE_KEY);
    const payload = {
      id: generateId(),
      created_date: nowIso(),
      title: title || 'Portfolio Insight',
      description: description || '',
      type,
      priority,
      related_assets: related_assets.filter(Boolean),
    };
    collection.unshift(payload);
    writeCollection(STORAGE_KEY, collection);
    return clone(payload);
  },
};

export default AIInsight;
