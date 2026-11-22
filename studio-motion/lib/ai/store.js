// Agent storage: providers (encrypted keys), settings per account, usage log. Supabase when configured
// (tables in supabase/migrations/20261027_agent_foundation.sql), else a local JSON file for development.
// Server only. API responses never contain a key: only label, provider, base URL, last 4 characters.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { decrypt, encrypt, keyOf } from "../secretStore.js";
import { hasDb, rest } from "../supabase.js";
import { PROVIDERS, cleanBaseUrl } from "./providers.js";

const FILE = path.join(process.env.CACHE_DIR || (process.env.VERCEL ? path.join(os.tmpdir(), "stockscope-cache") : path.join(process.cwd(), ".cache")), "agent.json");
const canEncrypt = () => !!keyOf();

async function readLocal() {
  try { return JSON.parse(await fs.readFile(FILE, "utf8")); } catch { return { providers: [], settings: {}, usage: [] }; }
}
async function writeLocal(d) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  const tmp = FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(d));
  await fs.rename(tmp, FILE);
}

// ---------------------------------------------------------------- providers ----------------------------------------------------------------
const PCOLS = "id,account_id,provider,label,base_url,key_enc,hint,key_source,enabled,status,last_error,checked_at,created_at";

export const viewProvider = (r) => ({
  id: r.id, provider: r.provider, label: r.label || PROVIDERS[r.provider]?.label || r.provider, baseUrl: r.base_url,
  hint: r.hint, keySource: r.key_source, enabled: r.enabled, status: r.status, lastError: r.last_error,
  checkedAt: r.checked_at, fromEnv: !!r.fromEnv,
});

// Providers configured only through env vars (owner): shown read-only, id "env:<provider>".
function envProviders() {
  const out = [];
  for (const [id, p] of Object.entries(PROVIDERS)) {
    const key = process.env[p.envKey];
    const base = cleanBaseUrl((p.envBase && process.env[p.envBase]) || p.baseUrl);
    if (!key || !base) continue;
    out.push({ id: `env:${id}`, provider: id, label: `${p.label} (env)`, base_url: base, key, hint: key.slice(-4),
      key_source: "platform", enabled: true, status: "ok", fromEnv: true });
  }
  return out;
}

export async function listProviders(account) {
  let rows = [];
  if (hasDb) rows = await rest(`ai_providers?account_id=eq.${encodeURIComponent(account)}&select=${PCOLS}&order=created_at.asc`);
  else rows = (await readLocal()).providers.filter((r) => r.account_id === account);
  return [...rows, ...envProviders()];
}

// Provider row with its decrypted key (server use only).
export async function providerWithKey(account, id) {
  const all = await listProviders(account);
  const r = all.find((x) => x.id === id);
  if (!r) return null;
  if (r.fromEnv) return r;
  let key = "";
  try { key = r.key_enc ? decrypt(r.key_enc) : ""; } catch { key = ""; }
  return { ...r, key };
}

export async function addProvider(account, { provider, label, baseUrl, key }) {
  if (!PROVIDERS[provider]) throw new Error("Penyedia tidak dikenal.");
  const base = cleanBaseUrl(baseUrl || PROVIDERS[provider].baseUrl);
  if (!base) throw new Error("Base URL wajib diisi (https://…/v1).");
  const k = String(key ?? "").trim();
  if (k.length < 8) throw new Error("API key terlalu pendek.");
  if (!canEncrypt()) throw new Error("Server belum bisa menyimpan key: isi MCP_SECRET di Environment Variables (atau pakai env OPENROUTER_API_KEY).");
  const row = { account_id: account, provider, label: String(label ?? "").slice(0, 40), base_url: base, key_enc: encrypt(k),
    hint: k.slice(-4), key_source: "byok", enabled: true, status: "ok" };
  if (hasDb) {
    const [saved] = await rest("ai_providers", { method: "POST", body: row, prefer: "return=representation" });
    return saved;
  }
  const d = await readLocal();
  const saved = { ...row, id: crypto.randomUUID(), created_at: new Date().toISOString() };
  d.providers.push(saved); await writeLocal(d);
  return saved;
}

