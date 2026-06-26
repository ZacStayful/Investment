import Anthropic from "@anthropic-ai/sdk";
import { framework, applyStatuses, principlesPreamble } from "./framework";
import { computeCompanyOutlook } from "./outlook";
import { kvGet, kvSet, getSignalStatuses } from "./kv";
import { getCurrentBalances } from "./holdings";
import type {
  Signal,
  BreakTrigger,
  BreakSeverity,
  FiredTrigger,
  ThesisHealth,
  CompanyThesisAssessment,
  ThesisBreakResult,
  ThesisDecision,
} from "./types";

const MODEL = "claude-sonnet-4-6";
export const ASSESSMENT_KEY = "thesis:assessment";
export const DECISIONS_KEY = "thesis:decisions";
const DECISIONS_CAP = 200;

const SEVERITY_ORDER: BreakSeverity[] = ["yellow", "red", "broken"];
const COMPANY_GROUPS = ["tesla", "google", "spacex", "merger"];
const NAMES: Record<string, string> = {
  tesla: "Tesla",
  google: "Google",
  spacex: "SpaceX",
  merger: "Merger / structural",
};

export function getBreakTriggers(): BreakTrigger[] {
  return (framework as unknown as { breakTriggers: BreakTrigger[] }).breakTriggers ?? [];
}

function exitConfig() {
  return (framework as unknown as {
    exitDiscipline: { concentrationThresholdPct: number; definedAt: string };
  }).exitDiscipline;
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function escalate(sev: BreakSeverity): BreakSeverity {
  const i = SEVERITY_ORDER.indexOf(sev);
  return SEVERITY_ORDER[Math.min(i + 1, SEVERITY_ORDER.length - 1)];
}

function healthFrom(yellow: number, red: number, broken: number): ThesisHealth {
  if (broken >= 1 || red >= 2) return "BREAK";
  if (red >= 1 || yellow >= 2) return "PREPARE";
  if (yellow >= 1) return "MONITOR";
  return "OK";
}

interface RawTriggerAssessment {
  triggerId: string;
  fired: boolean;
  severity: BreakSeverity;
  evidenceFor: string;
  evidenceAgainst: string;
  sourceUrl?: string;
}

function buildPrompt(company: string, triggers: BreakTrigger[], signals: Signal[]): string {
  const sigLines = signals
    .filter((s) => s.company === company)
    .map((s) => `  - ${s.name}: ${s.status}`)
    .join("\n");
  const trigLines = triggers
    .map(
      (t) =>
        `- ${t.id} [pillar: ${t.pillar}] condition: ${t.condition} | severity scale: ${t.severityRule} | temporary-vs-structural test: ${t.temporaryVsStructuralTest}`
    )
    .join("\n");

  return `You are the THESIS-BREAK monitor for ${NAMES[company] ?? company}. You assess whether pre-defined THESIS-deterioration conditions have fired, using the LATEST evidence (use web_search).

CRITICAL RULES:
- Fire ONLY on thesis deterioration, NEVER on price movement alone. A falling price with an intact thesis is NOT a break.
- Do NOT conclude the temporary-vs-structural question. Gather evidence BOTH ways and present both. The human decides.
- Be conservative: only mark fired:true when current evidence genuinely supports the condition.

CURRENT SIGNAL STATES:
${sigLines || "  (none)"}

BREAK CONDITIONS TO EVALUATE:
${trigLines}

For EACH condition return an object:
{"triggerId":"<id>","fired":<true|false>,"severity":"yellow|red|broken","evidenceFor":"<one sentence of evidence the break is STRUCTURAL>","evidenceAgainst":"<one sentence of evidence it is TEMPORARY / thesis intact>","sourceUrl":"<url or empty>"}

Return ONLY a JSON array. severity should reflect the condition's own scale; when not fired, still give your best severity-if-it-were and keep fired:false.`;
}

function extractJsonArray(text: string): RawTriggerAssessment[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? (parsed as RawTriggerAssessment[]) : [];
  } catch {
    return [];
  }
}

