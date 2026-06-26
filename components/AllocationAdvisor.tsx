"use client";

import { useEffect, useState } from "react";
import type {
  AllocationResult,
  PortfolioBalances,
  RiskTolerance,
} from "@/lib/types";
import { formatGBP } from "@/lib/format";
import { notifyHoldingsChanged, onHoldingsChanged } from "@/lib/clientEvents";

const TOLERANCES: RiskTolerance[] = ["Conservative", "Moderate", "Aggressive"];
const POSITIONS: (keyof PortfolioBalances)[] = ["tesla", "google", "spacex", "sp500"];
const LABELS: Record<string, string> = {
  tesla: "Tesla",
  google: "Google",
  spacex: "SpaceX",
  sp500: "S&P 500",
};

export default function AllocationAdvisor() {
  const [amount, setAmount] = useState(1500);
  const [tolerance, setTolerance] = useState<RiskTolerance>("Moderate");
  const [balances, setBalances] = useState<PortfolioBalances | null>(null);
  const [result, setResult] = useState<AllocationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);
  const [contributions, setContributions] = useState<{ at: string; amount: number; tolerance: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  function loadBalances() {
    fetch("/api/allocate")
      .then((r) => r.json())
      .then((d) => {
        setBalances(d.balances);
        setContributions(d.contributions ?? []);
      })
      .catch(() => setBalances({ tesla: 0, google: 0, spacex: 0, sp500: 0 }));
  }
  useEffect(() => {
    loadBalances();
    return onHoldingsChanged(loadBalances); // stay in sync when holdings change elsewhere
  }, []);

  async function calculate() {
    if (loading) return;
    setLoading(true);
    setError(null);
    setConfirmMsg(null);
    try {
      const res = await fetch("/api/allocate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, tolerance }),
      });
      const d = await res.json();
      if (!res.ok) setError(d.error ?? "Allocation failed");
      else setResult(d);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    if (confirming) return;
    setConfirming(true);
    setError(null);
    try {
      const res = await fetch("/api/allocate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", amount, tolerance }),
      });
      const d = await res.json();
      if (!res.ok) setError(d.error ?? "Confirm failed");
      else {
        setBalances(d.balances);
        setResult(null);
        setConfirmMsg(
          `Recorded ${formatGBP(amount)} contribution — holdings updated. Enter your next amount for a revised allocation.`
        );
        notifyHoldingsChanged(); // holdings + conviction meter refresh
        loadBalances();
      }
    } catch {
      setError("Network error");
    } finally {
      setConfirming(false);
    }
  }

  const currentTotal = balances
    ? POSITIONS.reduce((s, p) => s + (balances[p] || 0), 0)
    : 0;

  return (
    <div className="rounded-lg border border-terminal-border bg-terminal-panel p-4">
      {/* Inputs */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-terminal-muted">New capital to allocate</label>
            <div className="flex items-center gap-1 text-terminal-text">
              <span>£</span>
              <input
                type="number"
                min={0}
                step={50}
                value={amount}
                onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
                className="w-32 rounded border border-terminal-border bg-terminal-bg px-2 py-1 font-semibold"
                aria-label="Amount to allocate"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-terminal-muted">Volatility tolerance</label>
            <div className="flex gap-1">
              {TOLERANCES.map((t) => (
                <button
                  key={t}
                  onClick={() => setTolerance(t)}
                  className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                    tolerance === t
                      ? "bg-terminal-text text-terminal-bg"
                      : "border border-terminal-border bg-terminal-bg text-terminal-muted hover:text-terminal-text"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Current holdings — live, sourced from the Holdings panel */}
        <div>
          <label className="mb-1 block text-xs text-terminal-muted">
            Current holdings (live value) — {formatGBP(currentTotal)} total
          </label>
          <div className="grid grid-cols-2 gap-2">
            {balances &&
              POSITIONS.map((p) => (
                <div
                  key={p}
                  className="flex items-center justify-between rounded border border-terminal-border bg-terminal-bg px-2 py-1 text-xs"
                >
                  <span className="text-terminal-muted">{LABELS[p]}</span>
                  <span className="text-terminal-text">{formatGBP(balances[p])}</span>
                </div>
              ))}
          </div>
          <p className="mt-1 text-[10px] text-terminal-muted">
            Valued from your holdings above. Edit shares/cost in the Holdings panel.
          </p>
        </div>
      </div>

      <button
        onClick={calculate}
        disabled={loading || amount <= 0}
        className="mt-4 rounded-md bg-terminal-text px-4 py-2 text-sm font-semibold text-terminal-bg disabled:opacity-40"
      >
        {loading ? "Calculating…" : "Calculate allocation"}
      </button>

      {error && (
        <p className="mt-3 rounded-md border border-status-concern/40 bg-status-concern/10 p-3 text-sm text-status-concern">
          {error}
        </p>
      )}

      {confirmMsg && (
        <p className="mt-3 rounded-md border border-status-achieved/40 bg-status-achieved/10 p-3 text-sm text-status-achieved">
          {confirmMsg}
        </p>
      )}

      {result && <Result result={result} />}

      {result && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-terminal-border pt-3">
          <button
            onClick={confirm}
            disabled={confirming}
            className="rounded-md bg-status-achieved/20 px-4 py-2 text-sm font-semibold text-status-achieved disabled:opacity-40"
          >
            {confirming ? "Recording…" : "Confirm & update holdings"}
          </button>
          <span className="text-[11px] text-terminal-muted">
            Records this as a contribution and updates your holdings so the next allocation is
            revised. Does not place any trade — you execute via your broker.
          </span>
        </div>
      )}

      {contributions.length > 0 && (
        <div className="mt-4 border-t border-terminal-border pt-3">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-terminal-muted">
            Recent contributions
          </div>
          <ul className="space-y-1">
            {contributions.slice(0, 6).map((c, i) => (
              <li key={i} className="flex items-center gap-2 text-[11px] text-terminal-muted">
                <span>{new Date(c.at).toLocaleDateString()}</span>
                <span className="text-terminal-text">{formatGBP(c.amount)}</span>
                <span>· {c.tolerance}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Result({ result }: { result: AllocationResult }) {
  return (
    <div className="mt-4 space-y-4 border-t border-terminal-border pt-4">
      {/* Recommendation */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-terminal-muted">
          Recommended split of {formatGBP(result.input.amount)} · {result.input.tolerance}
        </h4>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {result.recommendation.map((line) => (
            <div key={line.position} className="rounded-lg bg-terminal-bg p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-terminal-text">{line.name}</span>
                <span className="text-lg font-bold text-status-achieved">
                  {formatGBP(line.gbp)}
                </span>
              </div>
              <div className="text-[11px] text-terminal-muted">{line.pctOfNew}% of new capital</div>
              {line.reasons.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {line.reasons.map((r, i) => (
                    <li key={i} className="text-[11px] leading-snug text-terminal-muted">
                      · {r}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Alerts */}
      {result.alerts.length > 0 && (
        <div className="space-y-1">
          {result.alerts.map((a, i) => (
            <p
              key={i}
              className="rounded-md border border-status-developing/40 bg-status-developing/10 px-3 py-2 text-xs text-status-developing"
            >
              ⚠ {a}
            </p>
          ))}
        </div>
      )}

      {/* Post-investment weights */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Weights title="Current weights" snap={result.current} />
        <Weights title="After this allocation" snap={result.postInvestment} highlight />
      </div>

      {/* Projections */}
      <div className="rounded-lg bg-terminal-bg p-3 text-sm">
        <span className="text-terminal-muted">Blended outlook (signal-adjusted): </span>
        <span className="font-semibold text-status-achieved">
          {result.projections.blendedReturnPct.toFixed(1)}%
        </span>
        <span className="text-terminal-muted"> · </span>
        <span className="font-semibold text-status-developing">
          {result.projections.blendedLikelihoodPct}% likely
        </span>
      </div>

      {/* Layered rationale */}
      <details className="rounded-lg border border-terminal-border bg-terminal-bg p-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-widest text-terminal-muted">
          Full rationale (3 layers)
        </summary>
        <div className="mt-2 space-y-2 text-xs text-terminal-text">
          <LayerBlock title="Layer 1 — framework hard constraints" items={result.layers.layer1} />
          <LayerBlock title="Layer 2 — volatility adjustment" items={result.layers.layer2} />
          <LayerBlock title="Layer 3 — return optimisation" items={result.layers.layer3} />
        </div>
      </details>

      <p className="text-[11px] leading-relaxed text-terminal-muted">{result.disclaimer}</p>
    </div>
  );
}

function Weights({
  title,
  snap,
  highlight,
}: {
  title: string;
  snap: AllocationResult["current"];
  highlight?: boolean;
}) {
  const order = ["tesla", "google", "spacex", "sp500"];
  return (
    <div className={`rounded-lg p-3 ${highlight ? "bg-status-achieved/10" : "bg-terminal-bg"}`}>
      <div className="mb-1 text-[11px] uppercase tracking-wide text-terminal-muted">{title}</div>
      <div className="space-y-1">
        {order.map((p) => (
          <div key={p} className="flex items-center justify-between text-xs">
            <span className="text-terminal-muted">{LABELS[p]}</span>
            <span className="text-terminal-text">{(snap.weights[p] * 100).toFixed(1)}%</span>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-terminal-border pt-1 text-xs">
          <span className="text-terminal-muted">Tesla+SpaceX combined</span>
          <span className="font-semibold text-terminal-text">{snap.teslaSpacexCombinedPct}%</span>
        </div>
      </div>
    </div>
  );
}

function LayerBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="font-semibold text-terminal-text">{title}</div>
      <ul className="mt-0.5 space-y-0.5">
        {items.map((it, i) => (
          <li key={i} className="text-terminal-muted">
            · {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
