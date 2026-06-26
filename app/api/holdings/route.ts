import { NextResponse } from "next/server";
import {
  getHoldings,
  setHoldings,
  computePositions,
  defaultHoldings,
  POSITIONS,
  type HoldingsMap,
} from "@/lib/holdings";

export const dynamic = "force-dynamic";

function sanitize(input: unknown): HoldingsMap {
  const out = defaultHoldings();
  if (!input || typeof input !== "object") return out;
  const b = input as Record<string, Record<string, unknown>>;
  for (const p of POSITIONS) {
    const s = b[p] ?? {};
    const invested = Number(s.investedGBP);
    const value = Number(s.valueGBP);
    out[p] = {
      investedGBP: Number.isFinite(invested) && invested >= 0 ? invested : 0,
      valueGBP: Number.isFinite(value) && value >= 0 ? value : 0,
    };
  }
  return out;
}

function build(holdings: HoldingsMap) {
  return { holdings, ...computePositions(holdings) };
}

export async function GET() {
  return NextResponse.json(build(await getHoldings()));
}

export async function POST(req: Request) {
  let body: { holdings?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const holdings = sanitize(body.holdings);
  await setHoldings(holdings);
  return NextResponse.json(build(holdings));
}
