// Kantong token Apify (owner's personal site): several Apify tokens stored encrypted in Supabase `apify_tokens`.
// Every paid call (Cari Aset, aset per ID, Tren Keyword, MCP) runs through withToken(): the token with the most
// credit left goes first; when Apify refuses (credit used up, token rejected, account memory cap full) the same call
// moves to the next token. Apify refuses those before a run starts, so switching never pays twice.
// Order of candidates: pool tokens (most credit left first) → the browser's own token → env tokens.
import crypto from "node:crypto";
import { checkToken, fetchAssets } from "./apify.js";
import { canStore, decrypt, deleteMcpToken, encrypt, getMcpToken, keyOf } from "./secretStore.js";
import { rest } from "./supabase.js";
import { COST_PER_100 } from "./themes.js";

const TABLE = "apify_tokens";
const COLS = "id,label,token_enc,hint,username,plan,usage_usd,limit_usd,checked_at,enabled,status,last_error,last_used_at,runs,created_at";
// Usage/limits are re-read from Apify (free call) when older than this.
const STALE_MS = 10 * 60e3;
// Below this many dollars left a token counts as used up.
export const MIN_LEFT_USD = 0.02;
const MAX_TOKENS = 20;

export const poolAvailable = canStore;

const hashOf = (token) => crypto.createHmac("sha256", keyOf()).update(token).digest("hex");
const num = (v) => (v === null || v === undefined ? null : Number(v));
export const leftUsd = (row) => (num(row.limit_usd) === null ? null : Math.max(0, num(row.limit_usd) - (num(row.usage_usd) ?? 0)));
const sortKey = (row) => leftUsd(row) ?? 1e6; // unknown limit (paid plans without a cap) sorts first

// Public view of a row: never the token itself.
export const viewRow = (r) => ({
  id: r.id, label: r.label, hint: r.hint, username: r.username, plan: r.plan,
  usageUsd: num(r.usage_usd), limitUsd: num(r.limit_usd), leftUsd: leftUsd(r), checkedAt: r.checked_at,
  enabled: r.enabled, status: r.status, lastError: r.last_error, lastUsedAt: r.last_used_at, runs: r.runs, createdAt: r.created_at,
});

async function patch(id, body) {
  await rest(`${TABLE}?id=eq.${id}`, { method: "PATCH", body });
}

// The single token the owner saved for Claude before the pool existed moves into the pool once.
// Retried until it succeeds (one attempt at a time), so a database hiccup does not orphan the old token.
let migrated = false, migrating = null;
async function migrateLegacy(rows) {
  if (migrated) return rows;
  if (rows.length) { migrated = true; return rows; }
  migrating ??= (async () => {
    try {
      const legacy = await getMcpToken();
      if (legacy) {
        await addToken(legacy, "Token Claude (lama)");
        await deleteMcpToken();
        return await rest(`${TABLE}?select=${COLS}&order=created_at.asc`);
      }
      migrated = true;
      return rows;
    } catch (e) {
      console.warn("token pool: legacy import failed:", e.message);
      return rows;
    } finally { const done = migrating; setTimeout(() => { if (migrating === done) migrating = null; }, 0); }
  })();
  const out = await migrating;
  if (out.length) migrated = true;
  return out;
}

export async function listRows() {
  if (!canStore()) return [];
  return migrateLegacy(await rest(`${TABLE}?select=${COLS}&order=created_at.asc`));
}

// Re-read one token's account and usage from Apify, store it, return the updated row.
async function refreshRow(row) {
  let token;
  try { token = decrypt(row.token_enc); } catch { token = ""; }
  const now = new Date().toISOString();
  if (!token) {
    const body = { status: "ditolak", last_error: "Tidak bisa dibuka (MCP_SECRET berubah?)", checked_at: now };
    await patch(row.id, body);
    return { ...row, ...body };
  }
  const c = await checkToken(token);
  const body = c.ok
    ? { username: c.username, plan: c.plan, usage_usd: c.usageUsd, limit_usd: c.limitUsd, checked_at: now, last_error: null }
    : { status: "ditolak", last_error: c.error || "Token ditolak Apify", checked_at: now };
  if (c.ok) {
    const left = body.limit_usd === null || body.limit_usd === undefined ? null : body.limit_usd - (body.usage_usd ?? 0);
    body.status = left !== null && left < MIN_LEFT_USD ? "habis" : "ok";
  }
  await patch(row.id, body);
  return { ...row, ...body };
}