export async function patchProvider(account, id, body) {
  const allowed = {};
  if (body.label !== undefined) allowed.label = String(body.label).slice(0, 40);
  if (body.enabled !== undefined) allowed.enabled = !!body.enabled;
  for (const k of ["status", "last_error", "checked_at"]) if (body[k] !== undefined) allowed[k] = body[k];
  if (String(id).startsWith("env:")) return;
  if (hasDb) return rest(`ai_providers?id=eq.${encodeURIComponent(id)}&account_id=eq.${encodeURIComponent(account)}`, { method: "PATCH", body: allowed });
  const d = await readLocal();
  d.providers = d.providers.map((r) => (r.id === id && r.account_id === account ? { ...r, ...allowed } : r));
  await writeLocal(d);
}

export async function removeProvider(account, id) {
  if (String(id).startsWith("env:")) throw new Error("Penyedia dari env diatur di Environment Variables.");
  if (hasDb) return rest(`ai_providers?id=eq.${encodeURIComponent(id)}&account_id=eq.${encodeURIComponent(account)}`, { method: "DELETE" });
  const d = await readLocal();
  d.providers = d.providers.filter((r) => !(r.id === id && r.account_id === account));
  await writeLocal(d);
}

// ---------------------------------------------------------------- settings ----------------------------------------------------------------
const DEFAULT_SETTINGS = { preset: "seimbang", tasks: {}, monthly_budget_usd: null };

export async function getSettings(account) {
  if (hasDb) {
    const [row] = await rest(`ai_settings?account_id=eq.${encodeURIComponent(account)}&select=preset,tasks,monthly_budget_usd,updated_at&limit=1`);
    return row ? { ...row, monthly_budget_usd: row.monthly_budget_usd === null ? null : Number(row.monthly_budget_usd) } : { ...DEFAULT_SETTINGS };
  }
  return (await readLocal()).settings[account] || { ...DEFAULT_SETTINGS };
}

export async function saveSettings(account, s) {
  const row = { account_id: account, preset: s.preset, tasks: s.tasks, monthly_budget_usd: s.monthly_budget_usd, updated_at: new Date().toISOString() };
  if (hasDb) {
    await rest("ai_settings?on_conflict=account_id", { method: "POST", body: row, prefer: "resolution=merge-duplicates" });
    return;
  }
  const d = await readLocal();
  d.settings[account] = row; await writeLocal(d);
}

// ---------------------------------------------------------------- usage ----------------------------------------------------------------
export async function recordUsage(u) {
  try {
    if (hasDb) { await rest("ai_usage", { method: "POST", body: u }); return; }
    const d = await readLocal();
    d.usage.push({ ...u, created_at: new Date().toISOString() });
    d.usage = d.usage.slice(-2000);
    await writeLocal(d);
  } catch (e) {
    console.warn("ai usage not recorded:", e.message);
  }
}

const monthStart = () => { const n = new Date(); return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1)).toISOString(); };

// This month's calls: totals, per task and per model (for the budget check, quotas and the usage panel).
export async function monthUsage(account) {
  const since = monthStart();
  let rows;
  if (hasDb) rows = await rest(`ai_usage?account_id=eq.${encodeURIComponent(account)}&created_at=gte.${since}&select=task,model,cost_usd,ok,input_tokens,output_tokens&limit=50000`);
  else rows = (await readLocal()).usage.filter((u) => u.account_id === account && u.created_at >= since);
  const sum = { since, calls: 0, costUsd: 0, byTask: {}, byModel: {} };
  for (const r of rows) {
    const c = Number(r.cost_usd) || 0;
    sum.calls++; sum.costUsd += c;
    const t = (sum.byTask[r.task] ||= { calls: 0, costUsd: 0 }); t.calls++; t.costUsd += c;
    const m = (sum.byModel[r.model] ||= { calls: 0, costUsd: 0 }); m.calls++; m.costUsd += c;
  }
  return sum;
}

export async function recentUsage(account, limit = 20) {
  if (hasDb) return rest(`ai_usage?account_id=eq.${encodeURIComponent(account)}&select=task,provider,model,cost_usd,cost_estimated,ok,error,ms,input_tokens,output_tokens,created_at&order=created_at.desc&limit=${limit}`);
  return (await readLocal()).usage.filter((u) => u.account_id === account).slice(-limit).reverse();
}

export async function accountPlan(account) {
  if (!hasDb) return account === "owner" ? "owner" : "free";
  try {
    const [row] = await rest(`accounts?id=eq.${encodeURIComponent(account)}&select=plan&limit=1`);
    return row?.plan || (account === "owner" ? "owner" : "free");
  } catch {
    return account === "owner" ? "owner" : "free"; // migration not run yet
  }
}
