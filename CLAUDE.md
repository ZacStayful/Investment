# CLAUDE.md — Repo Guardrails

Investment Intelligence Dashboard. Read `CLAUDE_CODE_PROJECT_GUIDE.md` for the
full build brief; it is the single source of truth for *what* is being built.
This file is the short list of *rules that must never be broken*.

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

- **Phase 1 (current):** market-cap cards, signal board + KV persistence,
  portfolio tracker, AI intelligence query. `framework.json`, `/api/marketcap`,
  `/api/intelligence`, `/api/signals`.
- **Phase 2 (do NOT start until Phase 1 is deployed and confirmed):** Vercel Cron
  daily self-learning monitor (audit trail + alerts + knowledge base) and the
  three-layer capital allocation advisor with Tesla/SpaceX combined-exposure
  handling.

## Stack

Next.js 14 (App Router), TypeScript, Tailwind, Recharts. Anthropic model string:
`claude-sonnet-4-6`, `max_tokens: 1000`, server-side only, handle the tool-use
loop, parse response blocks by `type` not position.

## Env vars

`ANTHROPIC_API_KEY`, `FMP_API_KEY`, and (production) `KV_REST_API_URL` /
`KV_REST_API_TOKEN`. Without KV the app falls back to a local JSON store under
`./.data/` so dev works without provisioning KV.
