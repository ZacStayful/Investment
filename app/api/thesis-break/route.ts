import { NextResponse } from "next/server";
import {
  runThesisBreak,
  getAssessment,
  getDecisions,
  addDecision,
  getBreakTriggers,
} from "@/lib/thesisBreak";
import { framework } from "@/lib/framework";
import { kvBackend } from "@/lib/kv";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function ledger() {
  const exit = (framework as unknown as { exitDiscipline: Record<string, unknown> }).exitDiscipline;
  return { triggers: getBreakTriggers(), exitDiscipline: exit };
}

export async function GET() {
  const [assessment, decisions] = await Promise.all([getAssessment(), getDecisions()]);
  return NextResponse.json({ assessment, decisions, ...ledger(), backend: kvBackend });
}

export async function POST(req: Request) {
  let body: {
    action?: string;
    triggerId?: string;
    company?: string;
    decision?: string;
    reasoning?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.action === "run") {
    const assessment = await runThesisBreak();
    const decisions = await getDecisions();
    return NextResponse.json({ ok: true, assessment, decisions, ...ledger() });
  }

  if (body.action === "decide") {
    const { triggerId, company, decision, reasoning } = body;
    if (!triggerId || !company || (decision !== "follow" && decision !== "override")) {
      return NextResponse.json(
        { error: "decide requires triggerId, company, decision (follow|override)" },
        { status: 400 }
      );
    }
    await addDecision(triggerId, company, decision, reasoning ?? "");
    const decisions = await getDecisions();
    return NextResponse.json({ ok: true, decisions });
  }

  return NextResponse.json({ error: "action must be one of: run, decide" }, { status: 400 });
}