export async function refreshToken(id) {
  const [row] = await rest(`${TABLE}?id=eq.${id}&select=${COLS}`);
  if (!row) return null;
  return viewRow(await refreshRow(row));
}

// Pool tokens that can be used now, most credit left first. Stale rows are refreshed (failures keep the old numbers).
// Rejected tokens are re-checked too (less often): a monthly limit used to be reported as "rejected", and a token
// fixed in the Apify console should come back on its own.
const REJECTED_RECHECK_MS = 6 * 3600e3;
async function usableRows() {
  const rows = (await listRows()).filter((r) => r.enabled);
  const stale = (r) => !r.checked_at || Date.now() - new Date(r.checked_at).getTime() > (r.status === "ditolak" ? REJECTED_RECHECK_MS : STALE_MS);
  const fresh = await Promise.all(rows.map((r) =>
    stale(r)
      ? refreshRow(r).catch((e) => { console.warn("token pool refresh failed:", e.message); return r; })
      : r));
  return fresh
    .filter((r) => r.status === "ok" && (leftUsd(r) === null || leftUsd(r) >= MIN_LEFT_USD))
    .sort((a, b) => sortKey(b) - sortKey(a));
}

// Short status for the UI and payer decisions: usable tokens and dollars left in total.
export async function poolSummary() {
  if (!canStore()) return { available: false, count: 0, usable: 0, leftUsd: null };
  const rows = await listRows();
  const ok = rows.filter((r) => r.enabled && r.status === "ok" && (leftUsd(r) === null || leftUsd(r) >= MIN_LEFT_USD));
  const known = ok.map(leftUsd).filter((v) => v !== null);
  return { available: true, count: rows.length, usable: ok.length, leftUsd: known.length ? +known.reduce((a, b) => a + b, 0).toFixed(2) : null };
}

export async function addToken(token, label = "") {
  if (!canStore()) throw Object.assign(new Error("Perlu Supabase dan MCP_SECRET di server."), { status: 503 });
  if (((await rest(`${TABLE}?select=id`)) ?? []).length >= MAX_TOKENS) throw Object.assign(new Error(`Maksimal ${MAX_TOKENS} token.`), { status: 400 });
  const c = await checkToken(token);
  if (!c.ok) throw Object.assign(new Error(c.error || "Token Apify ditolak."), { status: 401 });
  const left = c.limitUsd === null ? null : c.limitUsd - (c.usageUsd ?? 0);
  const body = {
    label: String(label || c.username || "Token").slice(0, 40), token_enc: encrypt(token), token_hash: hashOf(token),
    hint: token.slice(-4), username: c.username, plan: c.plan, usage_usd: c.usageUsd, limit_usd: c.limitUsd,
    checked_at: new Date().toISOString(), status: left !== null && left < MIN_LEFT_USD ? "habis" : "ok",
  };
  try {
    const [row] = await rest(`${TABLE}?select=${COLS}`, { method: "POST", body, prefer: "return=representation" });
    return viewRow(row);
  } catch (e) {
    if (/23505|duplicate/i.test(e.message)) throw Object.assign(new Error("Token ini sudah ada di kantong."), { status: 409 });
    throw e;
  }
}

export async function updateToken(id, { label, enabled }) {
  const body = {};
  if (typeof label === "string") body.label = label.trim().slice(0, 40);
  if (typeof enabled === "boolean") body.enabled = enabled;
  if (!Object.keys(body).length) return null;
  const [row] = await rest(`${TABLE}?id=eq.${id}&select=${COLS}`, { method: "PATCH", body, prefer: "return=representation" });
  return row ? viewRow(row) : null;
}

export async function removeToken(id) {
  await rest(`${TABLE}?id=eq.${id}`, { method: "DELETE" });
}

// What a new paid call would be paid with, without calling Apify for tokens checked recently.
export async function payerFor(userToken, envToken = process.env.APIFY_TOKEN) {
  const s = await poolSummary().catch(() => ({ usable: 0 }));
  return s.usable ? "pool" : userToken ? "user" : envToken ? "server" : "demo";
}