async function assessCompany(
  client: Anthropic,
  company: string,
  triggers: BreakTrigger[],
  signals: Signal[]
): Promise<RawTriggerAssessment[]> {
  if (triggers.length === 0) return [];
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system:
      principlesPreamble() +
      "\n\nYou output strictly valid JSON arrays for a thesis-break pipeline. Ground claims in web_search. Never conclude temporary-vs-structural; present both sides. Never treat price drops as breaks — fire only on milestone/thesis deterioration.",
    tools: [
      { type: "web_search_20250305", name: "web_search", max_uses: 4 } as unknown as Anthropic.Tool,
    ],
    messages: [{ role: "user", content: buildPrompt(company, triggers, signals) }],
  });
  let text = "";
  for (const block of message.content as unknown as Array<Record<string, unknown>>) {
    if (block.type === "text" && typeof block.text === "string") text += block.text;
  }
  return extractJsonArray(text);
}

/** Strongest surviving holding by outlook likelihood, else the S&P 500 floor. */
function redeploymentTarget(
  exclude: string,
  brokenCompanies: Set<string>,
  signals: Signal[]
): string {
  const candidates = ["tesla", "google", "sp500"].filter(
    (c) => c !== exclude && !brokenCompanies.has(c)
  );
  let best: { id: string; likelihood: number } | null = null;
  for (const c of candidates) {
    const o = computeCompanyOutlook(c, signals);
    if (!best || o.likelihoodPct > best.likelihood) best = { id: c, likelihood: o.likelihoodPct };
  }
  if (!best || best.id === "sp500") return "S&P 500 floor (no stronger survivor) — never cash";
  return `${NAMES[best.id] ?? best.id} (strongest surviving holding, ${best.likelihood}% likely) — never cash`;
}

