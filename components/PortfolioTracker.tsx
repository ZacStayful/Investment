"use client";

import { useEffect, useMemo, useState } from "react";
import { framework } from "@/lib/framework";
import { computeBlendedOutlook } from "@/lib/outlook";
import { formatGBP } from "@/lib/format";
import { onSignalsChanged } from "@/lib/clientEvents";
import type { Signal } from "@/lib/types";

const defaults = framework.portfolioRules.calculatorDefaults as { P: number; C: number };
const ref = framework.portfolioReference;

/** FV = P(1+r/12)^n + C·[((1+r/12)^n − 1)/(r/12)] */
function futureValue(p: number, c: number, annualRatePct: number, months: number): number {
  const r = annualRatePct / 100;
  const m = r / 12;
  if (m === 0) return p + c * months;
  const growth = Math.pow(1 + m, months);
  return p * growth + c * ((growth - 1) / m);
}

export default function PortfolioTracker() {
  const [months, setMonths] = useState(240);
  const [rate, setRate] = useState(13);
  const [contribution, setContribution] = useState(defaults.C);
  const [adjusted, setAdjusted] = useState<{ rate: number; likelihood: number } | null>(null);

  useEffect(() => {
    function load() {
      fetch("/api/signals")
        .then((r) => r.json())
        .then((data) => {
          const signals = (data.signals ?? []) as Signal[];
          const o = computeBlendedOutlook(signals);
          setAdjusted({ rate: o.blendedReturnPct, likelihood: o.blendedLikelihoodPct });
        })
        .catch(() => setAdjusted(null));
    }
    load();
    return onSignalsChanged(load);
  }, []);

  const fv = useMemo(
    () => futureValue(defaults.P, contribution, rate, months),
    [months, rate, contribution]
  );
  const contributed = defaults.P + contribution * months;
  const gain = fv - contributed;

  // Framework TARGET rates (band tops / reference) — distinct from the live
  // signal-adjusted rate above. Tesla 28.8% is the full-conviction target,
  // not today's estimate.
  const quickCards = [
    { label: "Tesla target", pct: ref.teslaPct, note: "band top" },
    { label: "Google target", pct: ref.googlePct, note: "anchor" },
    { label: "SpaceX*", pct: 22, note: "deferred" },
    { label: "Blended", pct: ref.blendedPct, note: "" },
    { label: "Hurdle", pct: ref.hurdlePct, note: "benchmark" },
  ];

  return (
    <div className="rounded-lg border border-terminal-border bg-terminal-panel p-4">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-5">
          <Slider
            label="Horizon"
            value={months}
            min={0}
            max={360}
            step={6}
            onChange={setMonths}
            display={`${months} mo (${(months / 12).toFixed(1)} yr)`}
          />
          <Slider
            label="Annual rate"
            value={rate}
            min={8}
            max={42}
            step={1}
            onChange={setRate}
            display={`${rate}%`}
          />

          {/* Adjustable monthly contribution */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <label className="text-terminal-muted" htmlFor="contribution-range">
                Monthly contribution
              </label>
              <div className="flex items-center gap-1 text-terminal-text">
                <span>£</span>
                <input
                  type="number"
                  min={0}
                  max={20000}
                  step={50}
                  value={contribution}
                  onChange={(e) =>
                    setContribution(Math.max(0, Math.min(20000, Number(e.target.value) || 0)))
                  }
                  className="w-20 rounded border border-terminal-border bg-terminal-bg px-2 py-0.5 text-right font-semibold"
                  aria-label="Monthly contribution in pounds"
                />
                <span className="text-xs text-terminal-muted">/mo</span>
              </div>
            </div>
            <input
              id="contribution-range"
              type="range"
              min={0}
              max={5000}
              step={50}
              value={Math.min(contribution, 5000)}
              onChange={(e) => setContribution(Number(e.target.value))}
              className="w-full"
              aria-label="Monthly contribution"
            />
            {contribution !== defaults.C && (
              <button
                onClick={() => setContribution(defaults.C)}
                className="mt-1 text-[11px] text-sky-400 underline underline-offset-2"
              >
                reset to £{defaults.C.toLocaleString()} baseline
              </button>
            )}
          </div>

          <div className="pt-1">
            {adjusted && (
              <button
                onClick={() => setRate(Math.round(adjusted.rate))}
                className="mb-2 w-full rounded border border-status-achieved/40 bg-status-achieved/10 p-2 text-left text-xs transition-colors hover:border-status-achieved"
              >
                <div className="text-terminal-muted">
                  Live signal-adjusted rate · {adjusted.likelihood}% likely
                </div>
                <div className="text-base font-semibold text-status-achieved">
                  {adjusted.rate.toFixed(1)}% — apply
                </div>
              </button>
            )}
            <div className="mb-1 text-[10px] uppercase tracking-wide text-terminal-muted">
              Framework target rates (band tops — not today&apos;s estimate)
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {quickCards.map((q) => (
                <button
                  key={q.label}
                  onClick={() => setRate(Math.round(q.pct))}
                  className="rounded border border-terminal-border bg-terminal-bg p-2 text-left text-xs transition-colors hover:border-terminal-muted"
                >
                  <div className="text-terminal-muted">{q.label}</div>
                  <div className="text-base font-semibold text-terminal-text">{q.pct}%</div>
                  {q.note && <div className="text-[9px] text-terminal-muted">{q.note}</div>}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-terminal-muted">
              * SpaceX entry deferred — assumption, editable in framework.
            </p>
          </div>
        </div>

        <div className="flex flex-col justify-center rounded-lg bg-terminal-bg p-4">
          <div className="text-xs uppercase tracking-widest text-terminal-muted">
            Projected value
          </div>
          <div className="mt-1 text-3xl font-bold text-status-achieved">{formatGBP(fv)}</div>
          <dl className="mt-4 space-y-1.5 text-sm">
            <Row label="Starting" value={formatGBP(defaults.P)} />
            <Row label="Contributions" value={`${formatGBP(contribution)}/mo`} />
            <Row label="Total contributed" value={formatGBP(contributed)} />
            <Row label="Projected gain" value={formatGBP(gain)} accent />
          </dl>
          <p className="mt-4 text-[11px] leading-relaxed text-terminal-muted">
            Compounding projection only — not a forecast or financial advice. Anchor contribution
            decisions to the conservative blended floor (~13%), not the high early-phase CAGR.
          </p>
        </div>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  display: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <label className="text-terminal-muted">{label}</label>
        <span className="font-semibold text-terminal-text">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        aria-label={label}
      />
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-terminal-muted">{label}</dt>
      <dd className={accent ? "font-semibold text-status-developing" : "text-terminal-text"}>
        {value}
      </dd>
    </div>
  );
}
