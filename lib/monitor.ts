import Anthropic from "@anthropic-ai/sdk";
import { framework, applyStatuses, defaultStatusMap } from "./framework";
import { kvGet, kvSet, getSignalStatuses, setSignalStatuses } from "./kv";
import type {
  Signal,
  SignalStatus,
  MonitorProposal,
  AuditEntry,
  KnowledgeEntry,
  MonitorRunSummary,
} from "./types";

const MODEL = "claude-sonnet-4-6";
const VALID: SignalStatus[] = ["WATCHING", "DEVELOPING", "ACHIEVED", "CONCERN"];

export const PROPOSALS_KEY = "monitor:proposals";
export const AUDIT_KEY = "monitor:audit";
export const KNOWLEDGE_KEY = "monitor:knowledge";
export const LASTRUN_KEY = "monitor:lastRun";

const AUDIT_CAP = 200;
const KNOWLEDGE_PER_SIGNAL_CAP = 24; // ~ a couple of years of daily/weekly context
const PROPOSE_CONFIDENCE_THRESHOLD = 0.55;

// Definitive re-rating triggers that should fire an immediate alert.
const DEFINITIVE_ALERT_SIGNALS = new Set(["tsla_optimus_building_optimus", "merger_sec_8k"]);

const COMPANY_GROUPS = ["tesla", "google", "spacex", "merger"];

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isAlertSignal(s: Signal): boolean {
  return s.tier === 3 || DEFINITIVE_ALERT_SIGNALS.has(s.id);
}

interface RawAssessment {
  signalId: string;
  status: SignalStatus;
  confidence: number;
  reasoning: string;
  sourceUrl?: string;
}

function buildPrompt(companyId: string, signals: Signal[]): string {
  const company = framework.companies.find((c) => c.id === companyId);
  const lines = signals
    .map(
      (s) =>
        `- id: ${s.id} | tier ${s.tier} | current status: ${s.status} | "${s.name}" | watch: ${s.watch}`
    )
    .join("\n");

  return `You are the automated daily monitor for a long-horizon investment dashboard. Assess the following ${company?.name ?? companyId} signals against the LATEST real-world information. Use web_search to ground every judgement in current sources (prefer the last few weeks).

SIGNALS:
${lines}

For EACH signal, decide the status best supported by current evidence, choosing from: WATCHING (no movement / default), DEVELOPING (early evidence forming), ACHIEVED (the criterion is met), CONCERN (evidence is negative / deteriorating).

Return ONLY a JSON array (no prose outside it), each element:
{"signalId": "<id>", "status": "<one of the four>", "confidence": <0..1>, "reasoning": "<one sentence>", "sourceUrl": "<url or empty>"}

Be conservative: only move OFF the current status when evidence genuinely supports it, and set confidence accordingly. This is monitoring, not advice.`;
}

function extractJsonArray(text: string): RawAssessment[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? (parsed as RawAssessment[]) : [];
  } catch {
    return [];
  }
}

async function analyseCompany(
  client: Anthropic,
  companyId: string,
  signals: Signal[]
): Promise<RawAssessment[]> {
  const group = signals.filter((s) => s.company === companyId);
  if (group.length === 0) return [];

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system:
      "You output strictly valid JSON arrays for a monitoring pipeline. Ground claims in web_search results.",
    tools: [
      { type: "web_search_20250305", name: "web_search", max_uses: 4 } as unknown as Anthropic.Tool,
    ],
    messages: [{ role: "user", content: buildPrompt(companyId, group) }],
  });

  let text = "";
  for (const block of message.content as unknown as Array<Record<string, unknown>>) {
    if (block.type === "text" && typeof block.text === "string") text += block.text;
  }
  return extractJsonArray(text);
}

export async function getProposals(): Promise<MonitorProposal[]> {
  return (await kvGet<MonitorProposal[]>(PROPOSALS_KEY)) ?? [];
}

export async function getAudit(): Promise<AuditEntry[]> {
  return (await kvGet<AuditEntry[]>(AUDIT_KEY)) ?? [];
}

async function appendAudit(entries: AuditEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const existing = await getAudit();
  const merged = [...entries, ...existing].slice(0, AUDIT_CAP);
  await kvSet(AUDIT_KEY, merged);
}

async function appendKnowledge(signalId: string, entry: KnowledgeEntry): Promise<void> {
  const store = (await kvGet<Record<string, KnowledgeEntry[]>>(KNOWLEDGE_KEY)) ?? {};
  const list = store[signalId] ?? [];
  store[signalId] = [entry, ...list].slice(0, KNOWLEDGE_PER_SIGNAL_CAP);
  await kvSet(KNOWLEDGE_KEY, store);
}

async function sendSlackAlert(proposals: MonitorProposal[]): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url || proposals.length === 0) return;
  const text =
    "🚨 *Investment monitor — definitive signal movement*\n" +
    proposals
      .map((p) => `• [#${p.signalName}] ${p.fromStatus} → ${p.toStatus} — ${p.reasoning}`)
      .join("\n");
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch {
    /* best-effort */
  }
}

/**
 * Run the daily monitor. Analyses every company in parallel, records knowledge
 * time-series for context, and turns genuine status changes into PENDING
 * proposals for human review (never silently mutates a status). Tier 3 /
 * definitive movements are flagged as alerts and optionally pushed to Slack.
 */
