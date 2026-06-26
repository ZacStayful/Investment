"use client";

import { useEffect, useState } from "react";
import { governingPrinciples } from "@/lib/framework";
import { formatGBP } from "@/lib/format";
import { onHoldingsChanged } from "@/lib/clientEvents";
import type { PortfolioBalances } from "@/lib/types";

/**
 * Principle 4 — the concentrated positions carry the dream; the floor carries
 * the future. Surfaces whether the conviction bets (Tesla+Google+SpaceX) have
 * grown to a size where being wrong would be DAMAGING rather than disappointing.
 */
export default function ConvictionMeter() {
  const [balances, setBalances] = useState<PortfolioBalances | null>(null);
  const gp = governingPrinciples();
  const threshold = gp?.concentrationDamagingThresholdPct ?? 75;

  useEffect(() => {
    function load() {
      fetch("/api/allocate")
        .then((r) => r.json())
        .then((d) => setBalances(d.balances))
        .catch(() => setBalances(null));
    }
    load();
    return onHoldingsChanged(load);
  }, []);

  if (!balances) {
    return (
      <div className="rounded-lg border border-terminal-border bg-terminal-panel p-4">
        <div className="h-16 animate-pulse rounded bg-terminal-border/40" />
      </div>
    );
  }

  const concentrated = balances.tesla + balances.google + balances.spacex;
  const floor = balances.sp500;
  const total = concentrated + floor;
  const concentratedPct = total > 0 ? (concentrated / total) * 100 : 0;
  const floorPct = total > 0 ? (floor / total) * 100 : 0;
  const damaging = concentratedPct > threshold;

  return (
    <div className="rounded-lg border border-terminal-border bg-terminal-panel p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-terminal-muted">
          Conviction vs floor
        </h3>
        <span className="text-[11px] text-terminal-muted">
          damaging threshold {threshold}%
        </span>
      </div>

      <div className="flex h-3 overflow-hidden rounded-full bg-terminal-border">
        <div
          className={damaging ? "bg-status-concern" : "bg-status-developing"}
          style={{ width: `${concentratedPct}%` }}
          title="Concentrated (Tesla+Google+SpaceX)"
        />
        <div className="bg-status-achieved" style={{ width: `${floorPct}%` }} title="S&P 500 floor" />
      </div>

      <div className="mt-2 flex justify-between text-xs">
        <span className={damaging ? "text-status-concern" : "text-terminal-text"}>
          Conviction {concentratedPct.toFixed(0)}% · {formatGBP(concentrated)}
        </span>
        <span className="text-status-achieved">
          Floor {floorPct.toFixed(0)}% · {formatGBP(floor)}
        </span>
      </div>

      {damaging ? (
        <p className="mt-2 rounded-md border border-status-concern/40 bg-status-concern/10 px-3 py-2 text-[11px] text-status-concern">
          The conviction bets are {concentratedPct.toFixed(0)}% of this portfolio — above the{" "}
          {threshold}% line where being wrong would be <strong>damaging</strong>, not merely
          disappointing. New capital is directed to the floor first by the allocator. Remember: the
          index floor and your operating business carry the future; these positions carry the dream
          that might not arrive.
        </p>
      ) : (
        <p className="mt-2 text-[11px] leading-relaxed text-terminal-muted">
          The concentrated bets carry the dream; the S&amp;P 500 floor and your operating business
          carry the future. Being wrong here should stay <em>disappointing</em>, not damaging.
        </p>
      )}
    </div>
  );
}
