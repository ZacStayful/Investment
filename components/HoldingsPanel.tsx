"use client";

import { useEffect, useState } from "react";
import { formatGBP, formatPct } from "@/lib/format";
import { notifyHoldingsChanged, onHoldingsChanged } from "@/lib/clientEvents";

interface PositionValue {
  position: string;
  name: string;
  ticker: string;
  shares: number;
  costBasisGBP: number;
  priceUSD: number | null;
  priceSource: "fmp" | "framework-fallback" | "none";
  currentValueGBP: number | null;
  returnGBP: number | null;
  returnPct: number | null;
}

interface HoldingsData {
  holdings: Record<string, { shares: number; costBasisGBP: number }>;
  positions: PositionValue[];
  totals: { costBasisGBP: number; currentValueGBP: number; returnGBP: number; returnPct: number | null };
  fxGbpUsd: number | null;
  keyConfigured: boolean;
}

const ORDER = ["tesla", "google", "spacex", "sp500"];

export default function HoldingsPanel() {
  const [data, setData] = useState<HoldingsData | null>(null);
  const [edit, setEdit] = useState<Record<string, { shares: number; costBasisGBP: number }> | null>(
    null
  );
  const [saving, setSaving] = useState(false);
  const [justUpdated, setJustUpdated] = useState(false);

  function load(showFlash = false) {
    fetch("/api/holdings")
      .then((r) => r.json())
      .then((d: HoldingsData) => {
        setData(d);
        // Refresh edit state too, so a later Save can't clobber an allocation
        // that was confirmed elsewhere.
        setEdit(d.holdings);
        if (showFlash) {
          setJustUpdated(true);
          setTimeout(() => setJustUpdated(false), 4000);
        }
      })
      .catch(() => setData(null));
  }

  useEffect(() => {
    load();
    // Re-pull when an allocation is confirmed (or holdings change elsewhere).
    return onHoldingsChanged(() => load(true));
  }, []);

  async function save() {
    if (!edit) return;
    setSaving(true);
    try {
      const res = await fetch("/api/holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdings: edit }),
      });
      const d = await res.json();
      setData(d);
      setEdit(d.holdings);
      notifyHoldingsChanged(); // conviction meter + allocator balances refresh
    } finally {
      setSaving(false);
    }
  }

  if (!data || !edit) {
    return (
      <div className="rounded-lg border border-terminal-border bg-terminal-panel p-4">
        <div className="h-24 animate-pulse rounded bg-terminal-border/40" />
      </div>
    );
  }

  const t = data.totals;
  const posByKey = Object.fromEntries(data.positions.map((p) => [p.position, p]));

  return (
    <div className="rounded-lg border border-terminal-border bg-terminal-panel p-4">
      {justUpdated && (
        <p className="mb-3 rounded-md border border-status-achieved/40 bg-status-achieved/10 px-3 py-2 text-xs text-status-achieved">
          Holdings updated from a confirmed allocation — shares and amount invested adjusted at the
          current price.
        </p>
      )}
      {/* Totals */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Total value" value={formatGBP(t.currentValueGBP)} tone="text" />
        <Stat label="Total invested" value={formatGBP(t.costBasisGBP)} tone="muted" />
        <Stat
          label="Total return"
          value={`${formatGBP(t.returnGBP)} (${formatPct(t.returnPct)})`}
          tone={t.returnGBP >= 0 ? "achieved" : "concern"}
        />
      </div>

      {/* Per-position editable rows */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-terminal-muted">
              <th className="py-1 pr-2 font-medium">Position</th>
              <th className="py-1 px-2 font-medium">Shares</th>
              <th className="py-1 px-2 font-medium">Invested (£)</th>
              <th className="py-1 px-2 font-medium">Price</th>
              <th className="py-1 px-2 font-medium">Value</th>
              <th className="py-1 pl-2 font-medium text-right">Return</th>
            </tr>
          </thead>
          <tbody>
            {ORDER.map((key) => {
              const pos = posByKey[key];
              const h = edit[key] ?? { shares: 0, costBasisGBP: 0 };
              return (
                <tr key={key} className="border-t border-terminal-border">
                  <td className="py-2 pr-2">
                    <div className="font-semibold text-terminal-text">{pos.name}</div>
                    <div className="text-[10px] text-terminal-muted">{pos.ticker}</div>
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={h.shares}
                      onChange={(e) =>
                        setEdit({ ...edit, [key]: { ...h, shares: Math.max(0, Number(e.target.value) || 0) } })
                      }
                      className="w-20 rounded border border-terminal-border bg-terminal-bg px-2 py-1 text-right text-terminal-text"
                      aria-label={`${pos.name} shares`}
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="number"
                      min={0}
                      step={100}
                      value={h.costBasisGBP}
                      onChange={(e) =>
                        setEdit({
                          ...edit,
                          [key]: { ...h, costBasisGBP: Math.max(0, Number(e.target.value) || 0) },
                        })
                      }
                      className="w-24 rounded border border-terminal-border bg-terminal-bg px-2 py-1 text-right text-terminal-text"
                      aria-label={`${pos.name} amount invested`}
                    />
                  </td>
                  <td className="py-2 px-2 text-terminal-muted">
                    {pos.priceUSD != null ? (
                      <span title={pos.priceSource}>
                        ${pos.priceUSD.toFixed(2)}
                        {pos.priceSource === "framework-fallback" && (
                          <span className="text-status-developing"> *</span>
                        )}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 px-2 text-terminal-text">
                    {pos.currentValueGBP != null ? formatGBP(pos.currentValueGBP) : "—"}
                  </td>
                  <td className="py-2 pl-2 text-right">
                    {pos.returnGBP != null ? (
                      <span className={pos.returnGBP >= 0 ? "text-status-achieved" : "text-status-concern"}>
                        {formatPct(pos.returnPct)}
                      </span>
                    ) : (
                      <span className="text-terminal-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-terminal-text px-4 py-1.5 text-sm font-semibold text-terminal-bg disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save holdings"}
        </button>
        <span className="text-[11px] text-terminal-muted">
          {data.fxGbpUsd
            ? `GBP/USD ${data.fxGbpUsd.toFixed(4)} · live value = shares × USD price ÷ FX`
            : data.keyConfigured
            ? "FX unavailable — values fall back to amount invested"
            : "No price feed (set FMP_API_KEY) — values fall back to amount invested"}
          {". * = framework fallback price (SpaceX)."}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-terminal-muted">
        Enter shares owned and total invested per position; returns update from live prices. These
        live values feed the allocation advisor&apos;s current weights.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "text" | "muted" | "achieved" | "concern";
}) {
  const color =
    tone === "achieved"
      ? "text-status-achieved"
      : tone === "concern"
      ? "text-status-concern"
      : tone === "muted"
      ? "text-terminal-muted"
      : "text-terminal-text";
  return (
    <div className="rounded-lg bg-terminal-bg p-3">
      <div className="text-xs uppercase tracking-widest text-terminal-muted">{label}</div>
      <div className={`mt-1 text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}
