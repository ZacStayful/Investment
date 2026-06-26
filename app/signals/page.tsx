import MarketCapCards from "@/components/MarketCapCards";
import SignalBoard from "@/components/SignalBoard";
import PortfolioTracker from "@/components/PortfolioTracker";
import IntelligenceQuery from "@/components/IntelligenceQuery";
import { framework } from "@/lib/framework";

export const metadata = {
  title: "Signal Board · Investment Intelligence Terminal",
};

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-terminal-text">
          {title}
        </h2>
        {subtitle && <p className="text-xs text-terminal-muted">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

export default function SignalsPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <header className="mb-8 flex flex-col gap-1 border-b border-terminal-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-terminal-text">
            Investment Intelligence Terminal
          </h1>
          <p className="text-xs text-terminal-muted">
            Framework V{framework.version} · as of {framework.asOf} · monitoring &
            decision-support only — not financial advice
          </p>
        </div>
        <div className="text-xs text-terminal-muted">
          TSLA · GOOGL · SPCX · S&amp;P 500 floor
        </div>
      </header>

      {/* The signal board is the hero. */}
      <Section
        title="Signal Board"
        subtitle="21 monitored signals · click any card to cycle status (persists)"
      >
        <SignalBoard />
      </Section>

      <Section title="Live Market Caps" subtitle="vs framework return-model targets">
        <MarketCapCards />
      </Section>

      <Section title="Portfolio Tracker" subtitle="compounding projection — not a forecast">
        <PortfolioTracker />
      </Section>

      <Section
        title="AI Intelligence Query"
        subtitle="natural-language question → live web search → framework-mapped intelligence"
      >
        <IntelligenceQuery />
      </Section>

      <footer className="mt-12 border-t border-terminal-border pt-4 text-[11px] leading-relaxed text-terminal-muted">
        {String(framework.meta.disclaimer)} Rebalancing is done only by directing new
        contributions — never by selling.
      </footer>
    </main>
  );
}
