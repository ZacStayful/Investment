import { NextResponse } from "next/server";
import {
  getHoldings,
  setHoldings,
  computePositions,
  fetchPricesAndFx,
  defaultHoldings,
  tickersOf,
  POSITIONS,
  CURRENCIES,
  type HoldingsMap,
  type Currency,
} from "@/lib/holdings";

export const dynamic = "force-dynamic";

function sanitize(input: unknown): HoldingsMap {
  const out = defaultHoldings();
  if (!input || typeof input !== "object") return out;
  const b = input as Record<string, Record<string, unknown>>;
  for (const p of POSITIONS) {
    const s = b[p] ?? {};
    const shares = Number(s.shares);
    const cost = Number(s.costBasisGBP);
    const ticker = typeof s.ticker === "string" && s.ticker.trim() ? s.ticker.trim().toUpperCase() : out[p].ticker;
    const currency = CURRENCIES.includes(s.currency as Currency) ? (s.currency as Currency) : out[p].currency;
    out[p] = {
      ticker,
      currency,
      shares: Number.isFinite(shares) && shares >= 0 ? shares : 0,
      costBasisGBP: Number.isFinite(cost) && cost >= 0 ? cost : 0,
    };
  }
  return out;
}

async function build(holdings: HoldingsMap) {
  const { prices, fxGbpUsd, source } = await fetchPricesAndFx(tickersOf(holdings));
  const computed = computePositions(holdings, prices, fxGbpUsd);
  return {
    holdings,
    ...computed,
    priceApi: source,
    keyConfigured: Boolean(process.env.FMP_API_KEY),
  };
}

export async function GET() {
  return NextResponse.json(await build(await getHoldings()));
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
