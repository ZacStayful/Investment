import { NextResponse } from "next/server";
import {
  getProposals,
  getAudit,
  getLastRun,
  acceptProposal,
  rejectProposal,
  runMonitor,
} from "@/lib/monitor";
import { kvBackend } from "@/lib/kv";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const [proposals, audit, lastRun] = await Promise.all([
    getProposals(),
    getAudit(),
    getLastRun(),
  ]);
  return NextResponse.json({ proposals, audit, lastRun, backend: kvBackend });
}

export async function POST(req: Request) {
  let body: { action?: string; proposalId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action, proposalId } = body;

  if (action === "run") {
    const summary = await runMonitor();
    const [proposals, audit] = await Promise.all([getProposals(), getAudit()]);
    return NextResponse.json({ ok: true, summary, proposals, audit });
  }

  if (action === "accept" || action === "reject") {
    if (!proposalId) {
      return NextResponse.json({ error: "proposalId required" }, { status: 400 });
    }
    const ok =
      action === "accept" ? await acceptProposal(proposalId) : await rejectProposal(proposalId);
    if (!ok) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    const [proposals, audit] = await Promise.all([getProposals(), getAudit()]);
    return NextResponse.json({ ok: true, proposals, audit });
  }

  return NextResponse.json(
    { error: "action must be one of: run, accept, reject" },
    { status: 400 }
  );
}
