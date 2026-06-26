"use client";

import { useEffect, useState } from "react";
import { formatGBP, formatPct } from "@/lib/format";
import { notifyHoldingsChanged, onHoldingsChanged } from "@/lib/clientEvents";

interface Holding {
  investedGBP: number;
  valueGBP: number;
}

interface PositionValue {
  position: string;
  name: string;
  investedGBP: number;
  valueGBP: number;
  returnGBP: number;
  returnPct: number | null;
}

interface HoldingsData {
  holdings: Record<string, Holding>;
  positions: PositionValue[];
  totals: { investedGBP: number; valueGBP: number; returnGBP: number; returnPct: number | null };
}

const ORDER = ["tesla", "google", "spacex", "sp500"];
const NAMES: Record<string, string> = {
  tesla: "Tesla",
  google: "Google",
  spacex: "SpaceX",
  sp500: "S&P 500",
};

export default function HoldingsPanel() {
  const [data, setData] = useState<HoldingsData | null>(null);
  const [edit, setEdit] = useState<Record<string, Holding> | null>(null);
  const [saving, setSaving] = useState(false);
  const [justUpdated, setJustUpdated] = useState(false);

  function load(showFlash = false) {
    fetch("/api/holdings")
      .then((r) => r.json())
      .then((d: HoldingsData) => {
        setData(d);
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
      notifyHoldingsChanged();
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

  return (
    <div className="rounded-lg border border-terminal-border bg-terminal-panel p-4">
      {justUpdated && (
        <p className="mb-3 rounded-md border border-status-achieved/40 bg-status-achieved/10 px-3 py-2 text-xs text-status-achieved">
          Holdings updated from a confirmed allocation — invested and value adjusted.
        </p>
      )}

      {/* Totals */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Total value" value={formatGBP(t.valueGBP)} tone="text" />
        <Stat label="Total invested" value={formatGBP(t.investedGBP)} tone="muted" />
        <Stat
          label="Total return"
          value={`${formatGBP(t.returnGBP)} (${formatPct(t.returnPct)})`}
          tone={t.returnGBP >= 0 ? "achieved" : "concern"}
        />
      </div>

      {/* Per-position rows */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-terminal-muted">
              <th className="py-1 pr-2 font-medium">Position</th>
              <th className="py-1 px-2 font-medium">Invested (£)</th>
              <th className="py-1 px-2 font-medium">Current value (£)</th>
              <th className="py-1 pl-2 font-medium text-right">Return</th>
            </tr>
          </thead>
          <tbody>
            {ORDER.map((key) => {
              const h = edit[key];
              if (!h) return null;
              const ret = h.valueGBP - h.investedGBP;
              const retPct = h.investedGBP > 0 ? (h.valueGBP / h.investedGBP - 1) * 100 : null;
              return (
                <tr key={key} className="border-t border-terminal-border">
                  <td className="py-2 pr-2 font-semibold text-terminal-text">{NAMES[key]}</td>
                  <td className="py-2 px-2">
                    <input
                      type="number"
                      min={0}
                      step={50}
                      value={h.investedGBP}
                      onChange={(e) =>
                        setEdit({ ...edit, [key]: { ...h, investedGBP: Math.max(0, Number(e.target.value) || 0) } })
                      }
                      className="w-28 rounded border border-terminal-border bg-terminal-bg px-2 py-1 text-right text-terminal-text"
                      aria-label={`${NAMES[key]} amount invested`}
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="number"
                      min={0}
                      step={50}
                      value={h.valueGBP}
                      onChange={(e) =>
                        setEdit({ ...edit, [key]: { ...h, valueGBP: Math.max(0, Number(e.target.value) || 0) } })
                      }
                      className="w-28 rounded border border-terminal-border bg-terminal-bg px-2 py-1 text-right text-terminal-text"
                      aria-label={`${NAMES[key]} current value`}
                    />
                  </td>
                  <td className="py-2 pl-2 text-right">
                    {retPct != null ? (
                      <span className={ret >= 0 ? "text-status-achieved" : "text-status-concern"}>
                        {formatGBP(ret)} ({formatPct(retPct)})
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
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-terminal-muted">
        Enter, per position, the total you&apos;ve invested and its current value (both read straight
        off your broker). Return = value − invested. Confirming an allocation adds the £ to both. These
        current values feed the allocation advisor&apos;s weights.
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