export async function runThesisBreak(): Promise<ThesisBreakResult> {
  const ranAt = new Date().toISOString();
  const errors: string[] = [];
  const triggers = getBreakTriggers();
  const cfg = exitConfig();

  const signals = applyStatuses(await getSignalStatuses());

  // Concentration from live holdings.
  let teslaSpacexPct = 0;
  try {
    const balances = await getCurrentBalances();
    const total = balances.tesla + balances.google + balances.spacex + balances.sp500;
    teslaSpacexPct = total > 0 ? ((balances.tesla + balances.spacex) / total) * 100 : 0;
  } catch {
    /* leave 0 */
  }
  const escalating = teslaSpacexPct > cfg.concentrationThresholdPct;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const rawByCompany: Record<string, RawTriggerAssessment[]> = {};

  if (apiKey) {
    const client = new Anthropic({ apiKey });
    const results = await Promise.all(
      COMPANY_GROUPS.map((c) =>
        assessCompany(
          client,
          c,
          triggers.filter((t) => t.company === c),
          signals
        ).catch((e) => {
          errors.push(`${c}: ${e instanceof Error ? e.message : "failed"}`);
          return [] as RawTriggerAssessment[];
        })
      )
    );
    COMPANY_GROUPS.forEach((c, i) => (rawByCompany[c] = results[i]));
  } else {
    errors.push("ANTHROPIC_API_KEY not configured — no live assessment run");
  }

  const triggerById = new Map(triggers.map((t) => [t.id, t]));
  const firedByCompany: Record<string, FiredTrigger[]> = {};
  for (const c of COMPANY_GROUPS) firedByCompany[c] = [];

  for (const c of COMPANY_GROUPS) {
    for (const raw of rawByCompany[c] ?? []) {
      if (!raw.fired) continue;
      const def = triggerById.get(raw.triggerId);
      if (!def) continue;
      let severity: BreakSeverity = SEVERITY_ORDER.includes(raw.severity) ? raw.severity : "yellow";
      let wasEscalated = false;
      if (escalating && (c === "tesla" || c === "spacex")) {
        const up = escalate(severity);
        if (up !== severity) {
          severity = up;
          wasEscalated = true;
        }
      }
      firedByCompany[c].push({
        triggerId: def.id,
        company: c,
        pillar: def.pillar,
        severity,
        evidenceFor: raw.evidenceFor ?? "",
        evidenceAgainst: raw.evidenceAgainst ?? "",
        sourceUrl: raw.sourceUrl ?? "",
        precommittedResponse: def.precommittedResponse,
        temporaryVsStructuralTest: def.temporaryVsStructuralTest,
        escalated: wasEscalated,
      });
    }
  }

  // Correlation: key-person (T-B6) fires SpaceX too.
  const teslaKeyPerson = firedByCompany.tesla.find((f) => f.triggerId === "T-B6");
  if (teslaKeyPerson) {
    firedByCompany.spacex.push({
      ...teslaKeyPerson,
      company: "spacex",
      correlatedFire: true,
      precommittedResponse:
        "Correlated key-person event from Tesla T-B6 — shared Musk risk hits SpaceX simultaneously. Assess combined Tesla+SpaceX exposure as one.",
    });
  }

  const portfolioAlerts: string[] = [];
  if (escalating) {
    portfolioAlerts.push(
      `Combined Tesla+SpaceX exposure is ${teslaSpacexPct.toFixed(0)}% (> ${cfg.concentrationThresholdPct}% threshold) — every red trigger on either is escalated one severity level; diversification no longer provides a safety margin.`
    );
  }
  if (teslaKeyPerson) {
    portfolioAlerts.push(
      "Key-person trigger (T-B6) fired — this is a COMBINED Tesla+SpaceX event, not two independent ones. A single event can break ~70-80% of the concentrated portfolio at once."
    );
  }
  if (firedByCompany.merger.some((f) => f.triggerId === "M-B2")) {
    portfolioAlerts.push(
      "Forced-separation trigger (M-B2) fired — surface as a PORTFOLIO-LEVEL break: the recursive loop underpins both the Tesla cost-inversion and the orbital stack."
    );
  }

  // Determine broken companies first (for redeployment targeting).
  const counts = (fired: FiredTrigger[]) => ({
    yellow: fired.filter((f) => f.severity === "yellow").length,
    red: fired.filter((f) => f.severity === "red").length,
    broken: fired.filter((f) => f.severity === "broken").length,
  });
  const brokenCompanies = new Set<string>();
  for (const c of COMPANY_GROUPS) {
    const { yellow, red, broken } = counts(firedByCompany[c]);
    if (healthFrom(yellow, red, broken) === "BREAK") brokenCompanies.add(c);
  }

  const companies: CompanyThesisAssessment[] = COMPANY_GROUPS.map((c) => {
    const fired = firedByCompany[c];
    const { yellow, red, broken } = counts(fired);
    const health = healthFrom(yellow, red, broken);
    return {
      company: c,
      name: NAMES[c] ?? c,
      health,
      firedCount: fired.length,
      yellowCount: yellow,
      redCount: red,
      brokenCount: broken,
      firedTriggers: fired,
      redeploymentTarget:
        health === "PREPARE" || health === "BREAK"
          ? redeploymentTarget(c, brokenCompanies, signals)
          : null,
    };
  });

  const result: ThesisBreakResult = {
    ranAt,
    companies,
    concentration: {
      teslaSpacexPct: Number(teslaSpacexPct.toFixed(1)),
      thresholdPct: cfg.concentrationThresholdPct,
      escalating,
    },
    portfolioAlerts,
    errors,
  };
  await kvSet(ASSESSMENT_KEY, result);
  return result;
}

export async function getAssessment(): Promise<ThesisBreakResult | null> {
  return kvGet<ThesisBreakResult>(ASSESSMENT_KEY);
}

export async function getDecisions(): Promise<ThesisDecision[]> {
  return (await kvGet<ThesisDecision[]>(DECISIONS_KEY)) ?? [];
}

export async function addDecision(
  triggerId: string,
  company: string,
  decision: "follow" | "override",
  reasoning: string
): Promise<ThesisDecision> {
  const entry: ThesisDecision = {
    id: uid("dec"),
    at: new Date().toISOString(),
    triggerId,
    company,
    decision,
    reasoning,
    by: "user",
  };
  const existing = await getDecisions();
  await kvSet(DECISIONS_KEY, [entry, ...existing].slice(0, DECISIONS_CAP));
  return entry;
}
