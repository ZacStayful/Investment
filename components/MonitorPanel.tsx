"use client";

import { useEffect, useState } from "react";
import type { MonitorProposal, AuditEntry, MonitorRunSummary } from "@/lib/types";

interface MonitorData {
  proposals: MonitorProposal[];
  audit: AuditEntry[];
  lastRun: MonitorRunSummary | null;
}

export default function MonitorPanel() {
  const [data, setData] = useState<MonitorData | null>(null);
  const [running, setRunning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/monitor")
      .then((r) => r.json())
      .then((d) => setData({ proposals: d.proposals ?? [], audit: d.audit ?? [], lastRun: d.lastRun ?? null }))
      .catch(() => setError("Could not load monitor state"));
  }, []);

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/monitor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  async function runNow() {
    setRunning(true);
    setError(null);
    try {
      const d = await post({ action: "run" });
      if (d.error) setError(d.error);
      else
        setData((prev) => ({
          proposals: d.proposals ?? [],
          audit: d.audit ?? [],
          lastRun: d.summary ?? prev?.lastRun ?? null,
        }));
    } catch {
      setError("Monitor run failed");
    } finally {
      setRunning(false);
    }
  }

  async function resolve(proposalId: string, action: "accept" | "reject") {
    setBusyId(proposalId);
    try {
      const d = await post({ action, proposalId });
      if (!d.error)
        setData((prev) => ({
          proposals: d.proposals ?? [],
          audit: d.audit ?? [],
          lastRun: prev?.lastRun ?? null,
        }));
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <p className="text-sm text-status-concern">{error}</p>;
  if (!data) return <p className="text-sm text-terminal-muted">Loading monitor…</p>;

  return (
    <div className="space-y-4">
      {/* Control bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-terminal-border bg-terminal-panel p-3 text-xs">
        <button
          onClick={runNow}
          disabled={running}
          className="rounded-md bg-terminal-text px-3 py-1.5 font-semibold text-terminal-bg disabled:opacity-40"
        >
          {running ? "Scanning…" : "Run monitor now"}
        </button>
        <span className="text-terminal-muted">
          {data.lastRun
            ? `Last run ${new Date(data.lastRun.ranAt).toLocaleString()} · ${data.lastRun.proposalsCreated} proposed · ${data.lastRun.alerts} alert(s)`
            : "Not yet run · scheduled daily 07:00 UTC"}
        </span>
        {data.lastRun?.errors && data.lastRun.errors.length > 0 && (
          <span className="text-status-concern">{data.lastRun.errors.length} error(s)</span>
        )}
      </div>

      {/* Pending proposals — human-in-the-loop */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-terminal-muted">
          Pending proposals ({data.proposals.length})
        </h3>
        {data.proposals.length === 0 ? (
          <p className="rounded-md border border-terminal-border bg-terminal-panel p-3 text-xs text-terminal-muted">
            No pending changes. The monitor proposes status changes here for you to accept or
            override — nothing changes silently.
          </p>
        ) : (
          <div className="space-y-2">
            {data.proposals.map((p) => (
              <div
                key={p.id}
                className={`rounded-lg border bg-terminal-panel p-3 ${
                  p.alert ? "border-status-concern/60" : "border-terminal-border"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      {p.alert && (
                        <span className="rounded bg-status-concern/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-status-concern">
                          Alert · Tier {p.tier}
                        </span>
                      )}
                      <span className="font-medium text-terminal-text">{p.signalName}</span>
                    </div>
                    <div className="mt-1 text-xs text-terminal-muted">
                      <StatusPill status={p.fromStatus} /> →{" "}
                      <StatusPill status={p.toStatus} /> · confidence{" "}
                      {Math.round(p.confidence * 100)}%
                    </div>
                    <p className="mt-1 text-xs text-terminal-text">{p.reasoning}</p>
                    {p.sourceUrl && (
                      <a
                        href={p.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-sky-400 underline underline-offset-2"
                      >
                        source
                      </a>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      onClick={() => resolve(p.id, "accept")}
                      disabled={busyId === p.id}
                      className="rounded bg-status-achieved/20 px-2.5 py-1 text-xs font-semibold text-status-achieved disabled:opacity-40"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => resolve(p.id, "reject")}
                      disabled={busyId === p.id}
                      className="rounded bg-terminal-border px-2.5 py-1 text-xs font-semibold text-terminal-muted disabled:opacity-40"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Audit trail */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-terminal-muted">
          Audit trail
        </h3>
        {data.audit.length === 0 ? (
          <p className="text-xs text-terminal-muted">No history yet.</p>
        ) : (
          <ul className="space-y-1">
            {data.audit.slice(0, 12).map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-2 rounded border border-terminal-border bg-terminal-panel px-3 py-1.5 text-[11px]"
              >
                <span className="text-terminal-muted">{new Date(a.at).toLocaleDateString()}</span>
                <TypeBadge type={a.type} />
                <span className="truncate text-terminal-text">{a.signalName}</span>
                {a.fromStatus && a.toStatus && (
                  <span className="ml-auto shrink-0 text-terminal-muted">
                    {a.fromStatus} → {a.toStatus}
                  </span>
                )}
                <span className="shrink-0 text-terminal-muted">· {a.by}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === "ACHIEVED"
      ? "text-status-achieved"
      : status === "DEVELOPING"
      ? "text-status-developing"
      : status === "CONCERN"
      ? "text-status-concern"
      : "text-status-watching";
  return <span className={`font-semibold ${color}`}>{status}</span>;
}

function TypeBadge({ type }: { type: AuditEntry["type"] }) {
  const map: Record<AuditEntry["type"], string> = {
    proposed: "bg-status-developing/20 text-status-developing",
    accepted: "bg-status-achieved/20 text-status-achieved",
    rejected: "bg-terminal-border text-terminal-muted",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${map[type]}`}>
      {type}
    </span>
  );
}
