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
