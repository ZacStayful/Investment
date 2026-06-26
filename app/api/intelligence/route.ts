import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { framework, principlesPreamble } from "@/lib/framework";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30-minute server cache

// Simple in-memory cache (per serverless instance). Good enough for the
// 30-min freshness window the framework specifies.
const cache = new Map<string, { at: number; answer: string; citations: string[] }>();

function buildSystemPrompt(): string {
  const signalLines = framework.signals
    .map((s) => `  - [#${s.number} ${s.id}] (${s.company}, tier ${s.tier}, status ${s.status}) ${s.name} — watch: ${s.watch}`)
    .join("\n");

  return `${principlesPreamble()}

You are the intelligence engine for a long-horizon (30+ year) investment monitoring dashboard. This is a MONITORING AND DECISION-SUPPORT tool, NOT financial advice. Never tell the user to buy or sell. The human makes every final decision. Anchor findings to MILESTONE EVIDENCE, not price or narrative; a rising price with slipping milestones is a WARNING, not a celebration. Treat every model figure as a contingent scenario, not a forecast.

FRAMEWORK VERSION: ${framework.version} (as of ${framework.asOf}).

PORTFOLIO: A concentrated 3-position portfolio — Tesla (TSLA, primary/overweight), Alphabet (GOOGL, quality anchor), SpaceX (SPCX, entry deferred until Q4 2027+), plus an S&P 500 index floor (25% minimum, never reduced). Rebalancing is done ONLY by directing new contributions — never by selling.

KEY THESES:
- Tesla: high-dexterity premium-task robotics. The compounding asset is the self-improving factory (Optimus is its output). Moat = 22-DoF hand + FSD data flywheel + recursive factory loop. Cost-inversion crossover ~2029. Watch open-source VLA reaching dexterity parity.
- Google: TPU vertical integration + Wiz multicloud security + DeepMind/Isomorphic optionality. Quality anchor, ~10-11% CAGR by design. Primary risk: Azure enterprise bundling.
- SpaceX: publicly listed since June 2026 (~$1.75T IPO). Entry DEFERRED. Three unmet entry criteria: valuation compression, cash-burn normalisation (<$1B/qtr), and a second AI compute contract beyond Anthropic.
- Tesla–SpaceX merger is an UPSIDE catalyst. In an all-stock deal the acquirer's (Tesla's) shareholders get the target at a discount, so the merger thesis argues FOR holding Tesla, not rotating into SpaceX. Treat Tesla+SpaceX as a single combined-exposure metric (correlated key-person risk).

THE 21 MONITORED SIGNALS (map findings to these by id and name):
${signalLines}

RESPONSE FORMAT (follow exactly):
1. Lead with the NEW information you found (be specific, cite sources).
2. Map each relevant finding to a NAMED signal (use its #number and name) and state what status it implies (WATCHING / DEVELOPING / ACHIEVED / CONCERN).
3. End with a single line beginning "PORTFOLIO IMPLICATION:" classified as ACCELERATE, MAINTAIN, or THREATEN, with one sentence of reasoning.

Be concise and factual. Use web search to ground claims in current data. If you cannot verify something, say so rather than speculating.`;
}

interface AnthropicWebSearchResult { url?: string; title?: string }

function extractAnswer(blocks: unknown[]): { answer: string; citations: string[] } {
  let answer = "";
  const citations = new Set<string>();
  for (const block of blocks as Array<Record<string, unknown>>) {
    if (block.type === "text" && typeof block.text === "string") {
      answer += block.text;
      // citations attached to text blocks
      const cites = (block.citations ?? []) as Array<Record<string, unknown>>;
      for (const c of cites) {
        if (typeof c.url === "string") citations.add(c.url);
      }
    }
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content as AnthropicWebSearchResult[]) {
        if (r.url) citations.add(r.url);
      }
    }
  }
  return { answer: answer.trim(), citations: Array.from(citations) };
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 503 }
    );
  }

  let body: { query?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const query = (body.query ?? "").trim();
  if (!query) {
    return NextResponse.json({ error: "Body requires { query }" }, { status: 400 });
  }

  const cacheKey = query.toLowerCase();
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json({ answer: hit.answer, citations: hit.citations, cached: true });
  }

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1000,
      system: buildSystemPrompt(),
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 5,
        } as unknown as Anthropic.Tool,
      ],
      messages: [{ role: "user", content: query }],
    });

    const { answer, citations } = extractAnswer(message.content as unknown[]);
    const result = { answer: answer || "(no text returned)", citations };
    cache.set(cacheKey, { at: Date.now(), ...result });

    return NextResponse.json({ ...result, cached: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Intelligence query failed: ${msg}` }, { status: 502 });
  }
}
