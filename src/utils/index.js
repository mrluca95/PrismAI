const pageRoutes = {
  Dashboard: '/dashboard',
  Portfolio: '/portfolio',
  Settings: '/settings',
  AssetDetail: '/asset-detail',
  Onboarding: '/onboarding',
};

export function createPageUrl(pageName) {
  return pageRoutes[pageName] || '/';
}

export function resolvePageName(pathname) {
  const entry = Object.entries(pageRoutes).find(([, path]) => path === pathname);
  return entry ? entry[0] : null;
}

export function formatCurrency(value, currencyOrOptions = {}) {
  const options = typeof currencyOrOptions === 'string'
    ? { toCurrency: currencyOrOptions }
    : currencyOrOptions || {};

  if (typeof window !== 'undefined' && window.__prismCurrency?.format) {
    return window.__prismCurrency.format(value, options);
  }

  const {
    toCurrency = (typeof currencyOrOptions === 'string' ? currencyOrOptions : 'USD'),
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
  } = options;

  const number = Number(value) || 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: toCurrency,
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(number);
}

