import { firestore } from './firebase-admin.js';
import { getTierLimits } from './config.js';

const usageCollection = firestore.collection('apiUsage');

const periodForDate = (dateInput = new Date()) => {
  const date = new Date(dateInput);
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { start, end };
};

const usageDocId = (userId, start, end) => `${userId}_${start.toISOString()}_${end.toISOString()}`;

const normalizeUsage = (data = {}) => ({
  userId: data.userId,
  periodStart: data.periodStart,
  periodEnd: data.periodEnd,
  llmCalls: Number.isFinite(data.llmCalls) ? data.llmCalls : 0,
  priceRequests: Number.isFinite(data.priceRequests) ? data.priceRequests : 0,
  uploads: Number.isFinite(data.uploads) ? data.uploads : 0,
});

const createEmptyUsage = (userId, start, end) => ({
  userId,
  periodStart: start.toISOString(),
  periodEnd: end.toISOString(),
  llmCalls: 0,
  priceRequests: 0,
  uploads: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

export const getUsage = async (userId, date = new Date()) => {
  const { start, end } = periodForDate(date);
  const docRef = usageCollection.doc(usageDocId(userId, start, end));
  const snapshot = await docRef.get();
  if (snapshot.exists) {
    return normalizeUsage(snapshot.data());
  }
  const usage = createEmptyUsage(userId, start, end);
  await docRef.set(usage);
  return normalizeUsage(usage);
};

export const assertWithinQuota = (user, usage) => {
  const limits = getTierLimits(user.tier);
  if (usage.llmCalls >= limits.insights) {
    const error = new Error('Insight quota exceeded for current billing period.');
    error.status = 429;
    throw error;
  }
  if (usage.priceRequests >= limits.quotes) {
    const error = new Error('Price data quota exceeded for current billing period.');
    error.status = 429;
    throw error;
  }
};

export const consumeUsage = async (user, { insightCalls = 0, quoteRequests = 0, uploads = 0 } = {}) => {
  const { start, end } = periodForDate();
  const docRef = usageCollection.doc(usageDocId(user.id, start, end));
  const limits = getTierLimits(user.tier);

  const usage = await firestore.runTransaction(async (tx) => {
    const snapshot = await tx.get(docRef);
    const existing = snapshot.exists ? snapshot.data() : createEmptyUsage(user.id, start, end);
    const next = {
      ...existing,
      llmCalls: (existing.llmCalls || 0) + insightCalls,
      priceRequests: (existing.priceRequests || 0) + quoteRequests,
      uploads: (existing.uploads || 0) + uploads,
      updatedAt: new Date().toISOString(),
    };

    if (next.llmCalls > limits.insights) {
      const error = new Error('Insight quota exceeded for current billing period.');
      error.status = 429;
      throw error;
    }
    if (next.priceRequests > limits.quotes) {
      const error = new Error('Price data quota exceeded for current billing period.');
      error.status = 429;
      throw error;
    }

    tx.set(docRef, next);
    return next;
  });

  return normalizeUsage(usage);
};