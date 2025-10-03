import { requestJson } from '@/integrations/Core';

const jsonHeaders = { 'Content-Type': 'application/json' };

const safeBody = (payload) => JSON.stringify(payload ?? {});

const providersCache = { value: null, fetchedAt: 0 };
const PROVIDER_CACHE_TTL_MS = 60_000;

const User = {
  async me() {
    try {
      return await requestJson('/auth/me', { method: 'GET' });
    } catch (error) {
      if (error.status === 401) {
        return { user: null };
      }
      throw error;
    }
  },

  async register({ email, password, name }) {
    const payload = await requestJson('/auth/register', {
      body: safeBody({ email, password, name }),
      headers: jsonHeaders,
    });
    return payload;
  },

  async login({ email, password }) {
    const payload = await requestJson('/auth/login', {
      body: safeBody({ email, password }),
      headers: jsonHeaders,
    });
    return payload;
  },

  async logout() {
    await requestJson('/auth/logout', { method: 'POST' });
    return { user: null };
  },

  async updateProfile(data = {}) {
    const payload = await requestJson('/api/account/profile', {
      method: 'PATCH',
      body: safeBody(data),
      headers: jsonHeaders,
    });
    return payload;
  },

  async updateTier(data = {}) {
    const payload = await requestJson('/api/account/tier', {
      body: safeBody(data),
      headers: jsonHeaders,
    });
    return payload;
  },

  async getProviders(force = false) {
    const now = Date.now();
    if (!force && providersCache.value && now - providersCache.fetchedAt < PROVIDER_CACHE_TTL_MS) {
      return providersCache.value;
    }
    try {
      const providers = await requestJson('/auth/providers', { method: 'GET' });
      providersCache.value = providers;
      providersCache.fetchedAt = now;
      return providers;
    } catch (error) {
      console.warn('[User] failed to load auth providers', error);
      return { google: false };
    }
  },
};

export { User };

export default User;
