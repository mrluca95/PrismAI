import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_RATES = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 157,
  CHF: 0.9,
  CAD: 1.37,
  AUD: 1.5,
};

const CURRENCY_ORDER = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD"];
const SUPPORTED_CODES = Array.from(new Set([...CURRENCY_ORDER, ...Object.keys(DEFAULT_RATES)]));

const SYMBOLS = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  CHF: "Fr.",
  CAD: "C$",
  AUD: "A$",
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/?$/, "");
const HAS_BACKEND = Boolean(API_BASE_URL);
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

const CurrencyContext = createContext(null);

export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState("USD");
  const [rates, setRates] = useState(DEFAULT_RATES);
  const [ratesMeta, setRatesMeta] = useState({
    asOf: null,
    provider: HAS_BACKEND ? "backend" : "static",
    fallback: !HAS_BACKEND,
    loading: false,
    error: null,
  });
  const cancelledRef = useRef(false);

  const normalizeCurrency = useCallback(
    (code) => {
      const upper = String(code || "").trim().toUpperCase();
      if (upper && Object.prototype.hasOwnProperty.call(rates, upper)) {
        return upper;
      }
      if (upper && Object.prototype.hasOwnProperty.call(DEFAULT_RATES, upper)) {
        return upper;
      }
      return "USD";
    },
    [rates],
  );

  const convert = useCallback(
    (value, fromCurrency = "USD", toCurrency = currency) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return 0;
      }
      const from = normalizeCurrency(fromCurrency);
      const to = normalizeCurrency(toCurrency);
      const fromRate = rates[from] ?? DEFAULT_RATES[from] ?? 1;
      const toRate = rates[to] ?? DEFAULT_RATES[to] ?? 1;
      return (numeric / fromRate) * toRate;
    },
    [currency, normalizeCurrency, rates],
  );

  const format = useCallback(
    (
      value,
      {
        fromCurrency = "USD",
        toCurrency = currency,
        minimumFractionDigits = 2,
        maximumFractionDigits = 2,
        style = "currency",
        currencyDisplay = "symbol",
      } = {},
    ) => {
      const target = normalizeCurrency(toCurrency);
      const converted = convert(value, fromCurrency, target);
      return new Intl.NumberFormat("en-US", {
        style,
        currency: target,
        currencyDisplay,
        minimumFractionDigits,
        maximumFractionDigits,
      }).format(converted);
    },
    [convert, currency, normalizeCurrency],
  );

  const cycleCurrency = useCallback(() => {
    setCurrency((prev) => {
      const currentIndex = CURRENCY_ORDER.indexOf(normalizeCurrency(prev));
      const nextIndex = (currentIndex + 1) % CURRENCY_ORDER.length;
      return CURRENCY_ORDER[nextIndex];
    });
  }, [normalizeCurrency]);

  const refreshRates = useCallback(async ({ force = false } = {}) => {
    if (!HAS_BACKEND || cancelledRef.current) {
      return null;
    }

    setRatesMeta((prev) => ({
      ...prev,
      loading: true,
      error: null,
    }));

    try {
      const url = new URL(`${API_BASE_URL}/api/currency/rates`);
      if (force) {
        url.searchParams.set("refresh", "1");
      }

      const response = await fetch(url.toString(), {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data = await response.json();
      if (!data || typeof data !== "object" || !data.rates) {
        throw new Error("Malformed currency rates payload.");
      }

      if (cancelledRef.current) {
        return null;
      }

      const nextRates = { ...DEFAULT_RATES };
      for (const code of SUPPORTED_CODES) {
        const raw = data.rates[code];
        const numeric = Number(raw);
        if (Number.isFinite(numeric) && numeric > 0) {
          nextRates[code] = numeric;
        }
      }
      nextRates.USD = 1;

      setRates(nextRates);
      setRatesMeta({
        asOf: data.as_of || new Date().toISOString(),
        provider: data.provider || "backend",
        fallback: Boolean(data.fallback),
        loading: false,
        error: null,
      });
      return data;
    } catch (error) {
      if (cancelledRef.current) {
        return null;
      }
      const message = error?.message || "Unable to refresh currency rates.";
      setRatesMeta((prev) => ({
        ...prev,
        loading: false,
        error: message,
      }));
      return null;
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    if (!HAS_BACKEND) {
      return () => {
        cancelledRef.current = true;
      };
    }

    refreshRates();
    const intervalId = setInterval(() => {
      refreshRates();
    }, REFRESH_INTERVAL_MS);

    return () => {
      cancelledRef.current = true;
      clearInterval(intervalId);
    };
  }, [refreshRates]);

  const value = useMemo(
    () => ({
      currency,
      setCurrency: (code) => setCurrency(normalizeCurrency(code)),
      cycleCurrency,
      convert,
      format,
      symbol: SYMBOLS[currency] || "",
      rates,
      ratesMeta,
      refreshRates,
      availableCurrencies: CURRENCY_ORDER.filter((code) => Object.prototype.hasOwnProperty.call(rates, code)),
    }),
    [convert, currency, cycleCurrency, format, normalizeCurrency, rates, ratesMeta, refreshRates],
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.__prismCurrency = {
        currency,
        rates,
        meta: ratesMeta,
        format: (value, options = {}) => format(value, options),
        convert: (value, fromCurrency = "USD", toCurrency = currency) => convert(value, fromCurrency, toCurrency),
      };
    }
  }, [currency, format, convert, rates, ratesMeta]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return context;
}