export async function runMonitor(): Promise<MonitorRunSummary> {
  const ranAt = new Date().toISOString();
  const errors: string[] = [];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const summary: MonitorRunSummary = {
      ranAt,
      companiesAnalysed: 0,
      proposalsCreated: 0,
      alerts: 0,
      errors: ["ANTHROPIC_API_KEY not configured"],
    };
    await kvSet(LASTRUN_KEY, summary);
    return summary;
  }

  const client = new Anthropic({ apiKey });
  const overrides = await getSignalStatuses();
  const signals = applyStatuses(overrides);
  const byId = new Map(signals.map((s) => [s.id, s]));

  const results = await Promise.all(
    COMPANY_GROUPS.map((id) =>
      analyseCompany(client, id, signals).catch((e) => {
        errors.push(`${id}: ${e instanceof Error ? e.message : "failed"}`);
        return [] as RawAssessment[];
      })
    )
  );

  const existingProposals = await getProposals();
  const pendingSignalIds = new Set(existingProposals.map((p) => p.signalId));
  const newProposals: MonitorProposal[] = [];
  const newAudit: AuditEntry[] = [];

  for (const assessment of results.flat()) {
    const signal = byId.get(assessment.signalId);
    if (!signal) continue;
    const status = assessment.status;
    if (!VALID.includes(status)) continue;

    // Knowledge time-series accumulates every run, change or not.
    await appendKnowledge(signal.id, {
      at: ranAt,
      status,
      confidence: assessment.confidence ?? 0,
      note: assessment.reasoning ?? "",
      sourceUrl: assessment.sourceUrl,
    });

    const changed = status !== signal.status;
    const confident = (assessment.confidence ?? 0) >= PROPOSE_CONFIDENCE_THRESHOLD;
    if (!changed || !confident) continue;
    if (pendingSignalIds.has(signal.id)) continue; // don't stack duplicate proposals

    const proposal: MonitorProposal = {
      id: uid("prop"),
      signalId: signal.id,
      signalName: signal.name,
      company: signal.company,
      tier: signal.tier,
      fromStatus: signal.status,
      toStatus: status,
      confidence: Number((assessment.confidence ?? 0).toFixed(2)),
      reasoning: assessment.reasoning ?? "",
      sourceUrl: assessment.sourceUrl ?? "",
      createdAt: ranAt,
      alert: isAlertSignal(signal),
    };
    newProposals.push(proposal);
    pendingSignalIds.add(signal.id);
    newAudit.push({
      id: uid("aud"),
      at: ranAt,
      signalId: signal.id,
      signalName: signal.name,
      type: "proposed",
      fromStatus: proposal.fromStatus,
      toStatus: proposal.toStatus,
      reasoning: proposal.reasoning,
      sourceUrl: proposal.sourceUrl,
      by: "monitor",
    });
  }

  if (newProposals.length > 0) {
    await kvSet(PROPOSALS_KEY, [...newProposals, ...existingProposals]);
    await appendAudit(newAudit);
  }

  const alerts = newProposals.filter((p) => p.alert);
  await sendSlackAlert(alerts);

  const summary: MonitorRunSummary = {
    ranAt,
    companiesAnalysed: COMPANY_GROUPS.length - errors.length,
    proposalsCreated: newProposals.length,
    alerts: alerts.length,
    errors,
  };
  await kvSet(LASTRUN_KEY, summary);
  return summary;
}

/** Apply a pending proposal to the signal-status map (human accepted it). */
export async function acceptProposal(proposalId: string): Promise<boolean> {
  const proposals = await getProposals();
  const proposal = proposals.find((p) => p.id === proposalId);
  if (!proposal) return false;

  const current = await getSignalStatuses();
  const merged = { ...defaultStatusMap(), ...current, [proposal.signalId]: proposal.toStatus };
  await setSignalStatuses(merged);
  await kvSet(
    PROPOSALS_KEY,
    proposals.filter((p) => p.id !== proposalId)
  );
  await appendAudit([
    {
      id: uid("aud"),
      at: new Date().toISOString(),
      signalId: proposal.signalId,
      signalName: proposal.signalName,
      type: "accepted",
      fromStatus: proposal.fromStatus,
      toStatus: proposal.toStatus,
      reasoning: proposal.reasoning,
      sourceUrl: proposal.sourceUrl,
      by: "user",
    },
  ]);
  return true;
}

/** Dismiss a pending proposal without changing the signal (human override). */
export async function rejectProposal(proposalId: string): Promise<boolean> {
  const proposals = await getProposals();
  const proposal = proposals.find((p) => p.id === proposalId);
  if (!proposal) return false;

  await kvSet(
    PROPOSALS_KEY,
    proposals.filter((p) => p.id !== proposalId)
  );
  await appendAudit([
    {
      id: uid("aud"),
      at: new Date().toISOString(),
      signalId: proposal.signalId,
      signalName: proposal.signalName,
      type: "rejected",
      fromStatus: proposal.fromStatus,
      toStatus: proposal.toStatus,
      reasoning: proposal.reasoning,
      sourceUrl: proposal.sourceUrl,
      by: "user",
    },
  ]);
  return true;
}

export async function getLastRun(): Promise<MonitorRunSummary | null> {
  return kvGet<MonitorRunSummary>(LASTRUN_KEY);
}
