import { CURRENCIES } from "../types";

export function getCurrencySymbol(code: string): string {
  const c = CURRENCIES.find((c) => c.code === code);
  return c ? c.symbol : code;
}

export function formatAmount(amount: number, currencyCode: string): string {
  const symbol = getCurrencySymbol(currencyCode);
  const abs = Math.abs(amount);
  return `${symbol}${abs.toFixed(2)}`;
}

/** Use signs for chart/history/net values; transaction amounts remain absolute. */
export function formatSignedAmount(
  amount: number,
  currencyCode: string,
): string {
  return `${amount < 0 ? "-" : amount > 0 ? "+" : ""}${formatAmount(amount, currencyCode)}`;
}
