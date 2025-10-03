import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
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

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [state, setState] = useState(defaultState);

  const applyPayload = useCallback((payload = {}) => {
    const userId = payload?.user?.id ?? null;
    Asset.setCurrentUser(userId);
    AIInsight.setCurrentUser(userId);
    setState((prev) => ({
      ...prev,
      ...payload,
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

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }));
    try {
      const payload = await User.me();
      applyPayload(payload);
    } catch (error) {
      console.error('[auth] failed to load session', error);
      Asset.setCurrentUser(null);
      AIInsight.setCurrentUser(null);
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
    refresh();
    loadProviders();
  }, [refresh, loadProviders]);

  const login = useCallback(async (credentials) => {
    setState((prev) => ({ ...prev, loading: true }));
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
    setState((prev) => ({ ...prev, loading: true }));
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
