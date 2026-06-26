export type SignalStatus = "WATCHING" | "DEVELOPING" | "ACHIEVED" | "CONCERN";

export interface SignalHistoryEntry {
  status: SignalStatus;
  changedAt: string;
  sourceUrl?: string;
  reason?: string;
}

export interface Signal {
  id: string;
  number: number;
  company: string;
  tier: 1 | 2 | 3;
  name: string;
  watch: string;
  status: SignalStatus;
  lastChanged: string;
  sourceUrl: string;
  history: SignalHistoryEntry[];
}

export interface ReturnModelPhase {
  phase: number;
  period: string;
  annualReturnPctLow: number;
  annualReturnPctHigh: number;
  driver: string;
}

export interface Company {
  id: string;
  name: string;
  ticker: string;
  tickerNote?: string;
  role: string;
  thesisVersion?: string;
  thesis: string;
  moat?: string;
  keyInsights?: string[];
  returnModel: Record<string, unknown>;
  deferral?: Record<string, unknown>;
  entryCriteria?: { id: string; label: string; met: boolean }[];
  monitoringConcerns?: string[];
  floorPct?: number;
}

export interface Framework {
  version: string;
  asOf: string;
  meta: Record<string, unknown>;
  companies: Company[];
  muskStack: Record<string, unknown>;
  portfolioRules: Record<string, unknown>;
  loopStatus: {
    description: string;
    thresholds: { label: string; minAchieved: number; maxAchieved: number }[];
    closingSignalId: string;
    closingNote: string;
  };
  statusValues: SignalStatus[];
  signals: Signal[];
  portfolioReference: { blendedPct: number; googlePct: number; teslaPct: number; hurdlePct: number };
}

/** Map of signalId -> current status, stored in KV. */
export type SignalStatusMap = Record<string, SignalStatus>;

export interface CompanyOutlook {
  companyId: string;
  name: string;
  deferred: boolean;
  floorPct: number | null;
  highPct: number | null;
  basePct: number | null;
  adjustedPct: number | null;
  likelihoodPct: number;
  confidence: number; // -1..1
  signalsConsidered: number;
  positiveDrivers: string[];
  negativeDrivers: string[];
}

export interface BlendedOutlook {
  weights: Record<string, number>;
  blendedReturnPct: number;
  blendedLikelihoodPct: number;
  companies: CompanyOutlook[];
}

export interface MonitorProposal {
  id: string;
  signalId: string;
  signalName: string;
  company: string;
  tier: 1 | 2 | 3;
  fromStatus: SignalStatus;
  toStatus: SignalStatus;
  confidence: number; // 0..1
  reasoning: string;
  sourceUrl: string;
  createdAt: string;
  alert: boolean; // Tier 3 / definitive re-rating trigger
}

export interface AuditEntry {
  id: string;
  at: string;
  signalId: string;
  signalName: string;
  type: "proposed" | "accepted" | "rejected";
  fromStatus?: SignalStatus;
  toStatus?: SignalStatus;
  reasoning?: string;
  sourceUrl?: string;
  by: "monitor" | "user";
}

export interface KnowledgeEntry {
  at: string;
  status: SignalStatus;
  confidence: number;
  note: string;
  sourceUrl?: string;
}

export interface MonitorRunSummary {
  ranAt: string;
  companiesAnalysed: number;
  proposalsCreated: number;
  alerts: number;
  errors: string[];
}

export type RiskTolerance = "Conservative" | "Moderate" | "Aggressive";

export interface PortfolioBalances {
  tesla: number;
  google: number;
  spacex: number;
  sp500: number;
}

export interface AllocationLine {
  position: string;
  name: string;
  gbp: number;
  pctOfNew: number; // % of the new capital
  reasons: string[];
}

export interface PortfolioSnapshot {
  balances: PortfolioBalances;
  total: number;
  weights: Record<string, number>; // 0..1
  teslaSpacexCombinedPct: number; // 0..100
}

export interface AllocationResult {
  input: { amount: number; tolerance: RiskTolerance };
  current: PortfolioSnapshot;
  recommendation: AllocationLine[];
  postInvestment: PortfolioSnapshot;
  projections: { blendedReturnPct: number; blendedLikelihoodPct: number };
  layers: { layer1: string[]; layer2: string[]; layer3: string[] };
  alerts: string[];
  disclaimer: string;
}

export interface BreakTrigger {
  id: string;
  company: string;
  pillar: string;
  condition: string;
  severityRule: string;
  maxSeverity: "yellow" | "red" | "broken";
  precommittedResponse: string;
  temporaryVsStructuralTest: string;
  correlatedWith?: string[];
}

export type BreakSeverity = "yellow" | "red" | "broken";
export type ThesisHealth = "OK" | "MONITOR" | "PREPARE" | "BREAK";

export interface FiredTrigger {
  triggerId: string;
  company: string;
  pillar: string;
  severity: BreakSeverity;
  evidenceFor: string; // evidence the break is STRUCTURAL
  evidenceAgainst: string; // evidence it is TEMPORARY / thesis intact
  sourceUrl: string;
  precommittedResponse: string;
  temporaryVsStructuralTest: string;
  escalated: boolean; // escalated by concentration rule
  correlatedFire?: boolean; // fired via correlation (e.g. key-person on SpaceX)
}

export interface CompanyThesisAssessment {
  company: string;
  name: string;
  health: ThesisHealth;
  firedCount: number;
  yellowCount: number;
  redCount: number;
  brokenCount: number;
  firedTriggers: FiredTrigger[];
  redeploymentTarget: string | null;
}

export interface ThesisBreakResult {
  ranAt: string;
  companies: CompanyThesisAssessment[];
  concentration: {
    teslaSpacexPct: number;
    thresholdPct: number;
    escalating: boolean;
  };
  portfolioAlerts: string[];
  errors: string[];
}

export interface ThesisDecision {
  id: string;
  at: string;
  triggerId: string;
  company: string;
  decision: "follow" | "override";
  reasoning: string;
  by: "user";
}

export interface MarketCapCard {
  ticker: string;
  companyId: string;
  name: string;
  price: number | null;
  marketCap: number | null;
  currency: string;
  source: "fmp" | "framework-fallback" | "unavailable";
  nextTarget?: { year: string; valuationUSD: number; pctTo: number } | null;
  impliedCagrPct?: number | null;
  asOf: string;
}
