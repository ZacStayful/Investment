import { framework } from "./framework";
import type { Signal, SignalStatus, CompanyOutlook, BlendedOutlook } from "./types";

/**
 * Dynamic return & likelihood model.
 *
 * This is a TRANSPARENT HEURISTIC, not a forecast. It converts the live signal
 * board into two derived numbers per position:
 *   - adjustedPct: the expected annual return, interpolated inside the
 *     company's own return band (conservative floor -> headline CAGR) based on
 *     how its signals are trending.
 *   - likelihoodPct: a probability-of-achieving score for that return.
 *
 * As signals move (the daily monitor or a manual click), both numbers update.
 * ACHIEVED/DEVELOPING signals raise confidence and push the return toward the
 * top of the band; CONCERN pulls it toward the conservative floor. Tier 3
 * signals (definitive re-rating triggers) are weighted far more heavily than
 * Tier 1 monitoring items.
 */

const TIER_WEIGHT: Record<number, number> = { 1: 1, 2: 2, 3: 4 };
const STATUS_SCORE: Record<SignalStatus, number> = {
  ACHIEVED: 1,
  DEVELOPING: 0.5,
  WATCHING: 0,
  CONCERN: -1,
};

// Forward-looking TARGET weights (the framework's intended allocation, not the
// current overweight). SpaceX is deferred (0). Surfaced in the UI for honesty.
export const TARGET_WEIGHTS: Record<string, number> = {
  tesla: 0.4,
  google: 0.35,
  sp500: 0.25,
  spacex: 0,
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function companyBand(companyId: string): { floor: number | null; high: number | null } {
  const c = framework.companies.find((x) => x.id === companyId);
  if (!c) return { floor: null, high: null };
  const rm = c.returnModel as Record<string, unknown>;

  if (companyId === "sp500") {
    const r = (rm.longRunAssumptionPct as number) ?? 10;
    return { floor: r, high: r };
  }

  // SpaceX entry is still deferred, but a return band is surfaced for
  // tracking/outlook (assumption, editable in framework.json).
  const floor = (rm.conservativeFloorPct as number) ?? null;
  const cagr = (rm.cagrToPct as Record<string, number>) ?? {};
  const high = Object.values(cagr).length ? Math.max(...Object.values(cagr)) : floor;
  return { floor, high };
}

export function computeCompanyOutlook(companyId: string, signals: Signal[]): CompanyOutlook {
  const company = framework.companies.find((c) => c.id === companyId);
  const name = company?.name ?? companyId;
  const deferred = companyId === "spacex";

  // Signals attributed to this company. The merger signals inform Tesla.
  const relevant = signals.filter(
    (s) => s.company === companyId || (companyId === "tesla" && s.company === "merger")
  );

  let weightedScore = 0;
  let weightSum = 0;
  const positiveDrivers: string[] = [];
  const negativeDrivers: string[] = [];

  for (const s of relevant) {
    const w = TIER_WEIGHT[s.tier] ?? 1;
    weightedScore += STATUS_SCORE[s.status] * w;
    weightSum += w;
    if (s.status === "ACHIEVED" || s.status === "DEVELOPING") positiveDrivers.push(s.name);
    if (s.status === "CONCERN") negativeDrivers.push(s.name);
  }

  // Confidence normalised to [-1, 1]. All-WATCHING => 0 (neutral).
  const confidence = weightSum > 0 ? clamp(weightedScore / weightSum, -1, 1) : 0;

  const { floor, high } = companyBand(companyId);
  let basePct: number | null = null;
  let adjustedPct: number | null = null;
  if (floor != null && high != null) {
    basePct = floor + (high - floor) * 0.5;
    const t = clamp((confidence + 1) / 2, 0, 1); // 0 at full-concern, 1 at full-achieved
    adjustedPct = floor + (high - floor) * t;
  }

  // Likelihood of achieving the (adjusted) return. Index floor is treated as
  // high-confidence; everything else flexes around a neutral ~55% baseline.
  let likelihoodPct: number;
  if (companyId === "sp500") {
    likelihoodPct = 85;
  } else if (deferred) {
    likelihoodPct = clamp(45 + confidence * 35, 5, 95); // entry-criteria confidence
  } else {
    likelihoodPct = clamp(55 + confidence * 35, 8, 95);
  }

  return {
    companyId,
    name,
    deferred,
    floorPct: floor,
    highPct: high,
    basePct,
    adjustedPct,
    likelihoodPct: Math.round(likelihoodPct),
    confidence: Number(confidence.toFixed(2)),
    signalsConsidered: relevant.length,
    positiveDrivers: positiveDrivers.slice(0, 4),
    negativeDrivers: negativeDrivers.slice(0, 4),
  };
}

export function computeBlendedOutlook(signals: Signal[]): BlendedOutlook {
  const ids = ["tesla", "google", "sp500", "spacex"];
  const companies = ids.map((id) => computeCompanyOutlook(id, signals));

  let weightedReturn = 0;
  let weightedLikelihood = 0;
  let activeWeight = 0;

  for (const o of companies) {
    const w = TARGET_WEIGHTS[o.companyId] ?? 0;
    if (w === 0 || o.adjustedPct == null) continue;
    weightedReturn += o.adjustedPct * w;
    weightedLikelihood += o.likelihoodPct * w;
    activeWeight += w;
  }

  const blendedReturnPct = activeWeight > 0 ? weightedReturn / activeWeight : 0;
  const blendedLikelihoodPct = activeWeight > 0 ? weightedLikelihood / activeWeight : 0;

  return {
    weights: TARGET_WEIGHTS,
    blendedReturnPct: Number(blendedReturnPct.toFixed(1)),
    blendedLikelihoodPct: Math.round(blendedLikelihoodPct),
    companies,
  };
}
