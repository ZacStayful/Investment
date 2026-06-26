# CLAUDE_CODE_PROJECT_GUIDE.md

## Investment Intelligence Dashboard — Complete Build Brief

> **For Claude Code:** Read this entire document before writing any code. It is the single source of truth for what is being built, why, and how. It encodes a long-term investment framework, the portfolio it governs, the signals being monitored, the return model, and the full technical specification. When in doubt, this document wins. Build in two phases as specified at the end.
>
> **NOTE:** An addendum at the bottom of this file (Section "ADDENDUM") updates and extends this brief with the latest research session. Where the addendum conflicts with the body above it, **the addendum wins.**

---

## 1. WHAT WE ARE BUILDING (one paragraph)

A real-time investment intelligence dashboard that tracks a concentrated 3-position portfolio (Tesla, Google, SpaceX + an S&P 500 index floor) against a long-term investment framework. It monitors a defined set of observable real-world "signals" for each company, lets the user ask natural-language questions that trigger live web search and return framework-mapped intelligence, auto-updates signal statuses via a daily scheduled job, and recommends how to allocate new capital according to the framework's rules while respecting a user-set volatility tolerance. It is a **monitoring and decision-support tool, not a trading platform and not a financial adviser** — the human makes every final decision.

---

## 2. THE INVESTMENT THESIS & CONTEXT

The portfolio is built on a single conviction: the most valuable investments of the next 30–50 years are companies building **foundational infrastructure that solves civilisation-scale scarcity problems** (labour, energy, knowledge, health, connectivity, capital). Positions are held for 30+ years unless the thesis breaks. Rebalancing is done **only through directing new contributions** — never by selling (selling triggers tax events and breaks the permanent-capital mindset).

**Investor profile:**
- Starting portfolio: **£12,500**
- Monthly contribution: **£1,500** (permanent, via Stocks & Shares ISA)
- Goal: long-horizon compounding toward £10M+ over multiple decades
- Hurdle rate / benchmark: **18% annualised** (acknowledged as aspirational)
- Broker context: Interactive Brokers

---

## 3. THE PORTFOLIO POSITIONS

(See `lib/framework.json` for the authoritative encoded values. Summary below.)

### Tesla (TSLA) — primary position, currently overweight (~70–80%)
High-dexterity *premium task* dominance (Apple-vs-Android frame). The compounding asset is the **self-improving factory**, with Optimus as its output. Moat = **22-DoF tendon-driven hand + FSD data flywheel + self-improving factory**. Recursive loop = "Tier 0 moat". Cost-inversion crossover ~2029. Primary moat-erosion vector: open-source VLA reaching dexterity parity. Return model: three-phase (28–42% → 22–32% → 12–18%); contribution-decision floor 13–14%/20yr.

### Google / Alphabet (GOOGL) — quality anchor
Three moats: TPU vertical integration, Wiz multicloud security, DeepMind/Isomorphic optionality. ~10.5% CAGR by design (below hurdle). Primary risk: Azure enterprise bundling.

### SpaceX (SPCX) — third position, ENTRY DEFERRED
See addendum — now PUBLIC on Nasdaq. Entry deferred to Q4 2027+; three entry criteria all unmet.

### S&P 500 index — permanent floor
25% minimum, never reduced.

### Musk Integrated Stack & merger thesis
Tesla–SpaceX merger reclassified from risk to upside catalyst. In an all-stock deal the acquirer's (Tesla's) shareholders get the target at a discount → hold Tesla, do NOT rotate into SPCX. Treat Tesla+SpaceX as a single combined-exposure metric (correlated key-person risk). Confirmation priority: SEC 8-K > board committees > Musk statements > analyst reports.

---

## 4. THE SIGNAL MONITORING SYSTEM (21 signals)

