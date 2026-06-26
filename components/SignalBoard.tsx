"use client";

import { useEffect, useMemo, useState } from "react";
import type { Signal, SignalStatus } from "@/lib/types";

const STATUS_STYLES: Record<SignalStatus, { dot: string; text: string; ring: string }> = {
  ACHIEVED: { dot: "bg-status-achieved", text: "text-status-achieved", ring: "border-status-achieved/40" },
  DEVELOPING: { dot: "bg-status-developing", text: "text-status-developing", ring: "border-status-developing/40" },
  WATCHING: { dot: "bg-status-watching", text: "text-status-watching", ring: "border-terminal-border" },
  CONCERN: { dot: "bg-status-concern", text: "text-status-concern", ring: "border-status-concern/60" },
};

const COMPANY_TABS = [
  { id: "tesla", label: "Tesla" },
  { id: "google", label: "Google" },
  { id: "spacex", label: "SpaceX" },
  { id: "merger", label: "Merger" },
];

interface LoopState {
  label: string;
  achievedCount: number;
  closing: boolean;
}

export default function SignalBoard() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loop, setLoop] = useState<LoopState | null>(null);
  const [activeTab, setActiveTab] = useState("tesla");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/signals")
      .then((r) => r.json())
      .then((data) => {
        setSignals(data.signals ?? []);
        setLoop(data.loop ?? null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function cycle(signal: Signal) {
    setPending(signal.id);
    const order: SignalStatus[] = ["WATCHING", "DEVELOPING", "ACHIEVED", "CONCERN"];
    const next = order[(order.indexOf(signal.status) + 1) % order.length];
    try {
      const res = await fetch("/api/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: signal.id, status: next }),
      });
      const data = await res.json();
      if (data.signals) {
        setSignals(data.signals);
        setLoop(data.loop ?? null);
      }
    } finally {
      setPending(null);
    }
  }

  const counts = useMemo(() => {
    const c: Record<SignalStatus, number> = { WATCHING: 0, DEVELOPING: 0, ACHIEVED: 0, CONCERN: 0 };
    for (const s of signals) c[s.status]++;
    return c;
  }, [signals]);

  const visible = signals.filter((s) => s.company === activeTab);
  const tiers = [1, 2, 3] as const;

  return (
    <div>
      {/* Summary bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-terminal-border bg-terminal-panel p-3 text-xs">
        {(Object.keys(counts) as SignalStatus[]).map((status) => (
          <span key={status} className="flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${STATUS_STYLES[status].dot}`} />
            <span className={STATUS_STYLES[status].text}>{status}</span>
            <span className="text-terminal-muted">{counts[status]}</span>
          </span>
        ))}
        {loop && (
          <span className="ml-auto flex items-center gap-2">
            <span className="text-terminal-muted">FACTORY LOOP:</span>
            <span
              className={`rounded px-2 py-0.5 font-semibold ${
                loop.closing
                  ? "bg-status-achieved/20 text-status-achieved"
                  : "bg-terminal-border text-terminal-text"
              }`}
            >
              {loop.closing ? "CLOSING" : loop.label}
            </span>
            <span className="text-terminal-muted">({loop.achievedCount} Tesla achieved)</span>
          </span>
        )}
      </div>

      {/* Company tabs */}
      <div className="mb-4 flex flex-wrap gap-1">
        {COMPANY_TABS.map((tab) => {
          const tabCount = signals.filter((s) => s.company === tab.id).length;
          const tabConcern = signals.some((s) => s.company === tab.id && s.status === "CONCERN");
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                activeTab === tab.id
                  ? "bg-terminal-text text-terminal-bg"
                  : "border border-terminal-border bg-terminal-panel text-terminal-muted hover:text-terminal-text"
              }`}
            >
              {tab.label}
              <span className="ml-1.5 text-xs opacity-70">{tabCount}</span>
              {tabConcern && <span className="ml-1 text-status-concern">●</span>}
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="text-sm text-terminal-muted">Loading signals…</p>
      ) : (
        <div className="space-y-5">
          {tiers.map((tier) => {
            const tierSignals = visible.filter((s) => s.tier === tier);
            if (tierSignals.length === 0) return null;
            return (
              <div key={tier}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-terminal-muted">
                  Tier {tier}
                  {tier === 3 && " · definitive re-rating triggers"}
                </h3>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {tierSignals.map((signal) => (
                    <SignalCard
                      key={signal.id}
                      signal={signal}
                      pending={pending === signal.id}
                      onClick={() => cycle(signal)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SignalCard({
  signal,
  pending,
  onClick,
}: {
  signal: Signal;
  pending: boolean;
  onClick: () => void;
}) {
  const style = STATUS_STYLES[signal.status];
  const concern = signal.status === "CONCERN";
  return (
    <button
      onClick={onClick}
      disabled={pending}
      title="Click to cycle status"
      className={`flex w-full flex-col items-start gap-1 rounded-lg border bg-terminal-panel p-3 text-left transition-colors hover:bg-terminal-border/30 disabled:opacity-50 ${style.ring} ${
        concern ? "animate-pulseConcern" : ""
      }`}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span className="text-sm font-medium text-terminal-text">
          <span className="text-terminal-muted">#{signal.number}</span> {signal.name}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className={`inline-block h-2 w-2 rounded-full ${style.dot}`} />
          <span className={`text-xs font-semibold ${style.text}`}>{signal.status}</span>
        </span>
      </div>
      <p className="text-xs leading-relaxed text-terminal-muted">{signal.watch}</p>
    </button>
  );
}
