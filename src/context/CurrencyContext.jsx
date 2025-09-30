import React, { createContext, useContext, useMemo, useState, useCallback, useEffect } from "react";

const CURRENCY_ORDER = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD"];

const RATES = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 157,
  CHF: 0.9,
  CAD: 1.37,
  AUD: 1.5,
};

const SYMBOLS = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  CHF: "Fr.",
  CAD: "C$",
  AUD: "A$",
};

const CurrencyContext = createContext(null);

export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState("USD");

  const normalizeCurrency = useCallback((code) => {
    const upper = String(code || "").toUpperCase();
    return RATES[upper] ? upper : "USD";
  }, []);

  const convert = useCallback(
    (value, fromCurrency = "USD", toCurrency = currency) => {
      const numeric = Number(value) || 0;
      const from = normalizeCurrency(fromCurrency);
      const to = normalizeCurrency(toCurrency);
      const fromRate = RATES[from] ?? 1;
      const toRate = RATES[to] ?? 1;
      return (numeric / fromRate) * toRate;
    },
    [currency, normalizeCurrency],
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

  const value = useMemo(
    () => ({
      currency,
      setCurrency: (code) => setCurrency(normalizeCurrency(code)),
      cycleCurrency,
      convert,
      format,
      symbol: SYMBOLS[currency] || "",
      rates: RATES,
      availableCurrencies: CURRENCY_ORDER,
    }),
    [convert, currency, cycleCurrency, normalizeCurrency, format],
  );


  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__prismCurrency = {
        currency,
        format: (value, options = {}) => format(value, options),
        convert: (value, fromCurrency = 'USD', toCurrency = currency) => convert(value, fromCurrency, toCurrency),
      };
    }
  }, [currency, format, convert]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return context;
}
