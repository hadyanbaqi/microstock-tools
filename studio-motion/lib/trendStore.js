// Storage for keyword trend scans: Supabase (REST, server-only secret key) or, without it, a local JSON file
// (development). Never import this from client code.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { hasDb, rest } from "./supabase.js";

export { hasDb };
// A scan nobody finished within this time is closed (the browser that ran it went away).
const STALE_MS = 30 * 60e3;

const db = {
  scans: (q) => rest(`trend_scans?${q}`),
  createScan: async (row) => (await rest("trend_scans", { method: "POST", body: row, prefer: "return=representation" }))[0],
  updateScan: (id, patch) => rest(`trend_scans?id=eq.${id}`, { method: "PATCH", body: patch }),
  keywords: (scanId, select = "*") => rest(`trend_keywords?scan_id=eq.${scanId}&select=${select}&order=score.desc&limit=2000`),
  insertKeywords: (rows) => (rows.length ? rest("trend_keywords", { method: "POST", body: rows, prefer: "resolution=ignore-duplicates" }) : null),
  themeDone: (scanId, theme, n) => rest("rpc/trend_theme_done", { method: "POST", body: { p_scan: scanId, p_theme: theme, p_assets: n } }),
};

/* ---------- local file fallback ---------- */
const FILE = path.join(process.env.CACHE_DIR || (process.env.VERCEL ? path.join(os.tmpdir(), "stockscope-cache") : path.join(process.cwd(), ".cache")), "trends.json");
async function readLocal() {
  try { return JSON.parse(await fs.readFile(FILE, "utf8")); } catch { return { scans: [], keywords: [], seq: 0 }; }
}
async function writeLocal(d) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  // Write-then-rename so a reader never sees a half-written file.
  const tmp = `${FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(d));
  await fs.rename(tmp, FILE);
}
// Themes run in parallel: serialize read-modify-write on the file (Supabase does this atomically itself).
let queue = Promise.resolve();
const serial = (fn) => (...args) => {
  const run = queue.then(() => fn(...args));
  queue = run.catch(() => {});
  return run;
};
const local = Object.fromEntries(Object.entries({
  async createScan(row) {
    const d = await readLocal();
    const scan = { id: ++d.seq, created_at: new Date().toISOString(), finished_at: null, status: "running", themes_done: [], assets_scanned: 0, ...row };
    d.scans.push(scan);
    // Keep the file small: last 10 scans.
    const keep = new Set(d.scans.slice(-10).map((s) => s.id));
    d.scans = d.scans.filter((s) => keep.has(s.id));
    d.keywords = d.keywords.filter((k) => keep.has(k.scan_id));
    await writeLocal(d);
    return scan;
  },
  async updateScan(id, patch) {
    const d = await readLocal();
    Object.assign(d.scans.find((s) => s.id === id) ?? {}, patch);
    await writeLocal(d);
  },
  async allScans() { return (await readLocal()).scans; },
  async keywords(scanId) { return (await readLocal()).keywords.filter((k) => k.scan_id === scanId).sort((a, b) => b.score - a.score); },
  async insertKeywords(rows) {
    const d = await readLocal();
    d.keywords.push(...rows);
    await writeLocal(d);
  },
  async themeDone(scanId, theme, n) {
    const d = await readLocal();
    const s = d.scans.find((x) => x.id === scanId);
    if (!s || s.status !== "running" || s.themes_done.includes(theme)) return [];
    s.themes_done.push(theme);
    s.assets_scanned += n;
    await writeLocal(d);
    return [s.themes_done.length];
  },
}).map(([k, fn]) => [k, serial(fn)]));

/* ---------- API used by the routes ---------- */
export async function getScan(id) {
  if (!hasDb) return (await local.allScans()).find((s) => s.id === id) ?? null;
  return (await db.scans(`id=eq.${Number(id)}&limit=1`))[0] ?? null;
}

export async function runningScan() {
  const list = hasDb ? await db.scans("status=eq.running&order=created_at.desc&limit=5")
    : (await local.allScans()).filter((s) => s.status === "running");
  let current = null;
  for (const s of list) {
    if (Date.now() - new Date(s.created_at).getTime() > STALE_MS) await finishScan(s);
    else current ??= s;
  }
  return current;
}

export async function createScan(row) {
  return hasDb ? db.createScan(row) : local.createScan(row);
}

export async function saveTheme(scanId, theme, keywords, assets) {
  const rows = keywords.map((k) => ({ ...k, scan_id: scanId }));
  if (hasDb) {
    await db.insertKeywords(rows);
    return db.themeDone(scanId, theme, assets);
  }
  await local.insertKeywords(rows);
  return local.themeDone(scanId, theme, assets);
}

export async function finishScan(scan) {
  const done = scan.themes_done?.length ?? 0;
  const status = done >= scan.themes_total ? "done" : done > 0 ? "partial" : "failed";
  const patch = { status, finished_at: new Date().toISOString() };
  if (hasDb) await db.updateScan(scan.id, patch);
  else await local.updateScan(scan.id, patch);
  return { ...scan, ...patch };
}

// Latest finished scan (real data preferred over demo), its keywords, and each keyword's rank in the
// previous comparable scan (for ▲/▼).
export async function latestTrends() {
  const finished = (s) => s.status === "done" || s.status === "partial";
  let scans;
  if (hasDb) scans = await db.scans("status=in.(done,partial)&order=created_at.desc&limit=20&select=*");
  else scans = (await local.allScans()).filter(finished).sort((a, b) => b.id - a.id);
  const real = scans.filter((s) => !s.is_demo);
  const kwOf = (id) => (hasDb ? db.keywords(id) : local.keywords(id));
  // Newest scan that actually produced keywords (real data first), and the one before it for ▲/▼.
  const found = [];
  for (const sc of (real.length ? real : scans).slice(0, 6)) {
    const kws = await kwOf(sc.id);
    if (kws.length) found.push([sc, kws]);
    if (found.length === 2) break;
  }
  const [[scan, keywords] = [null, []], [prev, old] = [null, []]] = found;
  if (!scan) return { scan: null, keywords: [], prevRanks: {} };
  const prevRanks = {};
  old.forEach((k, i) => { prevRanks[`${k.theme}|${k.keyword}`] = i + 1; });
  return { scan, prevScanAt: prev?.created_at ?? null, keywords, prevRanks };
}
