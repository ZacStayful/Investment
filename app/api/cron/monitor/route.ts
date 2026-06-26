import { NextResponse } from "next/server";
import { runMonitor } from "@/lib/monitor";
import { runThesisBreak } from "@/lib/thesisBreak";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Scheduled self-learning monitor. Configured in vercel.json to run MONTHLY
 * (1st of each month, 07:00 UTC) — long-horizon signals move on a quarterly/
 * monthly cadence, so daily scanning is unnecessary noise and cost. Can still be
 * run on demand via the "Run monitor now" button (/api/monitor).
 *
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. We require it in
 * production when CRON_SECRET is set; if it is unset (local dev) the route is
 * open so it can be triggered manually.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Run the signal monitor and the thesis-break engine together.
  const [summary, thesis] = await Promise.all([runMonitor(), runThesisBreak()]);
  return NextResponse.json({
    ok: true,
    summary,
    thesis: {
      ranAt: thesis.ranAt,
      breaks: thesis.companies.filter((c) => c.health === "BREAK" || c.health === "PREPARE").length,
      alerts: thesis.portfolioAlerts.length,
    },
  });
}
