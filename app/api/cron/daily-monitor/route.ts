import { NextResponse } from "next/server";
import { runMonitor } from "@/lib/monitor";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily self-learning monitor. Configured in vercel.json to run at 07:00 UTC.
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
  const summary = await runMonitor();
  return NextResponse.json({ ok: true, summary });
}
