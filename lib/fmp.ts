/**
 * Financial Modeling Prep client. FMP migrated to a "stable" API and now
 * restricts the legacy /api/v3 routes to eligible accounts, so newer keys get
 * empty/blocked responses there. We try the stable endpoint first (per symbol)
 * and fall back to the legacy batch endpoint — so live prices work regardless
 * of which API the key is provisioned for. `source` is returned for diagnostics
 * (never the key).
 */

const STABLE = "https://financialmodelingprep.com/stable";
const LEGACY = "https://financialmodelingprep.com/api/v3";

export interface FmpQuote {
  symbol: string;
  price: number | null;
  marketCap: number | null;
}

export type FmpSource = "stable" | "legacy" | "none";

async function tryJson(url: string): Promise<unknown | null> {
  try {
    const r = await fetch(url, { next: { revalidate: 60 } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function readRow(row: unknown, fallbackSymbol: string): FmpQuote | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const price = typeof r.price === "number" ? r.price : null;
  if (price == null) return null;
  return {
    symbol: typeof r.symbol === "string" ? r.symbol : fallbackSymbol,
    price,
    marketCap: typeof r.marketCap === "number" ? r.marketCap : null,
  };
}

export async function fetchQuotes(
  symbols: string[],
  key: string
): Promise<{ quotes: Record<string, FmpQuote>; source: FmpSource }> {
  if (!key || symbols.length === 0) return { quotes: {}, source: "none" };

  // 1) Stable API — one request per symbol.
  const stable = await Promise.all(
    symbols.map(async (s) => {
      const data = await tryJson(`${STABLE}/quote?symbol=${encodeURIComponent(s)}&apikey=${key}`);
      const row = Array.isArray(data) ? data[0] : data;
      const q = readRow(row, s);
      return q ? ([s, q] as const) : null;
    })
  );
  const quotes: Record<string, FmpQuote> = {};
  for (const r of stable) if (r) quotes[r[0]] = r[1];
  if (Object.keys(quotes).length > 0) return { quotes, source: "stable" };

  // 2) Legacy API — batch endpoint.
  const data = await tryJson(`${LEGACY}/quote/${symbols.join(",")}?apikey=${key}`);
  if (Array.isArray(data)) {
    for (const row of data) {
      const q = readRow(row, "");
      if (q && q.symbol) quotes[q.symbol] = q;
    }
    if (Object.keys(quotes).length > 0) return { quotes, source: "legacy" };
  }

  return { quotes: {}, source: "none" };
}
