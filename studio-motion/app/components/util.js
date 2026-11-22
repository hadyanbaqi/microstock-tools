export const fmt = (n) => (n ?? 0).toLocaleString("id-ID");

// "trending" is a view, not an Apify order: fetch the newest assets, then rank them by downloads per month.
export const apiOrder = (order) => (order === "trending" ? "newest" : order);

// The user's own Apify token lives only in this browser: localStorage when "remember" is on,
// otherwise sessionStorage (cleared when the tab closes). It is sent with each search.
const TOKEN_KEY = "stockscope:apifyToken";

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function saveToken(token, remember) {
  try {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    if (token) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
  } catch {}
}

export const tokenRemembered = () => {
  try { return !!localStorage.getItem(TOKEN_KEY); } catch { return false; }
};

// Workspace code: random, created once per browser, scopes the private "Tersimpan" list (not a login).
// Copy it to another device to see the same list there.
const WORKSPACE_KEY = "stockscope:workspace";
export function getWorkspace() {
  try {
    let w = localStorage.getItem(WORKSPACE_KEY);
    if (!w) {
      const bytes = crypto.getRandomValues(new Uint8Array(10));
      w = "ss-" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(WORKSPACE_KEY, w);
    }
    return w;
  } catch {
    return "";
  }
}
export function setWorkspace(code) {
  const w = String(code ?? "").trim().toLowerCase();
  if (!/^ss-[a-f0-9]{16,40}$/.test(w)) return false;
  try { localStorage.setItem(WORKSPACE_KEY, w); return true; } catch { return false; }
}

export const tokenHeaders = (token = getToken()) => {
  const h = token ? { "x-apify-token": token } : {};
  const w = getWorkspace();
  if (w) h["x-workspace"] = w;
  return h;
};

export async function research(body) {
  const res = await fetch("/api/research", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...tokenHeaders() },
    body: JSON.stringify({ ...body, order: apiOrder(body.order) }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
  return json;
}

// Whether a search would be served from cache, and who would pay otherwise. Free.
export async function peekResearch(body) {
  try {
    const res = await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...tokenHeaders() },
      body: JSON.stringify({ ...body, order: apiOrder(body.order), peek: true }),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// One asset by Adobe Stock ID (fresh = skip the cache, e.g. to record a new tracking point).
export async function lookupAsset(id, fresh = false) {
  const res = await fetch("/api/asset", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...tokenHeaders() },
    body: JSON.stringify({ id, fresh }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
  return json;
}

// sep ";" + BOM so Excel with Indonesian locale opens it in columns; Adobe's upload CSV needs ",".
export function downloadCsv(rows, filename, sep = ";") {
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = rows.map((r) => r.map(cell).join(sep)).join("\r\n");
  const blob = new Blob([sep === ";" ? "﻿" + csv : csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const slug = (s) => String(s || "riset").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function store(key, value) {
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem(key) ?? "null");
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return null;
  }
}

export const copyText = (text) => navigator.clipboard?.writeText(text).catch(() => {});

// "2 Sep 2022" from "YYYY-MM-DD".
export function fmtDate(iso) {
  if (!iso || iso === "-") return "-";
  const d = new Date(iso + "T00:00:00Z");
  return isNaN(d) ? iso : d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

// "4 tahun lalu" / "7 bulan lalu" from an age in months.
export function ago(months) {
  if (months == null) return "";
  if (months < 1) return "bulan ini";
  if (months < 12) return `${months} bulan lalu`;
  return `${Math.floor(months / 12)} tahun lalu`;
}

// Sales speed: one decimal below 10/month, whole numbers above.
// Links from scraped data: only http(s), so a crafted value can never become a javascript: link.
export const safeUrl = (u) => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : undefined);

export const fmtVel = (v) => (v == null ? "-" : v >= 10 ? fmt(Math.round(v)) : String(+v.toFixed(1)).replace(".", ","));
