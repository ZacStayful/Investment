import frameworkJson from "./framework.json";
import type { Framework, Signal, SignalStatus, SignalStatusMap } from "./types";

export const framework = frameworkJson as unknown as Framework;

export function getSignals(): Signal[] {
  return framework.signals;
}

export function getCompany(id: string) {
  return framework.companies.find((c) => c.id === id);
}

/**
 * Merge stored status overrides (from KV) onto the framework's default signal
 * definitions. Framework JSON remains the source of truth for everything except
 * the mutable status field, which the user/cron can change.
 */
export function applyStatuses(overrides: SignalStatusMap): Signal[] {
  return framework.signals.map((s) => {
    const override = overrides[s.id];
    return override && override !== s.status ? { ...s, status: override } : s;
  });
}

/** Loop-formation label from the count of Tesla signals at ACHIEVED. */
export function loopStatus(signals: Signal[]): {
  label: string;
  achievedCount: number;
  closing: boolean;
} {
  const teslaAchieved = signals.filter(
    (s) => s.company === "tesla" && s.status === "ACHIEVED"
  ).length;
  const match = framework.loopStatus.thresholds.find(
    (t) => teslaAchieved >= t.minAchieved && teslaAchieved <= t.maxAchieved
  );
  const closingSignal = signals.find((s) => s.id === framework.loopStatus.closingSignalId);
  return {
    label: match?.label ?? "PRE-FORMATION",
    achievedCount: teslaAchieved,
    closing: closingSignal?.status === "ACHIEVED",
  };
}

/** Default status map straight from the framework definitions. */
export function defaultStatusMap(): SignalStatusMap {
  return Object.fromEntries(framework.signals.map((s) => [s.id, s.status])) as SignalStatusMap;
}

interface GoverningPrinciples {
  tagline: string;
  principles: { n: number; title: string; text: string }[];
  concentrationDamagingThresholdPct: number;
  concentrationNote: string;
}

export function governingPrinciples(): GoverningPrinciples {
  return (framework as unknown as { governingPrinciples: GoverningPrinciples }).governingPrinciples;
}

/** Compact principles preamble injected into every AI system prompt so generated
 * content embodies the posture: discipline not prediction, milestones not price,
 * downside weighted equally, calm tone. */
export function principlesPreamble(): string {
  const gp = governingPrinciples();
  if (!gp) return "";
  return (
    "GOVERNING POSTURE (overrides any confident, thesis-forward language):\n" +
    gp.principles.map((p) => `${p.n}. ${p.title}: ${p.text}`).join("\n") +
    `\nKeep in view: ${gp.tagline}`
  );
}

export const STATUS_CYCLE: SignalStatus[] = ["WATCHING", "DEVELOPING", "ACHIEVED", "CONCERN"];

export function nextStatus(current: SignalStatus): SignalStatus {
  const idx = STATUS_CYCLE.indexOf(current);
  return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
}
