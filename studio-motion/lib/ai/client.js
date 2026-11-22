// The agent's single entry point for text/vision calls: resolve the account's provider + model for a task, check
// budget and plan quota, call {base}/chat/completions (OpenAI-compatible), record usage (tokens, cost, who paid).
//
//   const r = await runTask(account, "metadata", { system, user, images: [dataUrl], json: true, validate })
//   r.data (parsed JSON when json), r.text, r.usage { inputTokens, outputTokens, costUsd, estimated }, r.model
//
// json + validate(data) → string error | null: on a bad answer the model gets one retry with the error, so cheap
// models stay safe to use. Image/video generation (stage 4) will live next to this file and share resolve().
import { quotaError } from "../plans.js";
import { findModel } from "./models.js";
import { PROVIDERS, TASKS } from "./providers.js";
import { accountPlan, getSettings, listProviders, monthUsage, providerWithKey, recordUsage } from "./store.js";

export class AgentError extends Error {
  constructor(message, status = 400, code = "AGENT") { super(message); this.status = status; this.code = code; }
}

// Which provider row + model a task uses (settings.tasks[task] = { provider_id, model }).
export async function resolve(account, task) {
  if (!TASKS[task]) throw new AgentError(`Tugas tidak dikenal: ${task}`);
  const s = await getSettings(account);
  const pick = s.tasks?.[task];
  if (!pick?.provider_id || !pick?.model) throw new AgentError(`Model untuk "${TASKS[task].label}" belum dipilih di Pengaturan Agent.`, 409, "NO_MODEL");
  const provider = await providerWithKey(account, pick.provider_id);
  if (!provider) throw new AgentError("Penyedia yang dipilih sudah dihapus. Pilih ulang di Pengaturan Agent.", 409, "NO_PROVIDER");
  if (!provider.enabled) throw new AgentError(`Penyedia "${provider.label}" sedang dimatikan.`, 409, "PROVIDER_OFF");
  if (!provider.key) throw new AgentError(`Key "${provider.label}" tidak bisa dibuka (MCP_SECRET berubah?). Simpan ulang key-nya.`, 409, "NO_KEY");
  return { settings: s, provider, model: pick.model };
}

async function guard(account, task, settings) {
  const [plan, usage] = await Promise.all([accountPlan(account), monthUsage(account)]);
  const q = quotaError(plan, task, usage.byTask[task]?.calls ?? 0);
  if (q) throw new AgentError(q, 402, "QUOTA");
  const budget = settings.monthly_budget_usd;
  if (budget !== null && budget !== undefined && usage.costUsd >= budget)
    throw new AgentError(`Batas biaya bulan ini ($${Number(budget).toFixed(2)}) sudah tercapai. Naikkan di Pengaturan Agent.`, 402, "BUDGET");
  return { plan, usage };
}

function messagesFor({ system, user, images = [], history = [] }) {
  const msgs = [];
  if (system) msgs.push({ role: "system", content: system });
  msgs.push(...history);
  if (images.length) msgs.push({ role: "user", content: [{ type: "text", text: user }, ...images.map((url) => ({ type: "image_url", image_url: { url } }))] });
  else msgs.push({ role: "user", content: user });
  return msgs;
}

function parseJson(text) {
  const t = String(text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try { return JSON.parse(t); } catch { /* try the outermost object/array */ }
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* fall through */ } }
  return undefined;
}

