import { NextResponse } from "next/server";
import { computeAllocation } from "@/lib/allocate";
import { getCurrentBalances } from "@/lib/holdings";
import { applyStatuses } from "@/lib/framework";
import { getSignalStatuses } from "@/lib/kv";
import type { RiskTolerance } from "@/lib/types";

export const dynamic = "force-dynamic";

const TOLERANCES: RiskTolerance[] = ["Conservative", "Moderate", "Aggressive"];

export async function GET() {
  // Current holdings valued live (from the Holdings panel) are the source of
  // truth for the allocator's starting balances.
  const balances = await getCurrentBalances();
  return NextResponse.json({ balances });
}

export async function POST(req: Request) {
  let body: { amount?: number; tolerance?: string };
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

  const balances = await getCurrentBalances();
  const signals = applyStatuses(await getSignalStatuses());
  const result = computeAllocation(amount, tolerance, balances, signals);
  return NextResponse.json(result);
}
