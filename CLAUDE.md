# CLAUDE.md — Repo Guardrails

Investment Intelligence Dashboard. Read `CLAUDE_CODE_PROJECT_GUIDE.md` for the
full build brief; it is the single source of truth for *what* is being built.
This file is the short list of *rules that must never be broken*.

## Governing posture (above everything)

`framework.json > governingPrinciples` is the posture the whole dashboard must
embody, and it overrides any confident, thesis-forward language elsewhere:
(1) discipline engine, not a prediction engine — every target/CAGR is a
contingent scenario shown bear/base/bull, never a forecast; (2) milestone
evidence governs capital decisions, never price or narrative; (3) downside
(exit) machinery surfaced with equal prominence to upside; (4) the concentrated
bets carry the dream, the S&P floor + operating business carry the future — flag
when being wrong would be damaging not just disappointing; (5) founder-led
companies are punished before vindication — examine, never auto-flee; (6) the
user is a person — calm tone, no hype or compulsive-checking. `principlesPreamble()`
injects these into every AI system prompt.

## Hard rules

1. **`lib/framework.json` is authoritative.** All signal definitions, thresholds,
   theses, return-model numbers and portfolio rules live there. Framework version
   bumps (V2.3 → V2.4 …) should be JSON edits, not component rewrites. Do not
   hardcode framework data inside components or routes — read it from the JSON.

2. **Never hardcode live market data.** Prices and market caps come from the
   `/api/marketcap` route (Financial Modeling Prep). The only acceptable static
   valuation is the framework *fallback* (e.g. thinly-traded SpaceX), and it must
   be labelled as a fallback in the UI.

3. **Never present output as financial advice.** This is a monitoring and
   decision-support tool. The AI intelligence response ends with a PORTFOLIO
   IMPLICATION classification (ACCELERATE / MAINTAIN / THREATEN), never a buy/sell
   instruction. The human makes every final decision.

4. **Preserve the no-selling rule.** Rebalancing is done only by directing new
   contributions. Nothing in this app should suggest selling to rebalance.

5. **Secrets stay server-side.** `ANTHROPIC_API_KEY` and `FMP_API_KEY` are only
   ever read in API routes (server). Never expose them to the client bundle.

6. **Human-in-the-loop for status changes.** Signal status changes are explicit
   (user click now; audited cron later in Phase 2). Never change a status silently
   without a viewable reason.

## Build phases

- **Phase 1 (done, deployed):** market-cap cards, signal board + KV persistence,
  portfolio tracker, AI intelligence query. `framework.json`, `/api/marketcap`,
  `/api/intelligence`, `/api/signals`.
- **Phase 2 (in progress):**
  - **Self-learning monitor** — `lib/monitor.ts` + `/api/cron/monitor`
    (Vercel Cron, MONTHLY 1st 07:00 UTC, `CRON_SECRET`-guarded) + `/api/monitor` (pending
    proposals, audit trail, accept/reject, manual run). Writes a knowledge
    time-series to KV; proposes status changes for human review (never mutates a
    status silently); Tier 3 / definitive movements flag as alerts (optional
    `SLACK_WEBHOOK_URL`).
  - **Dynamic return & likelihood** — `lib/outlook.ts` derives an adjusted annual
    return + probability-of-achieving per position from the live signal board
    (transparent heuristic; Tier 3 weighted 4× Tier 1). Feeds the blended rate
    into the tracker. Surfaced in `components/OutlookPanel.tsx`.
  - **Adjustable contribution** — the portfolio tracker takes a variable monthly
    contribution (slider + exact input) above/below the £1,500 baseline.
  - **Capital allocation advisor** — `lib/allocate.ts` + `/api/allocate` +
    `components/AllocationAdvisor.tsx`. Three layers: (1) framework hard
    constraints (S&P floor funded first, Tesla £0 while overweight >35%, Google
    priority while underweight, SpaceX dry powder, never sell); (2) volatility
    adjustment (composite risk per position + Tesla/SpaceX combined exposure,
    scaled by Conservative/Moderate/Aggressive tolerance); (3) return
    optimisation (probability-weighted expected return from the outlook model).
    Reads/saves portfolio balances in KV. Executes the user's rules; not advice.

- **Phase 3 (in progress):** Thesis-break / exit-discipline engine — the mirror
  of the allocator (reasons toward reduction/exit). `breakTriggers` in
  framework.json (18 conditions, defined in calm conditions); `lib/thesisBreak.ts`
  + `/api/thesis-break` (also runs in the monthly cron); `ExitDisciplinePanel`
  (thesis health, active break conditions with evidence both ways, pre-commitment
  ledger, decision log, Tesla+SpaceX concentration meter). Hard rules: fires on
  THESIS deterioration, never price alone; never auto-sells; never resolves
  temporary-vs-structural for the user; redeploys to the strongest survivor or
  the S&P 500 floor, never cash; key-person (T-B6) is a combined Tesla+SpaceX
  event; concentration >60% escalates red triggers one level.

## Stack

Next.js 14 (App Router), TypeScript, Tailwind, Recharts. Anthropic model string:
`claude-sonnet-4-6`, `max_tokens: 1000`, server-side only, handle the tool-use
loop, parse response blocks by `type` not position.

## Env vars

`ANTHROPIC_API_KEY`, `FMP_API_KEY`, and (production) `KV_REST_API_URL` /
`KV_REST_API_TOKEN`. Without KV the app falls back to a local JSON store under
`./.data/` so dev works without provisioning KV.
