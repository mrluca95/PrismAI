import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { User } from '@/entities/User';
import { Asset } from '@/entities/Asset';
import { AIInsight } from '@/entities/AIInsight';

const defaultState = {
  user: null,
  usage: null,
  limits: null,
  providers: { google: false },
  loading: true,
  error: null,
};

const SNAPSHOT_KEY = 'prism_auth_snapshot_v1';

const readSessionSnapshot = () => {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(SNAPSHOT_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch (error) {
    console.warn('[auth] failed to read cached session', error);
    return null;
  }
};

const writeSessionSnapshot = (payload) => {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return;
  }
  try {
    if (!payload || (!payload.user && !payload.usage && !payload.limits)) {
      window.sessionStorage.removeItem(SNAPSHOT_KEY);
      return;
    }
    window.sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify({
      user: payload.user ?? null,
      usage: payload.usage ?? null,
      limits: payload.limits ?? null,
    }));
  } catch (error) {
    console.warn('[auth] failed to persist cached session', error);
  }
};

const clearSessionSnapshot = () => {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return;
  }
  try {
    window.sessionStorage.removeItem(SNAPSHOT_KEY);
  } catch (error) {
    console.warn('[auth] failed to clear cached session', error);
  }
};

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const cachedSessionRef = useRef(readSessionSnapshot());
  const hasCachedSessionRef = useRef(Boolean(cachedSessionRef.current?.user));

  const [state, setState] = useState(() => {
    const snapshot = cachedSessionRef.current;
    if (snapshot && snapshot.user) {
      const userId = snapshot.user?.id ?? null;
      Asset.setCurrentUser(userId);
      AIInsight.setCurrentUser(userId);
      return {
        ...defaultState,
        user: snapshot.user ?? null,
        usage: snapshot.usage ?? null,
        limits: snapshot.limits ?? null,
        loading: false,
        error: null,
      };
    }
    return defaultState;
  });

  const applyPayload = useCallback((payload = {}) => {
    const userId = payload?.user?.id ?? null;
    Asset.setCurrentUser(userId);
    AIInsight.setCurrentUser(userId);
    const snapshot = {
      user: payload?.user ?? null,
      usage: payload?.usage ?? null,
      limits: payload?.limits ?? null,
    };
    cachedSessionRef.current = snapshot;
    hasCachedSessionRef.current = Boolean(userId);
    writeSessionSnapshot(snapshot);
    setState((prev) => ({
      ...prev,
      user: snapshot.user,
      usage: snapshot.usage,
      limits: snapshot.limits,
      loading: false,
      error: null,
    }));
  }, []);

  const loadProviders = useCallback(async () => {
    try {
      const providers = await User.getProviders();
      setState((prev) => ({ ...prev, providers }));
    } catch (error) {
      setState((prev) => ({ ...prev, providers: { google: false } }));
    }
  }, []);

  const refresh = useCallback(async ({ silent = false } = {}) => {
    setState((prev) => ({
      ...prev,
      loading: silent ? prev.loading : !prev.user,
      error: null,
    }));
    try {
      const payload = await User.me();
      applyPayload(payload);
    } catch (error) {
      console.error('[auth] failed to load session', error);
      Asset.setCurrentUser(null);
      AIInsight.setCurrentUser(null);
      cachedSessionRef.current = null;
      hasCachedSessionRef.current = false;
      clearSessionSnapshot();
      setState((prev) => ({
        ...prev,
        user: null,
        usage: null,
        limits: null,
        loading: false,
      }));
    }
  }, [applyPayload]);

  useEffect(() => {
    refresh({ silent: hasCachedSessionRef.current });
    loadProviders();
  }, [refresh, loadProviders]);

  const login = useCallback(async (credentials) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const payload = await User.login(credentials);
      applyPayload(payload);
      return payload;
    } catch (error) {
      setState((prev) => ({ ...prev, loading: false, error }));
      throw error;
    }
  }, [applyPayload]);

  const register = useCallback(async (details) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const payload = await User.register(details);
      applyPayload(payload);
      return payload;
    } catch (error) {
      setState((prev) => ({ ...prev, loading: false, error }));
      throw error;
    }
  }, [applyPayload]);

  const logout = useCallback(async () => {
    await User.logout();
    Asset.setCurrentUser(null);
    AIInsight.setCurrentUser(null);
    cachedSessionRef.current = null;
    hasCachedSessionRef.current = false;
    clearSessionSnapshot();
    setState((prev) => ({ ...defaultState, providers: prev.providers, loading: false }));
  }, []);

  const updateProfile = useCallback(async (data) => {
    const payload = await User.updateProfile(data);
    applyPayload(payload);
    return payload;
  }, [applyPayload]);

  const updateTier = useCallback(async (data) => {
    const payload = await User.updateTier(data);
    applyPayload(payload);
    return payload;
  }, [applyPayload]);

  const contextValue = useMemo(() => ({
    ...state,
    login,
    register,
    logout,
    refresh,
    updateProfile,
    updateTier,
  }), [state, login, register, logout, refresh, updateProfile, updateTier]);

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
};





