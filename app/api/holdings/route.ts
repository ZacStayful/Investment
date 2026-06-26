import { NextResponse } from "next/server";
import {
  getHoldings,
  setHoldings,
  computePositions,
  fetchPricesAndFx,
  DEFAULT_HOLDINGS,
  POSITIONS,
  type HoldingsMap,
} from "@/lib/holdings";

export const dynamic = "force-dynamic";

function sanitize(input: unknown): HoldingsMap {
  const out: HoldingsMap = JSON.parse(JSON.stringify(DEFAULT_HOLDINGS));
  if (!input || typeof input !== "object") return out;
  const b = input as Record<string, { shares?: unknown; costBasisGBP?: unknown }>;
  for (const p of POSITIONS) {
    const shares = Number(b[p]?.shares);
    const cost = Number(b[p]?.costBasisGBP);
    out[p] = {
      shares: Number.isFinite(shares) && shares >= 0 ? shares : 0,
      costBasisGBP: Number.isFinite(cost) && cost >= 0 ? cost : 0,
    };
  }
  return out;
}

async function build(holdings: HoldingsMap) {
  const { prices, fxGbpUsd } = await fetchPricesAndFx();
  const computed = computePositions(holdings, prices, fxGbpUsd);
  return { holdings, ...computed, keyConfigured: Boolean(process.env.FMP_API_KEY) };
}

export async function GET() {
  const holdings = await getHoldings();
  return NextResponse.json(await build(holdings));
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
  return NextResponse.json(await build(holdings));
}
