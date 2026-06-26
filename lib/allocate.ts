import { framework } from "./framework";
import { computeCompanyOutlook, computeBlendedOutlook } from "./outlook";
import { kvGet, kvSet } from "./kv";
import type {
  Signal,
  RiskTolerance,
  PortfolioBalances,
  PortfolioSnapshot,
  AllocationLine,
  AllocationResult,
} from "./types";

/**
 * Capital allocation advisor — three-layer engine.
 *
 * This EXECUTES the user's own pre-decided framework rules consistently and
 * flags when real-world signals should adjust them. It is NOT advice; the human
 * decides. It never recommends selling (rebalancing is via new contributions
 * only).
 */

export const BALANCES_KEY = "portfolio:balances";

const rules = framework.portfolioRules as {
  sp500FloorPct: number;
  teslaOverweightThresholdPct: number;
  googleTargetPct: number;
};
const SP500_FLOOR = rules.sp500FloorPct / 100; // 0.25
const TESLA_OVERWEIGHT = rules.teslaOverweightThresholdPct / 100; // 0.35
const GOOGLE_TARGET = rules.googleTargetPct / 100; // 0.35

// Layer 2 risk model. baseVol ≈ relative 90-day price volatility; valuationRisk
// ≈ distance above fair value. executionRisk is derived live from signals.
const BASE_VOL: Record<string, number> = { tesla: 0.65, google: 0.3, spacex: 0.85, sp500: 0.15 };
const VAL_RISK: Record<string, number> = { tesla: 0.6, google: 0.3, spacex: 0.8, sp500: 0.1 };

// How hard the volatility tolerance lets Layer 2 modify Layer 1's return split.
const RISK_PENALTY: Record<RiskTolerance, number> = {
  Conservative: 0.6,
  Moderate: 0.3,
  Aggressive: 0.05,
};

const POSITIONS = ["tesla", "google", "spacex", "sp500"] as const;
const NAMES: Record<string, string> = {
  tesla: "Tesla",
  google: "Google",
  spacex: "SpaceX",
  sp500: "S&P 500",
};

