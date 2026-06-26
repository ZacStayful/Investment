import { NextResponse } from "next/server";
import { framework } from "@/lib/framework";
import type { MarketCapCard } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FMP_BASE = "https://financialmodelingprep.com/api/v3";

// Companies to surface as live cards. SpaceX ticker is unconfirmed at the data
// layer (recently IPO'd June 2026) — we attempt the live quote but fall back to
// the framework IPO valuation if FMP returns nothing.
const CARD_COMPANIES = ["tesla", "google", "spacex"];

interface FmpQuote {
  symbol: string;
  price: number;
  marketCap: number;
}

function nextTarget(companyId: string, marketCapUSD: number | null) {
  const company = framework.companies.find((c) => c.id === companyId);
  const targets = (company?.returnModel?.targets ?? {}) as Record<string, number | string>;
  const numericTargets = Object.entries(targets)
    .filter(([, v]) => typeof v === "number")
    .map(([year, v]) => ({ year, valuationUSD: v as number }))
    .sort((a, b) => a.valuationUSD - b.valuationUSD);

  if (marketCapUSD == null) return null;
  const next = numericTargets.find((t) => t.valuationUSD > marketCapUSD) ?? numericTargets[numericTargets.length - 1];
  if (!next) return null;
  return {
    year: next.year,
    valuationUSD: next.valuationUSD,
    pctTo: ((next.valuationUSD - marketCapUSD) / marketCapUSD) * 100,
  };
}

function impliedCagr(marketCapUSD: number | null, target: { year: string; valuationUSD: number } | null) {
  if (marketCapUSD == null || !target) return null;
  const years = Number(target.year) - new Date().getFullYear();
  if (years <= 0) return null;
  return (Math.pow(target.valuationUSD / marketCapUSD, 1 / years) - 1) * 100;
}

async function fetchQuotes(symbols: string[], apiKey: string): Promise<Record<string, FmpQuote>> {
  if (!apiKey || symbols.length === 0) return {};
  try {
    const url = `${FMP_BASE}/quote/${symbols.join(",")}?apikey=${apiKey}`;
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return {};
    const data = (await res.json()) as FmpQuote[];
    const map: Record<string, FmpQuote> = {};
    for (const q of data) map[q.symbol] = q;
    return map;
  } catch {
    return {};
  }
}

export async function GET() {
  const apiKey = process.env.FMP_API_KEY ?? "";
  const asOf = new Date().toISOString();

  const companies = CARD_COMPANIES.map((id) => framework.companies.find((c) => c.id === id)).filter(
    Boolean
  ) as (typeof framework.companies)[number][];

  const symbols = companies.map((c) => c.ticker);
  const quotes = await fetchQuotes(symbols, apiKey);

  const cards: MarketCapCard[] = companies.map((c) => {
    const quote = quotes[c.ticker];
    let marketCap: number | null = quote?.marketCap ?? null;
    let price: number | null = quote?.price ?? null;
    let source: MarketCapCard["source"] = quote ? "fmp" : "unavailable";

    // Framework fallback (esp. SpaceX, thinly traded / indexed).
    if (marketCap == null) {
      const fallback = (c.returnModel?.currentValuationUSD as number) ?? null;
      if (fallback != null) {
        marketCap = fallback;
        source = "framework-fallback";
      }
    }

    const target = nextTarget(c.id, marketCap);
    return {
      ticker: c.ticker,
      companyId: c.id,
      name: c.name,
      price,
      marketCap,
      currency: "USD",
      source,
      nextTarget: target,
      impliedCagrPct: impliedCagr(marketCap, target),
      asOf,
    };
  });

  return NextResponse.json({
    cards,
    keyConfigured: Boolean(apiKey),
    asOf,
  });
}