Each signal: `id`, `company`, `tier`, `name`, `watch`, `status`, `lastChanged`, `sourceUrl`, `history[]`. Status values: `WATCHING` (default) · `DEVELOPING` · `ACHIEVED` · `CONCERN`. See `lib/framework.json` for the full encoded set (Tesla #1–#10, Google #11–#15, SpaceX #16–#19, Merger #20–#21).

**Loop-status indicator logic:** count of Tesla signals at ACHIEVED → `PRE-FORMATION` (<2) / `EARLY` (2–4) / `FORMING` (5+). The factory recursive loop is considered "closing" when Tier 3 signal #9 (Optimus building Optimus) fires.

---

## 5. THE RETURN MODEL

Encoded in `lib/framework.json`. Tesla ~$1.5T→$51.3T (2040), Google $4.2T→$16T (2040), SpaceX deferred. Portfolio calculator: `FV = P(1+r/12)^n + C·[((1+r/12)^n − 1)/(r/12)]` with P=£12,500, C=£1,500.

---

## 6. THE FOUR CORE FEATURES (Phase 1)

- **6.1 Live market-cap cards** — TSLA, GOOGL, SPCX via Financial Modeling Prep. Current market cap, % to next target, implied CAGR. SpaceX manual fallback in framework.json.
- **6.2 Signal monitoring board** — 21 signals as interactive cards, grouped by company tab and tier. Click to cycle status. Persists (Vercel KV). Summary bar + loop indicator.
- **6.3 Portfolio tracker** — sliders for horizon (0–360 months) and rate (8–42%); live value; quick-reference cards.
- **6.4 AI intelligence query** — natural-language input; server-side Anthropic (`claude-sonnet-4-6`) with `web_search`; system prompt contains the framework; 30-min cache; quick-fire buttons. Response: lead with new info → map to named signals → end with PORTFOLIO IMPLICATION (accelerate / maintain / threaten).

---

## 7. THE ADVANCED FEATURES (Phase 2)

- **7.1 Self-learning daily monitor** (`/api/cron/daily-monitor`, Vercel Cron) — daily search → map to signals → on change update KV + audit log → Tier 3 change triggers alert. Time-series knowledge base. Human-in-the-loop.
- **7.2 Capital allocation advisor** (`/api/allocate`) — amount + volatility tolerance; three layers (framework hard constraints → volatility adjustment with Tesla/SpaceX combined exposure → return optimisation). Executes the user's pre-decided rules; not advice.

---

## 8. TECHNICAL STACK & FILES

Next.js 14 (App Router), TypeScript, Tailwind, Recharts. Key files: `app/signals/page.tsx`, `lib/framework.json` (single source of truth), `app/api/intelligence/route.ts`, `app/api/marketcap/route.ts`, `app/api/signals/route.ts`, `app/api/allocate/route.ts` (Phase 2), `app/api/cron/daily-monitor/route.ts` (Phase 2), KV layer, `CLAUDE.md`.

**Env vars:** `ANTHROPIC_API_KEY`, `FMP_API_KEY`, (Phase 2) `KV_*`, optional `SLACK_WEBHOOK_URL`.

**Anthropic API notes:** model `claude-sonnet-4-6`; `max_tokens: 1000`; server-side only; handle the tool-use loop; parse responses by block `type`, not position.

---

## 9. DESIGN DIRECTION

"Mission control" intelligence terminal — dark theme, data-dense but legible. Signals read like a live status board. Status colours: ACHIEVED green, DEVELOPING amber, WATCHING slate, CONCERN red (pulsing). The signal board is the hero. Responsive to mobile; visible keyboard focus; reduced-motion respected.

---

## 10. WHAT THIS IS NOT

Not a trading platform. Not a financial adviser. Fundamental metrics that can't be reliably API-sourced (Starlink ARPU, Google cloud backlog, Tesla gross-margin breakdown) are entered manually into `framework.json` after each quarterly earnings release.

---

## 11. BUILD PHASING

- **Phase 1:** Features 6.1–6.4. `framework.json`, `/api/intelligence`, `/api/marketcap`, KV signal-status persistence.
- **Phase 2 (after Phase 1 deployed & stable):** Features 7.1–7.2.

---
---

# ADDENDUM (June 2026 — supersedes conflicting body text above)

> Where this addendum conflicts with the body above, **this addendum wins.** It corrects stale data, adds new framework analysis, and pins down the SpaceX listing details. Encode into `framework.json`, not into component logic.

## A. CORRECTION — SpaceX is now PUBLIC

- **Ticker: `SPCX` (Nasdaq).** Legal name: Space Exploration Technologies Corp. ~13.076 billion shares outstanding.
- IPO completed **12 June 2026** at $135/share, $1.75T valuation, raised ~$75B (largest IPO in history). First-day close $160.95 (+19.22%).
- Any "pre-IPO / private / deferred-to-IPO" language is stale. SpaceX IS listed. The 12–18 month *entry deferral* still stands (re-evaluate no earlier than Q4 2027) — but it is now a deferral on a *listed* stock.
- **Live reference (late June 2026 — refresh via FMP, do not hardcode):** ~$152/share, market cap ~$2.0T (still above $1.75T IPO valuation), ATH $225.64 (16 Jun). Morningstar fair value ~$63/share; CFRA sell, $115 target. **Next earnings: 6 August 2026** — next entry checkpoint.
- **Entry-criteria status (all three UNMET):** (1) valuation compression — cap still above IPO → NOT met; (2) cash burn — **worsening**, net loss −$4.28B (vs −$528M prior), Q1 capex $10.1B → NOT met; (3) second AI compute contract beyond Anthropic → NOT met.
- **Market-cap card:** use `SPCX` via FMP; manual fallback in `framework.json` flagged as manually-updated if FMP hasn't indexed the IPO.

## B. NEW TESLA ANALYSIS

1. Self-improving factory is the primary asset; Optimus is its output. Exponential (loop) vs China's linear improvement. Apparent delays = substrate-building.
2. Recursive loop = **Tier 0 moat** — widens automatically with time regardless of competitor action. Primary question: "is the loop still turning?" Only genuine vulnerability is internal.
3. China wins volume (Unitree ~$13,500, BYD, Agibot) — EXPECTED, not a thesis break. Tesla wins value. Thesis break = erosion of value-tier moat (FSD data flywheel + 22-DoF dexterity).
4. Cost-inversion crossover ~2029 (~2027–2028 if merger completes). China floor ~$16,700/unit (irreducible human assembly labour); Tesla floor ~$6,200/unit (materials + energy + AI QC). Post-inversion: undercut on price AND hold superior margin.
5. Primary moat-erosion vector: open-source VLA reaching dexterity parity.
6. Tesla return model: Phase 1 (2026–2032) 28–42%; Phase 2 (2032–2040) 22–32%; Phase 3 (2040–2050) 12–18%. Prob-weighted ~$51T (2040), ~$230T (2050), ≈23–29% CAGR. Contribution-decision floor 13–14%/20yr.

## C. MERGER — PRIMARY THESIS ACCELERANT

- Decision rule: hold the likely acquirer (Tesla); do NOT rotate into SPCX on merger speculation.
- Six acceleration vectors (Starlink fleet nervous system; Terafab chip margin; SpaceX factories as Optimus training environments; unified capital allocation; xAI/Grok integration; orbital manufacturing) → pull loop closure ~18–24 months forward.
- Confirmation priority: SEC 8-K (PRIMARY) > board committees > Musk statements > analyst reports.
- Correlation risk: treat combined Tesla+SPCX as a single combined-exposure metric in any volatility calculation.

## D. SIGNAL UPDATES

- Tier 0 / loop status driven by Tesla Tier 3 signals; #9 firing = recursive loop closing → highest-priority alert.
- Signal #10 context: COGS trajectory toward ~$16,700 China / ~$6,200 Tesla floors.
- SpaceX signals #16–#19 updated with live data (net loss −$4.28B, ARPU falling, cap ~$2.0T above IPO, next checkpoint 6 Aug 2026).
- Merger #20 (SEC 8-K, immediate alert) and #21 (exec statements, DEVELOPING) retained.
- Google #13 (AI talent) remains CONCERN (Shazeer & Jumper, June 2026).

## E. NO BEHAVIOURAL CHANGE TO THE BUILD PLAN

Two-phase plan, stack, file structure, env vars, and guardrails all stand. This addendum updates *data and framework content* only — encoded in `framework.json`.
