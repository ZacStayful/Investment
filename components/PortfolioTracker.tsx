"use client";

import { useMemo, useState } from "react";
import { framework } from "@/lib/framework";
import { formatGBP } from "@/lib/format";

const P = (framework.portfolioRules.calculatorDefaults as { P: number; C: number }).P;
const C = (framework.portfolioRules.calculatorDefaults as { P: number; C: number }).C;
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

  const fv = useMemo(() => futureValue(P, C, rate, months), [months, rate]);
  const contributed = P + C * months;
  const gain = fv - contributed;

  const quickCards = [
    { label: "Blended", pct: ref.blendedPct },
    { label: "Google", pct: ref.googlePct },
    { label: "Tesla", pct: ref.teslaPct },
    { label: "Hurdle", pct: ref.hurdlePct },
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
          <div className="grid grid-cols-2 gap-2 pt-2">
            {quickCards.map((q) => (
              <button
                key={q.label}
                onClick={() => setRate(Math.round(q.pct))}
                className="rounded border border-terminal-border bg-terminal-bg p-2 text-left text-xs transition-colors hover:border-terminal-muted"
              >
                <div className="text-terminal-muted">{q.label}</div>
                <div className="text-base font-semibold text-terminal-text">{q.pct}%</div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col justify-center rounded-lg bg-terminal-bg p-4">
          <div className="text-xs uppercase tracking-widest text-terminal-muted">
            Projected value
          </div>
          <div className="mt-1 text-3xl font-bold text-status-achieved">{formatGBP(fv)}</div>
          <dl className="mt-4 space-y-1.5 text-sm">
            <Row label="Starting" value={formatGBP(P)} />
            <Row label="Contributions" value={`${formatGBP(C)}/mo`} />
            <Row label="Total contributed" value={formatGBP(contributed)} />
            <Row label="Projected gain" value={formatGBP(gain)} accent />
          </dl>
          <p className="mt-4 text-[11px] leading-relaxed text-terminal-muted">
            Compounding projection only — not a forecast or financial advice. Anchor
            contribution decisions to the conservative blended floor (~13%), not the
            high early-phase CAGR.
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
