import { NextResponse } from "next/server";
import { getSignalStatuses, setSignalStatuses, kvBackend } from "@/lib/kv";
import { applyStatuses, defaultStatusMap, loopStatus } from "@/lib/framework";
import type { SignalStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID: SignalStatus[] = ["WATCHING", "DEVELOPING", "ACHIEVED", "CONCERN"];

export async function GET() {
  const overrides = await getSignalStatuses();
  const signals = applyStatuses(overrides);
  return NextResponse.json({
    signals,
    loop: loopStatus(signals),
    backend: kvBackend,
  });
}

export async function POST(req: Request) {
  let body: { id?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id, status } = body;
  if (!id || !status || !VALID.includes(status as SignalStatus)) {
    return NextResponse.json(
      { error: "Body requires { id, status } where status is one of " + VALID.join(", ") },
      { status: 400 }
    );
  }

  const current = await getSignalStatuses();
  const merged = { ...defaultStatusMap(), ...current, [id]: status as SignalStatus };
  await setSignalStatuses(merged);

  const signals = applyStatuses(merged);
  return NextResponse.json({ ok: true, signals, loop: loopStatus(signals), backend: kvBackend });
}
