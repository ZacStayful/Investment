"use client";

import { useEffect, useState } from "react";
import type {
  ThesisBreakResult,
  ThesisDecision,
  BreakTrigger,
  FiredTrigger,
  ThesisHealth,
  CompanyThesisAssessment,
} from "@/lib/types";

interface Data {
  assessment: ThesisBreakResult | null;
  decisions: ThesisDecision[];
  triggers: BreakTrigger[];
  exitDiscipline: { definedAt: string; concentrationThresholdPct: number; principle3: string };
}

const HEALTH_STYLE: Record<ThesisHealth, string> = {
  OK: "text-status-achieved border-status-achieved/30",
  MONITOR: "text-status-watching border-terminal-border",
  PREPARE: "text-status-developing border-status-developing/40",
  BREAK: "text-status-concern border-status-concern/40",
};

const SEV_STYLE: Record<string, string> = {
  yellow: "bg-status-developing/15 text-status-developing",
  red: "bg-status-concern/15 text-status-concern",
  broken: "bg-status-concern/25 text-status-concern",
};

export default function ExitDisciplinePanel() {
  const [data, setData] = useState<Data | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/thesis-break")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setError("Could not load exit-discipline state"));
  }, []);

  async function runCheck() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/thesis-break", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run" }),
      });
      const d = await res.json();
      if (d.error) setError(d.error);
      else setData((prev) => (prev ? { ...prev, assessment: d.assessment, decisions: d.decisions } : prev));
    } catch {
      setError("Check failed");
    } finally {
      setRunning(false);
    }
  }

  async function decide(triggerId: string, company: string, decision: "follow" | "override", reasoning: string) {
    const res = await fetch("/api/thesis-break", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "decide", triggerId, company, decision, reasoning }),
    });
    const d = await res.json();
    if (d.decisions) setData((prev) => (prev ? { ...prev, decisions: d.decisions } : prev));
  }

  if (error) return <p className="text-sm text-status-concern">{error}</p>;
  if (!data) return <p className="text-sm text-terminal-muted">Loading exit discipline…</p>;

  const a = data.assessment;
  const firedAll: FiredTrigger[] = a ? a.companies.flatMap((c) => c.firedTriggers) : [];

  return (
    <div className="space-y-4">
      {/* Control bar + concentration meter */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-terminal-border bg-terminal-panel p-3 text-xs">
        <button
          onClick={runCheck}
          disabled={running}
          className="rounded-md bg-terminal-text px-3 py-1.5 font-semibold text-terminal-bg disabled:opacity-40"
        >
          {running ? "Assessing…" : "Run thesis-break check"}
        </button>
        <span className="text-terminal-muted">
          {a ? `Last run ${new Date(a.ranAt).toLocaleString()}` : "Not yet run · also runs in the daily cron"}
        </span>
        {a && <ConcentrationMeter c={a.concentration} />}
      </div>

      {/* Portfolio-level alerts */}
      {a && a.portfolioAlerts.length > 0 && (
        <div className="space-y-1">
          {a.portfolioAlerts.map((al, i) => (
            <p
              key={i}
              className="rounded-md border border-status-developing/40 bg-status-developing/10 px-3 py-2 text-xs text-status-developing"
            >
              {al}
            </p>
          ))}
        </div>
      )}

      {/* Thesis health by holding */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-terminal-muted">
          Thesis health by holding
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(a?.companies ?? []).map((c) => (
            <HealthCard key={c.company} c={c} />
          ))}
          {!a && <p className="text-xs text-terminal-muted">Run a check to populate.</p>}
        </div>
      </div>

      {/* Active break conditions */}
      {firedAll.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-terminal-muted">
            Active break conditions ({firedAll.length})
          </h3>
          <div className="space-y-2">
            {a!.companies.flatMap((c) =>
              c.firedTriggers.map((f) => (
                <FiredCard
                  key={`${f.company}-${f.triggerId}-${f.correlatedFire ? "c" : ""}`}
                  f={f}
                  redeploymentTarget={c.redeploymentTarget}
                  onDecide={decide}
                />
              ))
            )}
          </div>
        </div>
      )}
      {a && firedAll.length === 0 && (
        <p className="rounded-md border border-status-achieved/30 bg-status-achieved/5 p-3 text-xs text-terminal-muted">
          No break conditions are currently firing. This engine fires on thesis deterioration, not
          price movement — a falling price with an intact thesis is an opportunity, not a break.
        </p>
      )}

      {/* Pre-commitment ledger */}
      <details className="rounded-lg border border-terminal-border bg-terminal-panel p-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-widest text-terminal-muted">
          Pre-commitment ledger — {data.triggers.length} rules defined in calm conditions ({data.exitDiscipline.definedAt})
        </summary>
        <p className="mt-2 text-[11px] italic text-terminal-muted">
          You defined these when thinking clearly. In a drawdown, this is what you decided.
        </p>
        <div className="mt-2 space-y-1.5">
          {data.triggers.map((t) => (
            <div key={t.id} className="rounded border border-terminal-border bg-terminal-bg p-2 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-terminal-text">
                  {t.id} · {t.pillar}
                </span>
                <span className="uppercase text-terminal-muted">{t.maxSeverity}</span>
              </div>
              <div className="text-terminal-muted">{t.condition}</div>
              <div className="mt-0.5 text-terminal-text">↳ {t.precommittedResponse}</div>
            </div>
          ))}
        </div>
      </details>

      {/* Decision log */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-terminal-muted">
          Decision log
        </h3>
        {data.decisions.length === 0 ? (
          <p className="text-xs text-terminal-muted">
            When a trigger fires, record whether you followed or overrode the pre-committed response,
            and why. Builds an accountability trail.
          </p>
        ) : (
          <ul className="space-y-1">
            {data.decisions.slice(0, 12).map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-2 rounded border border-terminal-border bg-terminal-panel px-3 py-1.5 text-[11px]"
              >
                <span className="text-terminal-muted">{new Date(d.at).toLocaleDateString()}</span>
                <span
                  className={`rounded px-1.5 py-0.5 font-semibold uppercase ${
                    d.decision === "follow"
                      ? "bg-status-achieved/20 text-status-achieved"
                      : "bg-status-developing/20 text-status-developing"
                  }`}
                >
                  {d.decision}
                </span>
                <span className="text-terminal-text">{d.triggerId}</span>
                {d.reasoning && <span className="text-terminal-muted">— {d.reasoning}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-terminal-muted">
        The engine forces the question; you make the call. It never auto-sells, never treats a price
        drop as a break, and never resolves temporary-vs-structural for you — it presents both sides
        and surfaces what you pre-committed to. Redeployment is to the strongest surviving holding or
        the S&amp;P 500 floor, never to cash.
      </p>
    </div>
  );
}

function ConcentrationMeter({ c }: { c: ThesisBreakResult["concentration"] }) {
  return (
    <span className="ml-auto flex items-center gap-2">
      <span className="text-terminal-muted">Tesla+SpaceX</span>
      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-terminal-border">
        <span
          className={`block h-full ${c.escalating ? "bg-status-concern" : "bg-status-developing"}`}
          style={{ width: `${Math.min(100, c.teslaSpacexPct)}%` }}
        />
      </span>
      <span className={c.escalating ? "text-status-concern" : "text-terminal-text"}>
        {c.teslaSpacexPct}% / {c.thresholdPct}%
      </span>
      {c.escalating && <span className="font-semibold text-status-concern">escalating</span>}
    </span>
  );
}

function HealthCard({ c }: { c: CompanyThesisAssessment }) {
  return (
    <div className={`rounded-lg border bg-terminal-panel p-3 ${HEALTH_STYLE[c.health]}`}>
      <div className="text-sm font-semibold text-terminal-text">{c.name}</div>
      <div className={`text-lg font-bold ${HEALTH_STYLE[c.health].split(" ")[0]}`}>{c.health}</div>
      <div className="text-[11px] text-terminal-muted">
        {c.firedCount} fired{c.firedCount > 0 ? ` (${c.redCount}R/${c.yellowCount}Y/${c.brokenCount}B)` : ""}
      </div>
    </div>
  );
}

function FiredCard({
  f,
  redeploymentTarget,
  onDecide,
}: {
  f: FiredTrigger;
  redeploymentTarget: string | null;
  onDecide: (triggerId: string, company: string, decision: "follow" | "override", reasoning: string) => void;
}) {
  const [reasoning, setReasoning] = useState("");
  const [done, setDone] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-terminal-border bg-terminal-panel p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${SEV_STYLE[f.severity]}`}>
          {f.severity}
        </span>
        <span className="text-sm font-semibold text-terminal-text">
          {f.triggerId} · {f.pillar}
        </span>
        {f.escalated && (
          <span className="rounded bg-status-concern/15 px-1.5 py-0.5 text-[10px] text-status-concern">
            escalated (concentration)
          </span>
        )}
        {f.correlatedFire && (
          <span className="rounded bg-status-developing/15 px-1.5 py-0.5 text-[10px] text-status-developing">
            correlated key-person
          </span>
        )}
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded bg-status-concern/5 p-2 text-[11px]">
          <div className="mb-0.5 font-semibold text-status-concern">Evidence it&apos;s structural</div>
          <div className="text-terminal-text">{f.evidenceFor || "—"}</div>
        </div>
        <div className="rounded bg-status-achieved/5 p-2 text-[11px]">
          <div className="mb-0.5 font-semibold text-status-achieved">Evidence it&apos;s temporary</div>
          <div className="text-terminal-text">{f.evidenceAgainst || "—"}</div>
        </div>
      </div>

      <p className="mt-2 text-[11px] text-terminal-muted">
        <span className="font-semibold text-terminal-text">Ask:</span> {f.temporaryVsStructuralTest}
      </p>
      <p className="mt-1 text-[11px] text-terminal-text">
        <span className="font-semibold">Pre-committed response:</span> {f.precommittedResponse}
      </p>
      {redeploymentTarget && (
        <p className="mt-1 text-[11px] text-terminal-muted">
          <span className="font-semibold text-terminal-text">Redeploy to:</span> {redeploymentTarget}
        </p>
      )}
      {f.sourceUrl && (
        <a
          href={f.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-sky-400 underline underline-offset-2"
        >
          source
        </a>
      )}

      {/* You decide */}
      {done ? (
        <p className="mt-2 text-[11px] text-status-achieved">Recorded: {done}.</p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={reasoning}
            onChange={(e) => setReasoning(e.target.value)}
            placeholder="Your reasoning (temporary or structural?)…"
            className="flex-1 rounded border border-terminal-border bg-terminal-bg px-2 py-1 text-[11px] text-terminal-text placeholder:text-terminal-muted"
          />
          <button
            onClick={() => {
              onDecide(f.triggerId, f.company, "follow", reasoning);
              setDone("followed pre-commitment");
            }}
            className="rounded bg-status-achieved/20 px-2.5 py-1 text-[11px] font-semibold text-status-achieved"
          >
            Follow
          </button>
          <button
            onClick={() => {
              onDecide(f.triggerId, f.company, "override", reasoning);
              setDone("overrode (hold/examine)");
            }}
            className="rounded bg-status-developing/20 px-2.5 py-1 text-[11px] font-semibold text-status-developing"
          >
            Override
          </button>
        </div>
      )}
    </div>
  );
}
