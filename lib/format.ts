export function formatUSDLarge(value: number | null | undefined): string {
  if (value == null) return "—";
  const trillion = 1e12;
  const billion = 1e9;
  if (Math.abs(value) >= trillion) return `$${(value / trillion).toFixed(2)}T`;
  if (Math.abs(value) >= billion) return `$${(value / billion).toFixed(1)}B`;
  return `$${value.toLocaleString()}`;
}

export function formatGBP(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPct(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}
