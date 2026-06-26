import { promises as fs } from "fs";
import path from "path";
import type { SignalStatusMap } from "./types";

/**
 * KV abstraction. Uses Vercel KV in production (when KV_REST_API_URL is set),
 * and falls back to a local JSON file under ./.data/ for dev. This keeps the
 * dashboard functional locally without provisioning KV.
 */

const SIGNAL_STATUS_KEY = "signal-status-map";
const LOCAL_DIR = path.join(process.cwd(), ".data");
const LOCAL_FILE = path.join(LOCAL_DIR, "kv.json");

/**
 * The @vercel/kv SDK reads KV_REST_API_URL / KV_REST_API_TOKEN. When a store is
 * connected via the Upstash Marketplace integration, Vercel may instead inject
 * the Upstash-native names (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).
 * Alias those onto the KV_* names so the SDK works regardless of which store
 * (or env-var prefix) was connected. Runs once at module load.
 */
function normalizeKvEnv(): void {
  if (!process.env.KV_REST_API_URL && process.env.UPSTASH_REDIS_REST_URL) {
    process.env.KV_REST_API_URL = process.env.UPSTASH_REDIS_REST_URL;
  }
  if (!process.env.KV_REST_API_TOKEN && process.env.UPSTASH_REDIS_REST_TOKEN) {
    process.env.KV_REST_API_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
  }
}

normalizeKvEnv();

function useVercelKv(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function readLocal(): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(LOCAL_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeLocal(data: Record<string, unknown>): Promise<void> {
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  await fs.writeFile(LOCAL_FILE, JSON.stringify(data, null, 2), "utf8");
}

/** Generic KV get. Returns null when the key is absent. */
export async function kvGet<T>(key: string): Promise<T | null> {
  if (useVercelKv()) {
    const { kv } = await import("@vercel/kv");
    return (await kv.get<T>(key)) ?? null;
  }
  const local = await readLocal();
  return (local[key] as T) ?? null;
}

/** Generic KV set. */
export async function kvSet<T>(key: string, value: T): Promise<void> {
  if (useVercelKv()) {
    const { kv } = await import("@vercel/kv");
    await kv.set(key, value);
    return;
  }
  const local = await readLocal();
  local[key] = value;
  await writeLocal(local);
}

export async function getSignalStatuses(): Promise<SignalStatusMap> {
  return (await kvGet<SignalStatusMap>(SIGNAL_STATUS_KEY)) ?? {};
}

export async function setSignalStatuses(map: SignalStatusMap): Promise<void> {
  await kvSet(SIGNAL_STATUS_KEY, map);
}

export const kvBackend = useVercelKv() ? "vercel-kv" : "local-json";
