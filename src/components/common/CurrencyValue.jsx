import React from "react";
import { useCurrency } from "@/context/CurrencyContext.jsx";

export default function CurrencyValue({
  value,
  fromCurrency = "USD",
  minimumFractionDigits = 2,
  maximumFractionDigits = 2,
  prefix = "",
  suffix = "",
}) {
  const { format } = useCurrency();
  return (
    <>
      {prefix}
      {format(value, { fromCurrency, minimumFractionDigits, maximumFractionDigits })}
      {suffix}
    </>
  );
}
