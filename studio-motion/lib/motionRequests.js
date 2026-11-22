// Studio Motion "Kirim ke Claude" requests: Supabase motion_requests (server-only key) or a local JSON file.
// status: baru → dikerjakan (Claude read it) → selesai (buat_video linked a job) | batal.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { hasDb, rest } from "./supabase.js";

const FILE = path.join(process.env.CACHE_DIR || (process.env.VERCEL ? path.join(os.tmpdir(), "stockscope-cache") : path.join(process.cwd(), ".cache")), "motion-requests.json");
const readLocal = async () => { try { return JSON.parse(await fs.readFile(FILE, "utf8")); } catch { return []; } };
const writeLocal = async (rows) => { await fs.mkdir(path.dirname(FILE), { recursive: true }); await fs.writeFile(FILE, JSON.stringify(rows.slice(0, 200))); };
const UUID = /^[0-9a-f-]{36}$/i;
export const REQ_STATUS = ["baru", "dikerjakan", "selesai", "batal"];
const LIGHT = "id,idea,aspect,duration,status,job_id,note,has_image,created_at,updated_at";

export async function createRequest(row) {
  if (hasDb) return (await rest("motion_requests", { method: "POST", body: row, prefer: "return=representation" }))[0];
  const rows = await readLocal(), now = new Date().toISOString();
  const r = { id: crypto.randomUUID(), status: "baru", job_id: null, note: null, created_at: now, updated_at: now, ...row };
  await writeLocal([r, ...rows]); return r;
}

// Without the image (lists stay small); has_image tells whether one was attached.
export async function listRequests({ limit = 20, status } = {}) {
  const n = Math.min(Math.max(Number(limit) || 20, 1), 100), st = REQ_STATUS.includes(status) ? status : null;
  if (hasDb) {
    return rest(`motion_requests?select=${LIGHT}&order=created_at.desc&limit=${n}${st ? `&status=eq.${st}` : ""}`);
  }
  return (await readLocal()).filter((r) => !st || r.status === st).slice(0, n).map(({ image, ...r }) => ({ ...r, has_image: Boolean(image) }));
}

export async function getRequest(id) {
  if (!UUID.test(String(id))) return null;
  if (hasDb) return (await rest(`motion_requests?id=eq.${id}&select=*`))[0] ?? null;
  return (await readLocal()).find((r) => r.id === id) ?? null;
}

export async function updateRequest(id, patch) {
  if (!UUID.test(String(id))) throw new Error("ID permintaan tidak valid.");
  const body = { ...patch, updated_at: new Date().toISOString() };
  if (hasDb) return (await rest(`motion_requests?id=eq.${id}`, { method: "PATCH", body, prefer: "return=representation" }))[0] ?? null;
  const rows = await readLocal(), i = rows.findIndex((r) => r.id === id); if (i < 0) return null;
  rows[i] = { ...rows[i], ...body }; await writeLocal(rows); return rows[i];
}
