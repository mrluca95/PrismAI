import { readItem, writeItem, nowIso } from './storage';

const STORAGE_KEY = 'user';

const defaultUser = {
  id: 'demo-user',
  email: 'demo@prism.ai',
  name: 'Jamie Investor',
  onboardingCompleted: false,
  plan: 'free',
  profile: {},
  created_at: nowIso(),
  updated_at: nowIso(),
};

const clone = (user) => ({
  ...user,
  profile: { ...(user.profile || {}) },
});

const ensureUser = () => {
  const current = readItem(STORAGE_KEY, null);
  if (!current) {
    writeItem(STORAGE_KEY, { ...defaultUser, created_at: nowIso(), updated_at: nowIso() });
  }
};

export const User = {
  async me() {
    ensureUser();
    const user = readItem(STORAGE_KEY, defaultUser);
    return clone(user);
  },

  async updateMyUserData(patch) {
    ensureUser();
    const current = readItem(STORAGE_KEY, defaultUser);
    const updated = {
      ...current,
      ...patch,
      profile: {
        ...(current.profile || {}),
        ...(patch.profile || {}),
      },
      updated_at: nowIso(),
    };
    writeItem(STORAGE_KEY, updated);
    return clone(updated);
  },

  async logout() {
    const timestamp = nowIso();
    writeItem(STORAGE_KEY, { ...defaultUser, created_at: timestamp, updated_at: timestamp });
    return true;
  },
};

export default User;