export const DEFAULT_BALANCES: PortfolioBalances = {
  tesla: 9250,
  google: 2000,
  spacex: 0,
  sp500: 1250,
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export async function getBalances(): Promise<PortfolioBalances> {
  return (await kvGet<PortfolioBalances>(BALANCES_KEY)) ?? { ...DEFAULT_BALANCES };
}

export async function setBalances(b: PortfolioBalances): Promise<void> {
  await kvSet(BALANCES_KEY, b);
}

function snapshot(balances: PortfolioBalances): PortfolioSnapshot {
  const total = POSITIONS.reduce((s, p) => s + (balances[p] || 0), 0);
  const weights: Record<string, number> = {};
  for (const p of POSITIONS) weights[p] = total > 0 ? (balances[p] || 0) / total : 0;
  return {
    balances,
    total,
    weights,
    teslaSpacexCombinedPct: Number(((weights.tesla + weights.spacex) * 100).toFixed(1)),
  };
}

function riskScore(position: string, execRisk: number): number {
  return 0.4 * (BASE_VOL[position] ?? 0.4) + 0.3 * (VAL_RISK[position] ?? 0.4) + 0.3 * execRisk;
}

export function computeAllocation(
  amount: number,
  tolerance: RiskTolerance,
  balances: PortfolioBalances,
  signals: Signal[]
): AllocationResult {
  const current = snapshot(balances);
  const newTotal = current.total + amount;
  const layer1: string[] = [];
  const layer2: string[] = [];
  const layer3: string[] = [];
  const alerts: string[] = [];

  const alloc: Record<string, number> = { tesla: 0, google: 0, spacex: 0, sp500: 0 };
  const reasons: Record<string, string[]> = { tesla: [], google: [], spacex: [], sp500: [] };

  // Live per-position outlook (drives execution risk + return scores).
  const outlook = Object.fromEntries(
    POSITIONS.map((p) => [p, computeCompanyOutlook(p, signals)])
  );

  // ---- LAYER 1 — framework hard constraints --------------------------------
  let remaining = amount;

  // S&P 500 floor funded first if below 25% of the post-investment total.
  const sp500Need = Math.max(0, SP500_FLOOR * newTotal - balances.sp500);
  if (sp500Need > 0) {
    const floorAlloc = Math.min(remaining, sp500Need);
    alloc.sp500 += floorAlloc;
    remaining -= floorAlloc;
    layer1.push(
      `S&P 500 at ${(current.weights.sp500 * 100).toFixed(0)}% is below the 25% floor — £${Math.round(
        floorAlloc
      ).toLocaleString()} funded first to restore it.`
    );
    reasons.sp500.push("restores 25% index floor (funded first)");
    alerts.push("S&P 500 was below its 25% floor — floor restored before any other allocation.");
  } else {
    layer1.push(`S&P 500 at ${(current.weights.sp500 * 100).toFixed(0)}% is at/above its 25% floor.`);
  }

  const teslaOverweight = current.weights.tesla > TESLA_OVERWEIGHT;
  const eligible: string[] = ["google", "sp500"];
  if (teslaOverweight) {
    layer1.push(
      `Tesla at ${(current.weights.tesla * 100).toFixed(0)}% is overweight (>35%) — receives £0 new capital (never sell to rebalance; rebalance via contributions only).`
    );
    reasons.tesla.push("overweight >35% → £0 (no-sell rule)");
    alerts.push(
      `Tesla overweight at ${(current.weights.tesla * 100).toFixed(0)}% — no new capital; rebalancing happens only by directing contributions elsewhere.`
    );
  } else {
    eligible.push("tesla");
    layer1.push(`Tesla at ${(current.weights.tesla * 100).toFixed(0)}% is within target — eligible.`);
  }

  // SpaceX deferred — dry powder.
  layer1.push("SpaceX entry criteria unmet — excluded from new capital (held as dry powder).");
  reasons.spacex.push("entry deferred (criteria unmet) → dry powder");

  if (current.weights.google < GOOGLE_TARGET) {
    layer1.push(
      `Google at ${(current.weights.google * 100).toFixed(0)}% is underweight vs its 35% target — prioritised.`
    );
  }

  // ---- LAYER 3 — return optimisation (base split of remaining) --------------
  // Probability-weighted expected return per eligible position, with a Google
  // boost while underweight.
  const returnScore: Record<string, number> = {};
  for (const p of eligible) {
    const o = outlook[p];
    const base = Math.max(0, (o.adjustedPct ?? 0) / 100) * (o.likelihoodPct / 100);
    const googleBoost =
      p === "google" && current.weights.google < GOOGLE_TARGET
        ? 1 + (GOOGLE_TARGET - current.weights.google)
        : 1;
    returnScore[p] = Math.max(base * googleBoost, 0.0001);
  }
  const rsSum = eligible.reduce((s, p) => s + returnScore[p], 0);
  const baseWeight: Record<string, number> = {};
  for (const p of eligible) baseWeight[p] = returnScore[p] / rsSum;
  layer3.push(
    "Remaining capital split by probability-weighted expected return: " +
      eligible
        .map(
          (p) =>
            `${NAMES[p]} ${(outlook[p].adjustedPct ?? 0).toFixed(1)}% × ${outlook[p].likelihoodPct}% likely`
        )
        .join(" · ") +
      "."
  );

  // ---- LAYER 2 — volatility adjustment -------------------------------------
  const penalty = RISK_PENALTY[tolerance];
  const tilt: Record<string, number> = {};
  for (const p of eligible) {
    const o = outlook[p];
    const execRisk = 1 - (o.confidence + 1) / 2; // 0 (all achieved) .. 1 (all concern)
    const risk = riskScore(p, execRisk);
    let t = baseWeight[p] * (1 - risk * penalty);
    if (tolerance === "Aggressive") t *= 1 + Math.max(0, (o.adjustedPct ?? 0) / 100) * 0.3;
    tilt[p] = Math.max(t, 0.0001);
  }
  const tiltSum = eligible.reduce((s, p) => s + tilt[p], 0);
  for (const p of eligible) tilt[p] = tilt[p] / tiltSum;
  layer2.push(
    `Volatility tolerance "${tolerance}" applied (risk weight ${penalty}). ` +
      eligible
        .map((p) => `${NAMES[p]} → ${(tilt[p] * 100).toFixed(0)}%`)
        .join(" · ") +
      "."
  );

  // Tesla+SpaceX correlation: single combined-exposure metric.
  if (current.teslaSpacexCombinedPct > 50) {
    alerts.push(
      `Combined Tesla+SpaceX exposure is ${current.teslaSpacexCombinedPct}% — treated as a single correlated exposure (shared key-person risk).`
    );
  }

  // Distribute the remaining capital by the tilted weights.
  for (const p of eligible) {
    const add = remaining * tilt[p];
    alloc[p] += add;
    if (add > 0) {
      reasons[p].push(
        `${(tilt[p] * 100).toFixed(0)}% of discretionary capital (return ${(outlook[p].adjustedPct ?? 0).toFixed(1)}%, ${outlook[p].likelihoodPct}% likely)`
      );
    }
  }

  // Signal-driven override note.
  const teslaConcern = signals.filter((s) => s.company === "tesla" && s.status === "CONCERN").length;
  if (teslaConcern > 0) {
    layer3.push(
      `${teslaConcern} Tesla signal(s) at CONCERN → confidence reduced; discretionary capital leans toward Google / S&P 500.`
    );
    alerts.push(`${teslaConcern} Tesla signal(s) at CONCERN — confidence-weighted away from Tesla.`);
  }

  // ---- Round to whole pounds, fixing drift on the largest line -------------
  const rounded: Record<string, number> = {};
  for (const p of POSITIONS) rounded[p] = Math.round(alloc[p]);
  const drift = amount - POSITIONS.reduce((s, p) => s + rounded[p], 0);
  if (drift !== 0) {
    const largest = POSITIONS.reduce((a, b) => (rounded[b] > rounded[a] ? b : a));
    rounded[largest] += drift;
  }

  const recommendation: AllocationLine[] = POSITIONS.map((p) => ({
    position: p,
    name: NAMES[p],
    gbp: rounded[p],
    pctOfNew: amount > 0 ? Number(((rounded[p] / amount) * 100).toFixed(1)) : 0,
    reasons: reasons[p],
  })).filter((l) => l.gbp > 0 || l.reasons.length > 0);

  const postBalances: PortfolioBalances = {
    tesla: balances.tesla + rounded.tesla,
    google: balances.google + rounded.google,
    spacex: balances.spacex + rounded.spacex,
    sp500: balances.sp500 + rounded.sp500,
  };
  const post = snapshot(postBalances);

  const blended = computeBlendedOutlook(signals);

  return {
    input: { amount, tolerance },
    current,
    recommendation,
    postInvestment: post,
    projections: {
      blendedReturnPct: blended.blendedReturnPct,
      blendedLikelihoodPct: blended.blendedLikelihoodPct,
    },
    layers: { layer1, layer2, layer3 },
    alerts,
    disclaimer:
      "This executes your pre-decided framework rules consistently and flags when signals should adjust them. It is not financial advice and never recommends selling — you decide.",
  };
}

export { clamp };
