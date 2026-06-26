"use client";

import { useEffect, useState } from "react";
import type { Signal, BlendedOutlook, CompanyOutlook } from "@/lib/types";
import { computeBlendedOutlook } from "@/lib/outlook";

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
        {outlook.companies.map((c) => (
          <CompanyRow key={c.companyId} c={c} weight={outlook.weights[c.companyId] ?? 0} />
        ))}
      </div>

      <div className="mt-4 rounded-md border border-terminal-border bg-terminal-bg p-3 text-[11px] leading-relaxed text-terminal-muted">
        <p className="mb-1 font-semibold text-terminal-text">Reading the three numbers</p>
        <p>
          Each position shows a band: <span className="text-status-watching">floor</span> (the
          conservative figure to anchor decisions to) →{" "}
          <span className="text-status-achieved">adjusted</span> (today&apos;s best estimate, where
          current signals place you in the band) →{" "}
          <span className="text-terminal-text">target</span> (the framework&apos;s full-conviction
          headline CAGR — e.g. Tesla 28.8%). The <em>adjusted</em> number is the one that moves with
          the signal board; the <em>target</em> is the static ceiling you&apos;re aiming at. This is
          a transparent heuristic, not a forecast — Tier 3 signals weighted 4× Tier 1. Blended uses
          target weights (Tesla {Math.round((outlook.weights.tesla ?? 0) * 100)}% · Google{" "}
          {Math.round((outlook.weights.google ?? 0) * 100)}% · S&amp;P 500{" "}
          {Math.round((outlook.weights.sp500 ?? 0) * 100)}%; SpaceX excluded while entry deferred).
        </p>
      </div>
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
          {c.deferred && (
            <span className="rounded bg-status-watching/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-status-watching">
              entry deferred
            </span>
          )}
        </div>
        <div className="text-right">
          {c.adjustedPct == null ? (
            <span className="text-xs font-semibold text-status-watching">n/a</span>
          ) : (
            <div>
              <span className="text-base font-bold text-status-achieved">
                {c.adjustedPct.toFixed(1)}%
              </span>
              <span className="ml-1 text-[10px] text-terminal-muted">adjusted</span>
            </div>
          )}
        </div>
      </div>

      {/* floor -> adjusted -> target band */}
      {c.adjustedPct != null && c.floorPct != null && c.highPct != null && (
        <div className="mt-2">
          <div className="relative h-1.5 overflow-hidden rounded-full bg-terminal-border">
            <div
              className="absolute top-0 h-full w-1.5 -translate-x-1/2 rounded-full bg-status-achieved"
              style={{
                left: `${
                  c.highPct > c.floorPct
                    ? ((c.adjustedPct - c.floorPct) / (c.highPct - c.floorPct)) * 100
                    : 50
                }%`,
              }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-terminal-muted">
            <span>floor {c.floorPct}%</span>
            <span className="text-status-achieved">adjusted {c.adjustedPct.toFixed(1)}%</span>
            <span>target {c.highPct}%</span>
          </div>
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-terminal-border">
          <div
            className="h-full rounded-full bg-status-developing"
            style={{ width: `${c.likelihoodPct}%` }}
          />
        </div>
        <span className="w-28 text-right text-[11px] text-terminal-muted">
          {c.likelihoodPct}% likely{c.deferred ? " (if entered)" : ""}
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
    </div>
  );
}