/**
 * Runs fn(token) with the best token, switching to the next one when Apify refuses.
 * opts.userToken: the browser's own token; opts.env: env tokens (default APIFY_TOKEN); opts.costUsd: estimated cost,
 * added to the pool token's usage until its next refresh. Returns { result, source, label }.
 * With no token at all returns { result: await fn(""), source: "demo" } (fetchAssets gives demo data).
 */
export async function withToken(fn, { userToken = "", env = [process.env.APIFY_TOKEN], costUsd = 0 } = {}) {
  let rows = [];
  try { rows = canStore() ? await usableRows() : []; } catch (e) { console.warn("token pool read failed:", e.message); }
  const seen = new Set();
  const cands = [];
  for (const r of rows) {
    let t = "";
    try { t = decrypt(r.token_enc); } catch { console.warn("token pool: cannot decrypt token", r.id, "(MCP_SECRET/ENC_KEY changed?)"); }
    if (t && !seen.has(t)) { seen.add(t); cands.push({ token: t, row: r, source: "pool", label: r.label }); }
  }
  for (const [t, source, label] of [[userToken, "user", "token browser"], ...env.map((e) => [e, "server", "token server"])]) {
    if (t && !seen.has(t)) { seen.add(t); cands.push({ token: t, source, label }); }
  }
  if (!cands.length) return { result: await fn(""), source: "demo", label: null };

  let lastErr = null;
  // A second round only when some account was merely busy (memory caps are temporary) and is still usable.
  for (let round = 0; round < 2; round++) {
    let busy = false;
    for (const c of cands) {
      if (c.dead) continue;
      try {
        const result = await fn(c.token, { memoryRetries: 0 });
        if (c.row) {
          // Parallel theme runs share a token: add to the row's current counters, not to this call's snapshot.
          rest(`${TABLE}?id=eq.${c.row.id}&select=runs,usage_usd&limit=1`).then(([cur]) => patch(c.row.id, {
            last_used_at: new Date().toISOString(), runs: (cur?.runs ?? c.row.runs ?? 0) + 1, last_error: null,
            usage_usd: num(cur?.usage_usd ?? c.row.usage_usd) === null ? null : +(num(cur?.usage_usd ?? c.row.usage_usd) + costUsd).toFixed(4),
          })).catch((e) => console.warn("token pool update failed:", e.message));
        }
        return { result, source: c.source, label: c.label };
      } catch (e) {
        lastErr = e;
        if (e.code === "MEMORY") { busy = true; continue; }
        if (e.code === "NO_CREDIT" || e.code === "BAD_TOKEN") {
          c.dead = true;
          if (c.row) {
            const body = e.code === "NO_CREDIT"
              ? { status: "habis", last_error: "Kredit/batas bulanan habis", usage_usd: num(c.row.limit_usd) ?? num(c.row.usage_usd), checked_at: new Date().toISOString() }
              : { status: "ditolak", last_error: "Token ditolak Apify" };
            patch(c.row.id, body).catch(() => {});
          }
          continue;
        }
        throw e; // input errors, empty results, network: the same on every token
      }
    }
    if (!busy || cands.every((c) => c.dead)) break;
    if (round === 0) await new Promise((r) => setTimeout(r, Number(process.env.POOL_BUSY_WAIT_MS ?? 8000)));
  }
  // Busy beats used-up in the message: waiting helps, a new token does not.
  if (cands.some((c) => !c.dead) && lastErr?.code !== "MEMORY") lastErr = Object.assign(new Error("all accounts busy"), { code: "MEMORY" });
  throw lastErr ?? Object.assign(new Error("Tidak ada token Apify yang bisa dipakai."), { code: "NO_CREDIT" });
}

// fetchAssets through the pool. Returns { items, source, label }.
export async function fetchPooled(params, opts = {}) {
  const costUsd = ((params.maxItems ?? 100) * COST_PER_100) / 100;
  const { result, source, label } = await withToken((t, o) => fetchAssets(params, t, o), { ...opts, costUsd });
  return { items: result, source, label };
}

// Enabled, readable pool tokens for free account reads (earlier runs): used-up tokens included, rejected ones not.
export async function readableTokens() {
  if (!canStore()) return [];
  const out = [];
  for (const r of await listRows()) {
    if (!r.enabled || r.status === "ditolak") continue;
    try { out.push({ id: r.id, label: r.label, token: decrypt(r.token_enc) }); } catch {}
  }
  return out;
}
