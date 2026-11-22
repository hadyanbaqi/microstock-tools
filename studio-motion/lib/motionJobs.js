// Storage for Studio Motion video orders: Supabase motion_jobs (server-only key) or, without it, a local JSON file.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { hasDb, rest } from "./supabase.js";

const FILE = path.join(process.env.CACHE_DIR || (process.env.VERCEL ? path.join(os.tmpdir(), "stockscope-cache") : path.join(process.cwd(), ".cache")), "motion-jobs.json");
const readLocal = async () => { try { return JSON.parse(await fs.readFile(FILE, "utf8")); } catch { return []; } };
const writeLocal = async (rows) => { await fs.mkdir(path.dirname(FILE), { recursive: true }); await fs.writeFile(FILE, JSON.stringify(rows.slice(0, 500))); };
const UUID = /^[0-9a-f-]{36}$/i;

export async function createJob(row) {
  if (hasDb) return (await rest("motion_jobs", { method: "POST", body: row, prefer: "return=representation" }))[0];
  const rows = await readLocal(), now = new Date().toISOString();
  const job = { id: crypto.randomUUID(), status: "baru", note: null, created_at: now, updated_at: now, ...row };
  await writeLocal([job, ...rows]); return job;
}

export async function listJobs(limit = 30) {
  const n = Math.min(Math.max(Number(limit) || 30, 1), 200);
  if (hasDb) return rest(`motion_jobs?select=*&order=created_at.desc&limit=${n}`);
  return (await readLocal()).slice(0, n);
}

export async function getJob(id) {
  if (!UUID.test(String(id))) return null;
  if (hasDb) return (await rest(`motion_jobs?id=eq.${id}&select=*`))[0] ?? null;
  return (await readLocal()).find((j) => j.id === id) ?? null;
}

export async function updateJob(id, patch) {
  if (!UUID.test(String(id))) throw new Error("ID video tidak valid.");
  const body = { ...patch, updated_at: new Date().toISOString() };
  if (hasDb) return (await rest(`motion_jobs?id=eq.${id}`, { method: "PATCH", body, prefer: "return=representation" }))[0] ?? null;
  const rows = await readLocal(), i = rows.findIndex((j) => j.id === id); if (i < 0) return null;
  rows[i] = { ...rows[i], ...body }; await writeLocal(rows); return rows[i];
}
