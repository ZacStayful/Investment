import { kvGet, kvSet } from "./kv";
import { framework } from "./framework";
import { fetchQuotes, type FmpSource } from "./fmp";
import type { PortfolioBalances } from "./types";

/**
 * Holdings & live returns. Each position has an editable ticker + currency so
 * the price matches the instrument the user actually holds (e.g. a UK-listed
 * S&P 500 fund like VUAG.L in GBP, not SPY in USD). Current value is derived
 * from the live price converted to GBP; return is value − cost.
 */

export type Currency = "USD" | "GBP" | "GBp";

export interface Holding {
  ticker: string;
  currency: Currency;
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

export const NAMES: Record<Position, string> = {
  tesla: "Tesla",
  google: "Google",
  spacex: "SpaceX",
  sp500: "S&P 500",
};

// Default instrument per position (editable by the user).
const DEFAULT_TICKER: Record<Position, { ticker: string; currency: Currency }> = {
  tesla: { ticker: "TSLA", currency: "USD" },
  google: { ticker: "GOOGL", currency: "USD" },
  spacex: { ticker: "SPCX", currency: "USD" },
  sp500: { ticker: "SPY", currency: "USD" },
};

const CURRENCIES: Currency[] = ["USD", "GBP", "GBp"];

function defaultHolding(p: Position): Holding {
  return { ...DEFAULT_TICKER[p], shares: 0, costBasisGBP: 0 };
}

export function defaultHoldings(): HoldingsMap {
  return {
    tesla: defaultHolding("tesla"),
    google: defaultHolding("google"),
    spacex: defaultHolding("spacex"),
    sp500: defaultHolding("sp500"),
  };
}

/** Read holdings from KV, backfilling ticker/currency defaults for legacy data. */
export async function getHoldings(): Promise<HoldingsMap> {
  const stored = await kvGet<Partial<Record<Position, Partial<Holding>>>>(HOLDINGS_KEY);
  const out = defaultHoldings();
  if (stored) {
    for (const p of POSITIONS) {
      const s = stored[p];
      if (!s) continue;
      out[p] = {
        ticker: typeof s.ticker === "string" && s.ticker.trim() ? s.ticker.trim().toUpperCase() : DEFAULT_TICKER[p].ticker,
        currency: CURRENCIES.includes(s.currency as Currency) ? (s.currency as Currency) : DEFAULT_TICKER[p].currency,
        shares: Number.isFinite(s.shares) && (s.shares as number) >= 0 ? (s.shares as number) : 0,
        costBasisGBP: Number.isFinite(s.costBasisGBP) && (s.costBasisGBP as number) >= 0 ? (s.costBasisGBP as number) : 0,
      };
    }
  }
  return out;
}

export async function setHoldings(h: HoldingsMap): Promise<void> {
  await kvSet(HOLDINGS_KEY, h);
}

export function tickersOf(holdings: HoldingsMap): string[] {
  return Array.from(new Set(POSITIONS.map((p) => holdings[p].ticker).filter(Boolean)));
}

export interface PositionValue {
  position: Position;
  name: string;
  ticker: string;
  currency: Currency;
  shares: number;
  costBasisGBP: number;
  priceNative: number | null; // price in the instrument's own currency
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

interface PriceData {
  prices: Record<string, number>;
  fxGbpUsd: number | null;
  source: FmpSource;
}

/** Fetch live prices for the given tickers (native currency) plus GBP/USD. */
export async function fetchPricesAndFx(tickers: string[]): Promise<PriceData> {
  const key = process.env.FMP_API_KEY ?? "";
  if (!key) return { prices: {}, fxGbpUsd: null, source: "none" };
  const symbols = Array.from(new Set([...tickers, "GBPUSD"]));
  const { quotes, source } = await fetchQuotes(symbols, key);
  const prices: Record<string, number> = {};
  for (const [sym, q] of Object.entries(quotes)) if (q.price != null) prices[sym] = q.price;
  return { prices, fxGbpUsd: prices["GBPUSD"] ?? null, source };
}

function spacexFallbackPrice(): number | null {
  const sx = framework.companies.find((c) => c.id === "spacex");
  const rm = (sx?.returnModel ?? {}) as Record<string, unknown>;
  return (rm.pricePerShareUSD as number) ?? null;
}

/** Convert a native price to GBP per the instrument's currency. */
function toGBP(priceNative: number | null, currency: Currency, fxGbpUsd: number | null): number | null {
  if (priceNative == null) return null;
  if (currency === "GBP") return priceNative;
  if (currency === "GBp") return priceNative / 100; // London pence
  return fxGbpUsd ? priceNative / fxGbpUsd : null; // USD -> GBP
}

export function computePositions(
  holdings: HoldingsMap,
  prices: Record<string, number>,
  fxGbpUsd: number | null
): HoldingsComputed {
  const asOf = new Date().toISOString();
  const positions: PositionValue[] = POSITIONS.map((p) => {
    const h = holdings[p];
    let priceNative: number | null = prices[h.ticker] ?? null;
    let priceSource: PositionValue["priceSource"] = priceNative != null ? "fmp" : "none";
    if (priceNative == null && h.ticker === "SPCX") {
      priceNative = spacexFallbackPrice();
      if (priceNative != null) priceSource = "framework-fallback";
    }

    const priceGBP = toGBP(priceNative, h.currency, fxGbpUsd);
    const currentValueGBP = priceGBP != null ? h.shares * priceGBP : null;
    const returnGBP = currentValueGBP != null ? currentValueGBP - h.costBasisGBP : null;
    const returnPct =
      currentValueGBP != null && h.costBasisGBP > 0
        ? (currentValueGBP / h.costBasisGBP - 1) * 100
        : null;

    return {
      position: p,
      name: NAMES[p],
      ticker: h.ticker,
      currency: h.currency,
      shares: h.shares,
      costBasisGBP: h.costBasisGBP,
      priceNative,
      priceSource,
      currentValueGBP,
      returnGBP,
      returnPct,
    };
  });

  const costBasisGBP = positions.reduce((s, p) => s + p.costBasisGBP, 0);
  const currentValueGBP = positions.reduce((s, p) => s + (p.currentValueGBP ?? p.costBasisGBP), 0);
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
 * Apply a confirmed capital allocation (£ per position) to holdings: cost basis
 * rises by the amount invested, and shares rise by amount ÷ live GBP price.
 * Positions with no live price still record the cost (shares unchanged).
 */
export function applyInvestment(
  holdings: HoldingsMap,
  allocationGBP: Partial<Record<Position, number>>,
  prices: Record<string, number>,
  fxGbpUsd: number | null
): HoldingsMap {
  const next: HoldingsMap = JSON.parse(JSON.stringify(holdings));
  for (const p of POSITIONS) {
    const gbp = allocationGBP[p] ?? 0;
    if (gbp <= 0) continue;
    next[p].costBasisGBP += gbp;
    let priceNative: number | null = prices[next[p].ticker] ?? null;
    if (priceNative == null && next[p].ticker === "SPCX") priceNative = spacexFallbackPrice();
    const priceGBP = toGBP(priceNative, next[p].currency, fxGbpUsd);
    if (priceGBP != null && priceGBP > 0) next[p].shares += gbp / priceGBP;
  }
  return next;
}

/** Current market value per position as GBP balances — the live source of truth
 * for the allocation advisor. Falls back to cost basis when a price is missing. */
export async function getCurrentBalances(): Promise<PortfolioBalances> {
  const holdings = await getHoldings();
  const { prices, fxGbpUsd } = await fetchPricesAndFx(tickersOf(holdings));
  const computed = computePositions(holdings, prices, fxGbpUsd);
  const balances: PortfolioBalances = { tesla: 0, google: 0, spacex: 0, sp500: 0 };
  for (const pos of computed.positions) {
    balances[pos.position] = Math.round(pos.currentValueGBP ?? pos.costBasisGBP);
  }
  return balances;
}

export { CURRENCIES };
