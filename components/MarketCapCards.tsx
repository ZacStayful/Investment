"use client";

import { useEffect, useState } from "react";
import type { MarketCapCard } from "@/lib/types";
import { formatUSDLarge, formatPct } from "@/lib/format";

export default function MarketCapCards() {
  const [cards, setCards] = useState<MarketCapCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/marketcap")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setCards(data.cards ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load market data");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <p className="text-sm text-status-concern">{error}</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {(cards ?? Array.from({ length: 3 })).map((card, i) => (
        <div
          key={card ? (card as MarketCapCard).ticker : i}
          className="rounded-lg border border-terminal-border bg-terminal-panel p-4"
        >
          {card ? (
            <Card card={card as MarketCapCard} />
          ) : (
            <div className="h-20 animate-pulse rounded bg-terminal-border/40" />
          )}
        </div>
      ))}
    </div>
  );
}

function Card({ card }: { card: MarketCapCard }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold tracking-wider text-terminal-text">
          {card.ticker}
        </span>
        <span className="text-xs text-terminal-muted">{card.name}</span>
      </div>
      <div className="mt-2 text-2xl font-bold text-terminal-text">
        {formatUSDLarge(card.marketCap)}
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-terminal-muted">
        {card.price != null && <span>${card.price.toFixed(2)}</span>}
        <SourceBadge source={card.source} />
      </div>
      {card.nextTarget && (
        <div className="mt-3 border-t border-terminal-border pt-2 text-xs text-terminal-muted">
          <div>
            Next target {card.nextTarget.year}:{" "}
            <span className="text-terminal-text">
              {formatUSDLarge(card.nextTarget.valuationUSD)}
            </span>{" "}
            ({formatPct(card.nextTarget.pctTo, 0)} to go)
          </div>
          {card.impliedCagrPct != null && (
            <div>
              Implied CAGR:{" "}
              <span className="text-status-achieved">
                {formatPct(card.impliedCagrPct)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SourceBadge({ source }: { source: MarketCapCard["source"] }) {
  const label =
    source === "fmp"
      ? "live"
      : source === "framework-fallback"
      ? "framework"
      : "unavailable";
  const color =
    source === "fmp"
      ? "text-status-achieved"
      : source === "framework-fallback"
      ? "text-status-developing"
      : "text-status-concern";
  return <span className={`uppercase tracking-wide ${color}`}>· {label}</span>;
}
