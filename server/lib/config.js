const isProduction = process.env.NODE_ENV === 'production';

const parseIntEnv = (key, fallback) => {
  const value = process.env[key];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const tiers = {
  FREE: {
    insights: parseIntEnv('PRISM_TIER_FREE_INSIGHTS', 20),
    quotes: parseIntEnv('PRISM_TIER_FREE_QUOTES', 200),
  },
  PLUS: {
    insights: parseIntEnv('PRISM_TIER_PLUS_INSIGHTS', 200),
    quotes: parseIntEnv('PRISM_TIER_PLUS_QUOTES', 2000),
  },
  PRO: {
    insights: parseIntEnv('PRISM_TIER_PRO_INSIGHTS', 1000),
    quotes: parseIntEnv('PRISM_TIER_PRO_QUOTES', 10000),
  },
};

const PROD_SUCCESS_REDIRECT = 'https://www.prismai-portfolio.com/';
const PROD_FAILURE_REDIRECT = 'https://www.prismai-portfolio.com/login?error=oauth';

const defaultSuccessRedirect = process.env.OAUTH_SUCCESS_REDIRECT
  || (isProduction ? PROD_SUCCESS_REDIRECT : 'http://localhost:5173/dashboard');

const defaultFailureRedirect = process.env.OAUTH_FAILURE_REDIRECT
  || (isProduction ? PROD_FAILURE_REDIRECT : 'http://localhost:5173/login?error=oauth');

export const config = {
  tiers,
  session: {
    secret: process.env.SESSION_SECRET || 'change-me',
    cookieDomain: process.env.SESSION_COOKIE_DOMAIN || undefined,
    cookieSecure: isProduction,
  },
  cors: {
    allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl: process.env.GOOGLE_CALLBACK_URL,
  },
  oauth: {
    successRedirect: defaultSuccessRedirect,
    failureRedirect: defaultFailureRedirect,
  },
  isProduction,
};

export const getTierLimits = (tier) => tiers[tier] || tiers.FREE;
