import crypto from 'node:crypto';
import { firestore } from './firebase-admin.js';
import { getTierLimits } from './config.js';

const usersCollection = firestore.collection('users');

const normalizeEmail = (email) => (email ? String(email).trim().toLowerCase() : null);

const removeUndefined = (input) => {
  const output = {};
  Object.entries(input || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      output[key] = value;
    }
  });
  return output;
};

const normalizeProviders = (providers) => {
  if (!Array.isArray(providers)) {
    return [];
  }
  return providers
    .filter(Boolean)
    .map((entry) => ({
      provider: entry.provider,
      providerId: entry.providerId,
    }))
    .filter((entry) => Boolean(entry.provider) && Boolean(entry.providerId));
};

const stripSensitive = (user) => {
  if (!user) return null;
  const clone = { ...user };
  delete clone.passwordHash;
  return clone;
};

const mapUserDoc = (doc, { includeSensitive = false } = {}) => {
  if (!doc?.exists) {
    return null;
  }
  const data = doc.data() || {};
  const user = { id: doc.id, ...data };
  if (!includeSensitive) {
    return stripSensitive(user);
  }
  return user;
};

export const sanitizeUser = (user) => stripSensitive(user);

export const createUser = async (input, { includeSensitive = false } = {}) => {
  const nowIso = new Date().toISOString();
  const tier = input?.tier || 'FREE';
  const tierLimits = getTierLimits(tier);

  const payload = removeUndefined({
    email: normalizeEmail(input?.email),
    name: input?.name ?? null,
    passwordHash: input?.passwordHash ?? null,
    googleId: input?.googleId ?? null,
    imageUrl: input?.imageUrl ?? null,
    tier,
    plan: input?.plan ?? 'free',
    onboardingCompleted: input?.onboardingCompleted ?? false,
    profile: input?.profile ?? null,
    monthlyInsights: input?.monthlyInsights ?? tierLimits.insights,
    monthlyQuotes: input?.monthlyQuotes ?? tierLimits.quotes,
    usageResetAt: input?.usageResetAt ?? null,
    providers: normalizeProviders(input?.providers),
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  const id = input?.id || crypto.randomUUID();
  await usersCollection.doc(id).set(payload);
  return getUserById(id, { includeSensitive });
};

export const updateUser = async (id, updates, { includeSensitive = false } = {}) => {
  if (!id) {
    return null;
  }
  const nowIso = new Date().toISOString();
  const payload = removeUndefined({
    ...updates,
    updatedAt: nowIso,
  });

  if (payload.email !== undefined) {
    payload.email = normalizeEmail(payload.email);
  }
  if (payload.providers !== undefined) {
    payload.providers = normalizeProviders(payload.providers);
  }

  await usersCollection.doc(id).set(payload, { merge: true });
  return getUserById(id, { includeSensitive });
};

export const getUserById = async (id, { includeSensitive = false } = {}) => {
  if (!id) {
    return null;
  }
  const doc = await usersCollection.doc(id).get();
  return mapUserDoc(doc, { includeSensitive });
};

export const getUserByEmail = async (email, { includeSensitive = false } = {}) => {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return null;
  }
  const snapshot = await usersCollection.where('email', '==', normalized).limit(1).get();
  if (snapshot.empty) {
    return null;
  }
  return mapUserDoc(snapshot.docs[0], { includeSensitive });
};

export const getUserByGoogleId = async (googleId, { includeSensitive = false } = {}) => {
  if (!googleId) {
    return null;
  }
  const snapshot = await usersCollection.where('googleId', '==', googleId).limit(1).get();
  if (snapshot.empty) {
    return null;
  }
  return mapUserDoc(snapshot.docs[0], { includeSensitive });
};

export const findUserByEmail = getUserByEmail;