import { NextResponse } from "next/server";
import { getBalances, setBalances, computeAllocation, DEFAULT_BALANCES } from "@/lib/allocate";
import { applyStatuses } from "@/lib/framework";
import { getSignalStatuses } from "@/lib/kv";
import type { PortfolioBalances, RiskTolerance } from "@/lib/types";

export const dynamic = "force-dynamic";

const TOLERANCES: RiskTolerance[] = ["Conservative", "Moderate", "Aggressive"];

function sanitizeBalances(input: unknown): PortfolioBalances | null {
  if (!input || typeof input !== "object") return null;
  const b = input as Record<string, unknown>;
  const out: PortfolioBalances = { ...DEFAULT_BALANCES };
  for (const key of ["tesla", "google", "spacex", "sp500"] as const) {
    const v = Number(b[key]);
    out[key] = Number.isFinite(v) && v >= 0 ? v : 0;
  }
  return out;
}

export async function GET() {
  const balances = await getBalances();
  return NextResponse.json({ balances });
}

export async function POST(req: Request) {
  let body: { amount?: number; tolerance?: string; balances?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }

  const tolerance = (body.tolerance ?? "Moderate") as RiskTolerance;
  if (!TOLERANCES.includes(tolerance)) {
    return NextResponse.json(
      { error: "tolerance must be one of: " + TOLERANCES.join(", ") },
      { status: 400 }
    );
  }

  // Persist balances if the client sent updated holdings.
  let balances = await getBalances();
  const provided = sanitizeBalances(body.balances);
  if (provided) {
    balances = provided;
    await setBalances(balances);
  }

  const signals = applyStatuses(await getSignalStatuses());
  const result = computeAllocation(amount, tolerance, balances, signals);
  return NextResponse.json(result);
}
