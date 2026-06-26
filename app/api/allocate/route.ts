import { NextResponse } from "next/server";
import { computeAllocation } from "@/lib/allocate";
import {
  getCurrentBalances,
  getHoldings,
  setHoldings,
  applyInvestment,
  fetchPricesAndFx,
} from "@/lib/holdings";
import { applyStatuses } from "@/lib/framework";
import { getSignalStatuses, kvGet, kvSet } from "@/lib/kv";
import type { RiskTolerance, AllocationResult } from "@/lib/types";

export const dynamic = "force-dynamic";

const TOLERANCES: RiskTolerance[] = ["Conservative", "Moderate", "Aggressive"];
const CONTRIB_KEY = "portfolio:contributions";

interface Contribution {
  at: string;
  amount: number;
  tolerance: RiskTolerance;
  split: { position: string; gbp: number }[];
}

function validate(body: { amount?: number; tolerance?: string }):
  | { ok: true; amount: number; tolerance: RiskTolerance }
  | { ok: false; error: string } {
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "amount must be a positive number" };
  const tolerance = (body.tolerance ?? "Moderate") as RiskTolerance;
  if (!TOLERANCES.includes(tolerance))
    return { ok: false, error: "tolerance must be one of: " + TOLERANCES.join(", ") };
  return { ok: true, amount, tolerance };
}

async function compute(amount: number, tolerance: RiskTolerance): Promise<AllocationResult> {
  const balances = await getCurrentBalances();
  const signals = applyStatuses(await getSignalStatuses());
  return computeAllocation(amount, tolerance, balances, signals);
}

export async function GET() {
  const [balances, contributions] = await Promise.all([
    getCurrentBalances(),
    kvGet<Contribution[]>(CONTRIB_KEY),
  ]);
  return NextResponse.json({ balances, contributions: contributions ?? [] });
}

export async function POST(req: Request) {
  let body: { action?: string; amount?: number; tolerance?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const v = validate(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  // Confirm: apply the recomputed allocation to holdings and log it.
  if (body.action === "confirm") {
    const result = await compute(v.amount, v.tolerance);
    const allocationGBP = Object.fromEntries(
      result.recommendation.map((l) => [l.position, l.gbp])
    ) as Record<string, number>;

    const { prices, fxGbpUsd } = await fetchPricesAndFx();
    const holdings = await getHoldings();
    const updated = applyInvestment(holdings, allocationGBP, prices, fxGbpUsd);
    await setHoldings(updated);

    const contribution: Contribution = {
      at: new Date().toISOString(),
      amount: v.amount,
      tolerance: v.tolerance,
      split: result.recommendation.filter((l) => l.gbp > 0).map((l) => ({ position: l.name, gbp: l.gbp })),
    };
    const existing = (await kvGet<Contribution[]>(CONTRIB_KEY)) ?? [];
    await kvSet(CONTRIB_KEY, [contribution, ...existing].slice(0, 100));

    const balances = await getCurrentBalances();
    return NextResponse.json({ ok: true, holdings: updated, balances, contribution });
  }

  // Default: compute and return the recommendation.
  const result = await compute(v.amount, v.tolerance);
  return NextResponse.json(result);
}
