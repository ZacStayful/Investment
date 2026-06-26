import { kvGet, kvSet } from "./kv";
import { framework } from "./framework";
import type { PortfolioBalances } from "./types";

/**
 * Holdings & live returns. The user enters shares owned + total amount invested
 * (£ cost basis) per position. Current value is derived from the live share
 * price (FMP) converted to GBP via the live GBP/USD rate, and the return is
 * value − cost. SpaceX falls back to the framework reference price until FMP
 * indexes SPCX.
 */

export interface Holding {
  shares: number;
  costBasisGBP: number;
}

export type HoldingsMap = {
  tesla: Holding;
  google: Holding;
  spacex: Holding;
  sp500: Holding;
};

export const HOLDINGS_KEY = "portfolio:holdings";

export const POSITIONS = ["tesla", "google", "spacex", "sp500"] as const;
export type Position = (typeof POSITIONS)[number];

export const TICKERS: Record<Position, string> = {
  tesla: "TSLA",
  google: "GOOGL",
  spacex: "SPCX",
  sp500: "SPY",
};

export const NAMES: Record<Position, string> = {
  tesla: "Tesla",
  google: "Google",
  spacex: "SpaceX",
  sp500: "S&P 500",
};

const emptyHolding = (): Holding => ({ shares: 0, costBasisGBP: 0 });

export const DEFAULT_HOLDINGS: HoldingsMap = {
  tesla: emptyHolding(),
  google: emptyHolding(),
  spacex: emptyHolding(),
  sp500: emptyHolding(),
};

export interface PositionValue {
  position: Position;
  name: string;
  ticker: string;
  shares: number;
  costBasisGBP: number;
  priceUSD: number | null;
  priceSource: "fmp" | "framework-fallback" | "none";
  currentValueGBP: number | null;
  returnGBP: number | null;
  returnPct: number | null;
}

export interface HoldingsComputed {
  positions: PositionValue[];
  totals: {
    costBasisGBP: number;
    currentValueGBP: number;
    returnGBP: number;
    returnPct: number | null;
  };
  fxGbpUsd: number | null;
  asOf: string;
}

export async function getHoldings(): Promise<HoldingsMap> {
  const stored = await kvGet<HoldingsMap>(HOLDINGS_KEY);
  return stored ?? { ...DEFAULT_HOLDINGS };
}

export async function setHoldings(h: HoldingsMap): Promise<void> {
  await kvSet(HOLDINGS_KEY, h);
}

const FMP_BASE = "https://financialmodelingprep.com/api/v3";

interface PriceData {
  prices: Record<string, number>;
  fxGbpUsd: number | null;
}

/** Fetch live per-share prices (USD) and the GBP/USD rate from FMP. */
export async function fetchPricesAndFx(): Promise<PriceData> {
  const key = process.env.FMP_API_KEY ?? "";
  if (!key) return { prices: {}, fxGbpUsd: null };
  const symbols = Object.values(TICKERS).join(",");
  const out: PriceData = { prices: {}, fxGbpUsd: null };
  try {
    const [quoteRes, fxRes] = await Promise.all([
      fetch(`${FMP_BASE}/quote/${symbols}?apikey=${key}`, { next: { revalidate: 60 } }),
      fetch(`${FMP_BASE}/quote/GBPUSD?apikey=${key}`, { next: { revalidate: 300 } }),
    ]);
    if (quoteRes.ok) {
      const data = (await quoteRes.json()) as Array<{ symbol: string; price: number }>;
      for (const q of data) if (typeof q.price === "number") out.prices[q.symbol] = q.price;
    }
    if (fxRes.ok) {
      const fx = (await fxRes.json()) as Array<{ price: number }>;
      if (fx[0]?.price) out.fxGbpUsd = fx[0].price;
    }
  } catch {
    /* graceful — values stay null */
  }
  return out;
}

function spacexFallbackPrice(): number | null {
  const sx = framework.companies.find((c) => c.id === "spacex");
  const rm = (sx?.returnModel ?? {}) as Record<string, unknown>;
  return (rm.pricePerShareUSD as number) ?? null;
}

export function computePositions(
  holdings: HoldingsMap,
  prices: Record<string, number>,
  fxGbpUsd: number | null
): HoldingsComputed {
  const asOf = new Date().toISOString();
  const positions: PositionValue[] = POSITIONS.map((p) => {
    const ticker = TICKERS[p];
    let priceUSD: number | null = prices[ticker] ?? null;
    let priceSource: PositionValue["priceSource"] = priceUSD != null ? "fmp" : "none";
    if (priceUSD == null && p === "spacex") {
      priceUSD = spacexFallbackPrice();
      if (priceUSD != null) priceSource = "framework-fallback";
    }

    const { shares, costBasisGBP } = holdings[p] ?? emptyHolding();
    const currentValueGBP =
      priceUSD != null && fxGbpUsd ? (shares * priceUSD) / fxGbpUsd : null;
    const returnGBP = currentValueGBP != null ? currentValueGBP - costBasisGBP : null;
    const returnPct =
      currentValueGBP != null && costBasisGBP > 0
        ? (currentValueGBP / costBasisGBP - 1) * 100
        : null;

    return {
      position: p,
      name: NAMES[p],
      ticker,
      shares,
      costBasisGBP,
      priceUSD,
      priceSource,
      currentValueGBP,
      returnGBP,
      returnPct,
    };
  });

  const costBasisGBP = positions.reduce((s, p) => s + p.costBasisGBP, 0);
  const currentValueGBP = positions.reduce(
    (s, p) => s + (p.currentValueGBP ?? p.costBasisGBP),
    0
  );
  const returnGBP = currentValueGBP - costBasisGBP;
  const returnPct = costBasisGBP > 0 ? (currentValueGBP / costBasisGBP - 1) * 100 : null;

  return {
    positions,
    totals: { costBasisGBP, currentValueGBP, returnGBP, returnPct },
    fxGbpUsd,
    asOf,
  };
}

/**
 * Current market value per position as GBP balances — the live source of truth
 * for the allocation advisor's "current holdings". Falls back to cost basis
 * when a price is unavailable.
 */
export async function getCurrentBalances(): Promise<PortfolioBalances> {
  const holdings = await getHoldings();
  const { prices, fxGbpUsd } = await fetchPricesAndFx();
  const computed = computePositions(holdings, prices, fxGbpUsd);
  const balances: PortfolioBalances = { tesla: 0, google: 0, spacex: 0, sp500: 0 };
  for (const pos of computed.positions) {
    balances[pos.position] = Math.round(pos.currentValueGBP ?? pos.costBasisGBP);
  }
  return balances;
}