// One HTTP call. Returns { text, inputTokens, outputTokens, costUsd, estimated }.
async function complete(provider, model, messages, { json, maxTokens, temperature, timeoutMs = 90e3 }) {
  const def = PROVIDERS[provider.provider] || {};
  const body = { model, messages, max_tokens: maxTokens, temperature };
  if (json) body.response_format = { type: "json_object" };
  if (provider.provider === "openrouter") body.usage = { include: true }; // OpenRouter returns the real cost
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${provider.base_url}/chat/completions`, {
      method: "POST", signal: ctrl.signal, cache: "no-store",
      headers: { Authorization: `Bearer ${provider.key}`, "Content-Type": "application/json", ...def.headers },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new AgentError(e.name === "AbortError" ? "Penyedia terlalu lama menjawab." : `Tidak bisa menghubungi penyedia: ${e.message}`, 504, "NETWORK");
  } finally {
    clearTimeout(timer);
  }
  const raw = await res.text();
  let j; try { j = JSON.parse(raw); } catch { j = null; }
  if (!res.ok) {
    const msg = j?.error?.message || raw.slice(0, 200);
    if (res.status === 401 || res.status === 403) throw new AgentError(`Key ditolak penyedia: ${msg}`, 401, "BAD_KEY");
    if (res.status === 402) throw new AgentError(`Saldo penyedia habis: ${msg}`, 402, "NO_CREDIT");
    if (res.status === 429) throw new AgentError(`Terlalu banyak permintaan ke penyedia: ${msg}`, 429, "RATE");
    if (json && res.status === 400 && /response_format/i.test(msg)) { const e = new AgentError(msg, 400, "NO_JSON_MODE"); throw e; }
    throw new AgentError(`Penyedia menjawab ${res.status}: ${msg}`, 502, "PROVIDER");
  }
  const u = j?.usage || {};
  return {
    text: j?.choices?.[0]?.message?.content ?? "",
    inputTokens: u.prompt_tokens ?? null,
    outputTokens: u.completion_tokens ?? null,
    costUsd: typeof u.cost === "number" ? u.cost : null,
  };
}

async function costOf(provider, model, r) {
  if (r.costUsd !== null) return { costUsd: r.costUsd, estimated: false };
  try {
    const m = await findModel(provider, model);
    if (m && m.priceIn !== null && r.inputTokens !== null)
      return { costUsd: ((r.inputTokens * m.priceIn) + ((r.outputTokens ?? 0) * (m.priceOut ?? 0))) / 1e6, estimated: true };
  } catch { /* price unknown */ }
  return { costUsd: null, estimated: true };
}

export async function runTask(account, task, opts) {
  const { settings, provider, model } = await resolve(account, task);
  await guard(account, task, settings);
  const { json = false, validate, maxTokens = 2000, temperature = 0.7, jobId = null } = opts;
  const t0 = Date.now();
  let messages = messagesFor(opts), useJsonMode = json, last;
  const total = { inputTokens: 0, outputTokens: 0, costUsd: 0, estimated: false };
  const log = async (ok, error, r) => recordUsage({
    account_id: account, task, provider: provider.provider, model, job_id: jobId,
    input_tokens: r?.inputTokens ?? null, output_tokens: r?.outputTokens ?? null,
    cost_usd: r?.costUsd ?? null, cost_estimated: !!r?.estimated, paid_by: provider.fromEnv ? "env" : provider.key_source || "byok",
    ok, error: error ? String(error).slice(0, 300) : null, ms: Date.now() - t0,
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    let r;
    try {
      r = await complete(provider, model, messages, { json: useJsonMode, maxTokens, temperature });
    } catch (e) {
      if (e.code === "NO_JSON_MODE" && useJsonMode) { useJsonMode = false; attempt--; continue; } // model without JSON mode: ask in words
      await log(false, e.message, null);
      throw e;
    }
    const c = await costOf(provider, model, r);
    total.inputTokens += r.inputTokens ?? 0; total.outputTokens += r.outputTokens ?? 0;
    if (c.costUsd !== null) total.costUsd += c.costUsd;
    total.estimated ||= c.estimated;
    await log(true, null, { ...r, ...c });
    if (!json) return { text: r.text, data: null, usage: total, model, provider: provider.provider };
    const data = parseJson(r.text);
    const err = data === undefined ? "Jawaban bukan JSON yang valid." : validate ? validate(data) : null;
    if (!err) return { text: r.text, data, usage: total, model, provider: provider.provider };
    last = err;
    messages = [...messages, { role: "assistant", content: r.text }, { role: "user", content: `Jawaban belum sesuai aturan: ${err}\nPerbaiki dan kirim ulang HANYA JSON yang benar.` }];
  }
  throw new AgentError(`Model tidak memberi jawaban yang valid: ${last}`, 422, "INVALID");
}

// Connection test for one provider + model: tiny call, no settings needed, recorded as task "test".
export async function testModel(account, providerId, model) {
  const provider = await providerWithKey(account, providerId);
  if (!provider) throw new AgentError("Penyedia tidak ditemukan.", 404);
  const t0 = Date.now();
  const r = await complete(provider, model, [{ role: "user", content: "Balas hanya dengan kata: OK" }], { json: false, maxTokens: 5, temperature: 0 });
  const c = await costOf(provider, model, r);
  await recordUsage({ account_id: account, task: "test", provider: provider.provider, model, input_tokens: r.inputTokens, output_tokens: r.outputTokens,
    cost_usd: c.costUsd, cost_estimated: c.estimated, paid_by: provider.fromEnv ? "env" : provider.key_source || "byok", ok: true, ms: Date.now() - t0 });
  return { reply: r.text.trim().slice(0, 40), ms: Date.now() - t0, costUsd: c.costUsd, estimated: c.estimated };
}

export { listProviders };
