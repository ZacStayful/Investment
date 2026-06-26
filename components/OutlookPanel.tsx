"use client";

import { useEffect, useState } from "react";
import type { Signal, BlendedOutlook, CompanyOutlook } from "@/lib/types";
import { computeBlendedOutlook } from "@/lib/outlook";
import { formatPct } from "@/lib/format";

export default function OutlookPanel() {
  const [outlook, setOutlook] = useState<BlendedOutlook | null>(null);

  useEffect(() => {
    fetch("/api/signals")
      .then((r) => r.json())
      .then((data) => {
        const signals = (data.signals ?? []) as Signal[];
        setOutlook(computeBlendedOutlook(signals));
      })
      .catch(() => setOutlook(null));
  }, []);

  if (!outlook) {
    return (
      <div className="rounded-lg border border-terminal-border bg-terminal-panel p-4">
        <div className="h-24 animate-pulse rounded bg-terminal-border/40" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-terminal-border bg-terminal-panel p-4">
      {/* Blended headline */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat
          label="Blended expected return"
          value={`${outlook.blendedReturnPct.toFixed(1)}%`}
          tone="achieved"
          sub="signal-adjusted, target-weighted"
        />
        <Stat
          label="Likelihood of achieving"
          value={`${outlook.blendedLikelihoodPct}%`}
          tone="developing"
          sub="probability score"
        />
      </div>

      <div className="space-y-2">
        {outlook.companies
          .filter((c) => c.companyId !== "spacex" || c.signalsConsidered > 0)
          .map((c) => (
            <CompanyRow key={c.companyId} c={c} weight={outlook.weights[c.companyId] ?? 0} />
          ))}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-terminal-muted">
        Heuristic, not a forecast. Expected return is interpolated inside each position&apos;s own
        band (conservative floor → headline CAGR) from its live signals; likelihood flexes around a
        neutral baseline with signal confidence. Tier 3 signals are weighted 4× Tier 1. Blended uses
        target weights (Tesla {Math.round((outlook.weights.tesla ?? 0) * 100)}% · Google{" "}
        {Math.round((outlook.weights.google ?? 0) * 100)}% · S&amp;P 500{" "}
        {Math.round((outlook.weights.sp500 ?? 0) * 100)}%; SpaceX deferred). Updates live as signals
        move.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone: "achieved" | "developing";
  sub: string;
}) {
  const color = tone === "achieved" ? "text-status-achieved" : "text-status-developing";
  return (
    <div className="rounded-lg bg-terminal-bg p-3">
      <div className="text-xs uppercase tracking-widest text-terminal-muted">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-[11px] text-terminal-muted">{sub}</div>
    </div>
  );
}

function CompanyRow({ c, weight }: { c: CompanyOutlook; weight: number }) {
  return (
    <div className="rounded-md border border-terminal-border bg-terminal-bg p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-terminal-text">{c.name}</span>
          {weight > 0 && (
            <span className="text-[11px] text-terminal-muted">{Math.round(weight * 100)}% target</span>
          )}
        </div>
        <div className="text-right">
          {c.deferred || c.adjustedPct == null ? (
            <span className="text-xs font-semibold text-status-watching">
              {c.deferred ? "ENTRY DEFERRED" : "n/a"}
            </span>
          ) : (
            <span className="text-base font-bold text-status-achieved">
              {c.adjustedPct.toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-terminal-border">
          <div
            className="h-full rounded-full bg-status-developing"
            style={{ width: `${c.likelihoodPct}%` }}
          />
        </div>
        <span className="w-24 text-right text-[11px] text-terminal-muted">
          {c.likelihoodPct}% likely
        </span>
      </div>

      {(c.positiveDrivers.length > 0 || c.negativeDrivers.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {c.positiveDrivers.map((d) => (
            <span
              key={d}
              className="rounded-full bg-status-achieved/10 px-2 py-0.5 text-[10px] text-status-achieved"
            >
              +{d}
            </span>
          ))}
          {c.negativeDrivers.map((d) => (
            <span
              key={d}
              className="rounded-full bg-status-concern/10 px-2 py-0.5 text-[10px] text-status-concern"
            >
              −{d}
            </span>
          ))}
        </div>
      )}
      {c.adjustedPct != null && c.floorPct != null && c.highPct != null && (
        <div className="mt-1.5 text-[10px] text-terminal-muted">
          band {c.floorPct}%–{c.highPct}% · confidence {formatPct(c.confidence * 100, 0)}
        </div>
      )}
    </div>
  );
}
