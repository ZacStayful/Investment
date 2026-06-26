import { kvGet, kvSet } from "./kv";
import type { PortfolioBalances } from "./types";

/**
 * Holdings & returns — simple value model. Per position the user enters two
 * numbers they read straight off their broker: amount invested (£) and current
 * value (£). Return = value − invested. No shares, tickers, currencies or FX to
 * drift. A confirmed allocation adds the £ to both invested and value (you just
 * bought it at market). Current value drives the allocator's weights.
 */

export interface Holding {
  investedGBP: number;
  valueGBP: number;
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

export function defaultHoldings(): HoldingsMap {
  return {
    tesla: { investedGBP: 0, valueGBP: 0 },
    google: { investedGBP: 0, valueGBP: 0 },
    spacex: { investedGBP: 0, valueGBP: 0 },
    sp500: { investedGBP: 0, valueGBP: 0 },
  };
}

const num = (v: unknown): number | null => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null);

/**
 * Read holdings from KV. Migrates legacy shapes: the old model stored
 * { costBasisGBP, shares, ticker, currency } — we carry costBasisGBP forward as
 * investedGBP and default valueGBP to it (0% until the user enters real value).
 */
export async function getHoldings(): Promise<HoldingsMap> {
  const stored = await kvGet<Record<string, Record<string, unknown>>>(HOLDINGS_KEY);
  const out = defaultHoldings();
  if (stored) {
    for (const p of POSITIONS) {
      const s = stored[p];
      if (!s) continue;
      const invested = num(s.investedGBP) ?? num(s.costBasisGBP) ?? 0;
      const value = num(s.valueGBP) ?? invested;
      out[p] = { investedGBP: invested, valueGBP: value };
    }
  }
  return out;
}

export async function setHoldings(h: HoldingsMap): Promise<void> {
  await kvSet(HOLDINGS_KEY, h);
}

export interface PositionValue {
  position: Position;
  name: string;
  investedGBP: number;
  valueGBP: number;
  returnGBP: number;
  returnPct: number | null;
}

export interface HoldingsComputed {
  positions: PositionValue[];
  totals: { investedGBP: number; valueGBP: number; returnGBP: number; returnPct: number | null };
  asOf: string;
}

export function computePositions(holdings: HoldingsMap): HoldingsComputed {
  const positions: PositionValue[] = POSITIONS.map((p) => {
    const { investedGBP, valueGBP } = holdings[p];
    const returnGBP = valueGBP - investedGBP;
    const returnPct = investedGBP > 0 ? (valueGBP / investedGBP - 1) * 100 : null;
    return { position: p, name: NAMES[p], investedGBP, valueGBP, returnGBP, returnPct };
  });
  const investedGBP = positions.reduce((s, p) => s + p.investedGBP, 0);
  const valueGBP = positions.reduce((s, p) => s + p.valueGBP, 0);
  const returnGBP = valueGBP - investedGBP;
  const returnPct = investedGBP > 0 ? (valueGBP / investedGBP - 1) * 100 : null;
  return { positions, totals: { investedGBP, valueGBP, returnGBP, returnPct }, asOf: new Date().toISOString() };
}

/**
 * Apply a confirmed capital allocation (£ per position): both invested and
 * current value rise by the amount put in (you just bought it at market).
 */
export function applyInvestment(
  holdings: HoldingsMap,
  allocationGBP: Partial<Record<Position, number>>
): HoldingsMap {
  const next: HoldingsMap = JSON.parse(JSON.stringify(holdings));
  for (const p of POSITIONS) {
    const gbp = allocationGBP[p] ?? 0;
    if (gbp <= 0) continue;
    next[p].investedGBP += gbp;
    next[p].valueGBP += gbp;
  }
  return next;
}

/** Current market value per position (£) — drives the allocator's weights.
 * Falls back to invested when value is unset. */
export async function getCurrentBalances(): Promise<PortfolioBalances> {
  const holdings = await getHoldings();
  const balances: PortfolioBalances = { tesla: 0, google: 0, spacex: 0, sp500: 0 };
  for (const p of POSITIONS) {
    const h = holdings[p];
    balances[p] = Math.round(h.valueGBP > 0 ? h.valueGBP : h.investedGBP);
  }
  return balances;
}
