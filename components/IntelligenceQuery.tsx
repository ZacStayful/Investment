"use client";

import { useState } from "react";

const QUICK_QUERIES = [
  "Any Tesla Optimus task-completion disclosures this quarter?",
  "Latest on Tesla–SpaceX merger signals (8-K, exec statements)?",
  "Google Cloud growth rate and backlog — most recent quarter?",
  "SpaceX cash burn and Starlink ARPU — latest data?",
  "Any open-source VLA model reaching dexterity parity?",
];

interface Result {
  answer: string;
  citations: string[];
  cached?: boolean;
}

export default function IntelligenceQuery() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(q: string) {
    const trimmed = q.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Query failed");
      } else {
        setResult(data);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-terminal-border bg-terminal-panel p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(query);
        }}
        className="flex gap-2"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask the framework — triggers live web search…"
          className="flex-1 rounded-md border border-terminal-border bg-terminal-bg px-3 py-2 text-sm text-terminal-text placeholder:text-terminal-muted"
          aria-label="Intelligence query"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="rounded-md bg-terminal-text px-4 py-2 text-sm font-semibold text-terminal-bg disabled:opacity-40"
        >
          {loading ? "Searching…" : "Query"}
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {QUICK_QUERIES.map((q) => (
          <button
            key={q}
            onClick={() => {
              setQuery(q);
              run(q);
            }}
            disabled={loading}
            className="rounded-full border border-terminal-border px-3 py-1 text-xs text-terminal-muted transition-colors hover:border-terminal-muted hover:text-terminal-text disabled:opacity-40"
          >
            {q}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-4 rounded-md border border-status-concern/40 bg-status-concern/10 p-3 text-sm text-status-concern">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-4 rounded-md border border-terminal-border bg-terminal-bg p-4">
          {result.cached && (
            <span className="mb-2 inline-block text-[11px] uppercase tracking-wide text-terminal-muted">
              cached (30-min window)
            </span>
          )}
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-terminal-text">
            {result.answer}
          </div>
          {result.citations.length > 0 && (
            <div className="mt-3 border-t border-terminal-border pt-3">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-terminal-muted">
                Sources
              </div>
              <ul className="space-y-1">
                {result.citations.map((url) => (
                  <li key={url}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-sky-400 underline underline-offset-2 hover:text-sky-300"
                    >
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
