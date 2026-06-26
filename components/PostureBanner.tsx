import { governingPrinciples } from "@/lib/framework";

export default function PostureBanner() {
  const gp = governingPrinciples();
  if (!gp) return null;
  return (
    <details className="mb-6 rounded-lg border border-terminal-border bg-terminal-panel/60 p-3">
      <summary className="cursor-pointer list-none">
        <span className="text-xs leading-relaxed text-terminal-muted">
          <span className="font-semibold text-terminal-text">A discipline engine, not a prediction engine.</span>{" "}
          Every target and CAGR here is a contingent scenario — what would have to be true for a
          thesis to hold — not a forecast. {gp.tagline}{" "}
          <span className="text-sky-400 underline underline-offset-2">the principles ▾</span>
        </span>
      </summary>
      <ol className="mt-3 space-y-1.5 border-t border-terminal-border pt-3">
        {gp.principles.map((p) => (
          <li key={p.n} className="text-[11px] leading-relaxed text-terminal-muted">
            <span className="font-semibold text-terminal-text">
              {p.n}. {p.title}.
            </span>{" "}
            {p.text}
          </li>
        ))}
      </ol>
    </details>
  );
}
