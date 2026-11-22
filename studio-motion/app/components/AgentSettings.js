"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fits, pickModel } from "@/lib/ai/models";

const usd = (v, d = 2) => (v === null || v === undefined ? "–" : `$${Number(v).toFixed(d).replace(".", ",")}`);
const PRESETS = [["hemat", "Hemat", "Model gratis/termurah"], ["seimbang", "Seimbang", "Gemini Flash-class: murah & bagus"], ["kualitas", "Kualitas", "Model terbaik, lebih mahal"]];

// Price label of a model for the dropdown.
function priceOf(m) {
  if (m.free) return "gratis";
  if (m.perSecond != null) return `${usd(m.perSecond, 3)}/detik`;
  if (m.priceIn == null) return "harga ?";
  return `${usd(m.priceIn)} / ${usd(m.priceOut)} per 1M`;
}
const capNote = (m, need) => (need === "vision" && m.caps.vision === null ? " · vision?" : "");

function ProviderRow({ p, busy, onToggle, onRemove }) {
  return (
    <li className={`tokrow ${p.enabled ? p.status : "off"}`}>
      <div className="tokrow-head">
        <b className="tokname">{p.label}</b>
        <span className={`tokstat ${p.enabled ? p.status : "off"}`}>{!p.enabled ? "Dimatikan" : p.status === "ok" ? "Aktif" : "Ditolak"}</span>
      </div>
      <div className="small muted">…{p.hint} · {p.baseUrl}{p.fromEnv ? " · dari Environment Variables" : ""}</div>
      {p.lastError && <div className="small" style={{ color: "var(--low)" }}>{p.lastError}</div>}
      {!p.fromEnv && (
        <div className="btns" style={{ marginTop: 6 }}>
          <button type="button" className="mini" disabled={busy} onClick={() => onToggle(p)}>{p.enabled ? "Matikan" : "Nyalakan"}</button>
          <button type="button" className="mini" disabled={busy} onClick={() => onRemove(p)}>Hapus</button>
        </div>
      )}
    </li>
  );
}

// Pengaturan Agent: providers (OpenRouter / Ciora / custom), preset, provider + model per task, monthly budget, usage.
export default function AgentSettings({ open, onClose, embedded = false }) {
  const [info, setInfo] = useState(null); // { catalog, providers, canStore }
  const [cfg, setCfg] = useState(null); // { settings, usage, plan, tasks }
  const [models, setModels] = useState({}); // providerId -> models[] | { error }
  const [draft, setDraft] = useState(null); // { preset, tasks, monthly_budget_usd }
  const [add, setAdd] = useState({ provider: "openrouter", label: "", baseUrl: "", key: "", show: false });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [tests, setTests] = useState({});
  const [recent, setRecent] = useState(null);

  const load = useCallback(async () => {
    // Never let a server error (e.g. missing table) crash the panel: fall back to empty, safe shapes.
    const get = (u) => fetch(u).then((r) => r.json()).catch(() => ({ error: "Server tidak bisa dihubungi." }));
    const [a0, b0] = await Promise.all([get("/api/ai/providers"), get("/api/ai/settings")]);
    const a = { catalog: [], providers: [], canStore: false, ...a0 };
    const b = { tasks: {}, usage: { calls: 0, costUsd: 0 }, plan: {}, ...b0 };
    if (!Array.isArray(a.catalog)) a.catalog = [];
    if (!Array.isArray(a.providers)) a.providers = [];
    if (!b.tasks || typeof b.tasks !== "object") b.tasks = {};
    if (!b.usage) b.usage = { calls: 0, costUsd: 0 };
    setInfo(a); setCfg(b);
    if (b.settings) setDraft({ preset: b.settings.preset, tasks: b.settings.tasks || {}, monthly_budget_usd: b.settings.monthly_budget_usd ?? "" });
    if (a.error || b.error) setMsg({ ok: false, text: a.error || b.error });
  }, []);

  useEffect(() => { if (open) { setMsg(null); setTests({}); setRecent(null); load(); } }, [open, load]);

  const loadModels = useCallback(async (pid, fresh) => {
    if (!pid || (!fresh && models[pid])) return models[pid];
    setModels((m) => ({ ...m, [pid]: { loading: true } }));
    const r = await fetch(`/api/ai/models?provider=${encodeURIComponent(pid)}${fresh ? "&fresh=1" : ""}`).then((x) => x.json()).catch(() => ({ error: "Gagal memuat." }));
    const val = r.models || { error: r.error || "Gagal memuat model." };
    setModels((m) => ({ ...m, [pid]: val }));
    return val;
  }, [models]);

  // Load model lists for every provider used in the draft.
  useEffect(() => {
    if (!draft) return;
    for (const v of Object.values(draft.tasks || {})) if (v?.provider_id) loadModels(v.provider_id);
  }, [draft, loadModels]);

  const usable = useMemo(() => (info?.providers || []).filter((p) => p.enabled && p.status === "ok"), [info]);

  async function addProvider(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const cat = info.catalog.find((c) => c.id === add.provider);
    const r = await fetch("/api/ai/providers", {
      method: "POST", headers: { "Content-Type": "application/json", "x-ai-key": add.key.trim() },
      body: JSON.stringify({ provider: add.provider, label: add.label, baseUrl: add.baseUrl || cat?.baseUrl }),
    }).then((x) => x.json()).catch(() => ({ error: "Gagal menyimpan." }));
    setBusy(false);
    if (r.error) return setMsg({ ok: false, text: r.error });
    setMsg({ ok: !r.warning, text: r.warning || `✓ ${r.provider.label} tersimpan · ${r.models} model tersedia.` });
    setAdd((a) => ({ ...a, key: "", label: "" }));
    await load();
  }

  async function toggle(p) {
    setBusy(true);
    try { await fetch("/api/ai/providers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, enabled: !p.enabled }) }); }
    catch { setMsg({ ok: false, text: "Gagal menghubungi server." }); }
    finally { setBusy(false); }
    load();
  }
  async function remove(p) {
    if (!confirm(`Hapus penyedia "${p.label}"? Key-nya ikut terhapus.`)) return;
    setBusy(true);
    const r = await fetch(`/api/ai/providers?id=${encodeURIComponent(p.id)}`, { method: "DELETE" }).then((x) => x.json()).catch(() => ({ error: "Gagal menghubungi server." }));
    setBusy(false);
    if (r.error) setMsg({ ok: false, text: r.error });
    load();
  }

  // Preset: fill every task with the preset's pick on the first usable provider (OpenRouter first).
  async function applyPreset(preset) {
    const prov = usable.find((p) => p.provider === "openrouter") || usable[0];
    if (!prov) return setMsg({ ok: false, text: "Tambahkan penyedia dulu." });
    const list = await loadModels(prov.id);
    if (!Array.isArray(list)) return setMsg({ ok: false, text: list?.error || "Daftar model belum termuat." });
    const tasks = { ...draft.tasks };
    for (const [t, def] of Object.entries(cfg.tasks)) {
      const id = pickModel(list, def.need, preset);
      if (def.need === "image" || def.need === "video") { if (!tasks[t]) continue; } // generation stays opt-in
      tasks[t] = id ? { provider_id: prov.id, model: id } : null;
    }
    setDraft({ ...draft, preset, tasks });
    setMsg({ ok: true, text: `Preset ${preset} dipasang memakai ${prov.label}. Cek pilihannya, lalu Simpan.` });
  }

  function setTask(t, patch) {
    const cur = draft.tasks[t] || {};
    const next = { ...cur, ...patch };
    if (patch.provider_id !== undefined) { next.model = ""; loadModels(patch.provider_id); }
    setDraft({ ...draft, preset: "custom", tasks: { ...draft.tasks, [t]: next.provider_id ? next : null } });
  }

  async function test(t) {
    const v = draft.tasks[t];
    if (!v?.provider_id || !v?.model) return;
    setTests((x) => ({ ...x, [t]: { busy: true } }));
    const r = await fetch("/api/ai/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) })
      .then((x) => x.json()).catch(() => ({ error: "Gagal." }));
    setTests((x) => ({ ...x, [t]: r }));
  }

  async function save() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/ai/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) })
      .then((x) => x.json()).catch(() => ({ error: "Gagal menyimpan." }));
    setBusy(false);
    setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: "✓ Pengaturan agent tersimpan." });
    if (!r.error) load();
  }

  async function showRecent() {
    const r = await fetch("/api/ai/usage").then((x) => x.json()).catch(() => null);
    setRecent(r?.recent || []);
  }

  if (!open) return null;
  const cat = info?.catalog?.find((c) => c.id === add.provider);
  const needsBase = add.provider !== "openrouter" || !cat?.baseUrl;

  const inner = (
    <>

        {cfg?.usage && (
          <div className="agent-kpis">
            <div><small>Paket</small><b>{cfg.plan?.label}</b></div>
            <div><small>Biaya bulan ini</small><b>{usd(cfg.usage.costUsd, 3)}</b></div>
            <div><small>Panggilan</small><b>{cfg.usage.calls}</b></div>
            <label><small>Batas biaya/bulan ($)</small>
              <input type="number" min="0" step="0.5" placeholder="tanpa batas" value={draft?.monthly_budget_usd ?? ""}
                onChange={(e) => setDraft({ ...draft, monthly_budget_usd: e.target.value })} />
            </label>
          </div>
        )}

        <section aria-labelledby="prov-title">
          <h3 id="prov-title">Penyedia AI</h3>
          <p className="hint" style={{ marginTop: 0 }}>Semua memakai API kompatibel OpenAI. Key disimpan terenkripsi di server dan tidak pernah dikirim balik ke browser.</p>
          {info?.providers?.length ? (
            <ul className="toklist">{info.providers.map((p) => <ProviderRow key={p.id} p={p} busy={busy} onToggle={toggle} onRemove={remove} />)}</ul>
          ) : info ? <div className="notice">Belum ada penyedia. Tambahkan OpenRouter (disarankan) di bawah.</div> : <div className="notice">Memuat…</div>}

          {info && (
            <form className="tokadd" onSubmit={addProvider}>
              <div className="row" style={{ gap: 6 }}>
                <select value={add.provider} aria-label="Penyedia" onChange={(e) => setAdd({ ...add, provider: e.target.value, baseUrl: "" })}>
                  {info.catalog.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <input value={add.label} maxLength={40} placeholder="Nama (opsional)" aria-label="Nama penyedia" onChange={(e) => setAdd({ ...add, label: e.target.value })} />
              </div>
              {needsBase && (
                <input value={add.baseUrl} placeholder={cat?.baseUrl || "https://…/v1 (lihat dokumentasi API penyedia)"} aria-label="Base URL"
                  onChange={(e) => setAdd({ ...add, baseUrl: e.target.value })} />
              )}
              <div className="row" style={{ gap: 6 }}>
                <input type={add.show ? "text" : "password"} value={add.key} autoComplete="off" spellCheck={false} placeholder="API key" aria-label="API key"
                  onChange={(e) => setAdd({ ...add, key: e.target.value })} />
                <button type="button" style={{ flex: "0 0 auto" }} onClick={() => setAdd({ ...add, show: !add.show })}>{add.show ? "Sembunyikan" : "Lihat"}</button>
                <button type="submit" className="primary" style={{ flex: "0 0 auto" }} disabled={busy || !add.key.trim() || !info.canStore}>{busy ? "Memeriksa…" : "+ Tambah"}</button>
              </div>
              <p className="hint" style={{ marginTop: 0 }}>
                {cat?.note}{cat?.keyUrl ? <> Ambil key di <a href={cat.keyUrl} target="_blank" rel="noreferrer">{cat.keyUrl.replace(/^https:\/\//, "")}</a>.</> : null}
                {!info.canStore && " Server belum bisa menyimpan key: isi MCP_SECRET, atau pasang OPENROUTER_API_KEY di Environment Variables."}
              </p>
            </form>
          )}
        </section>

        {draft && cfg && (
          <section aria-labelledby="task-title">
            <h3 id="task-title">Model per tugas</h3>
            <div className="chips" role="group" aria-label="Preset">
              {PRESETS.map(([k, label, tip]) => (
                <button key={k} type="button" className={`chip ${draft.preset === k ? "sel" : ""}`} title={tip} disabled={!usable.length} onClick={() => applyPreset(k)}>{label}</button>
              ))}
              {draft.preset === "custom" && <span className="chip sel static">Kustom</span>}
            </div>
            <ul className="agent-tasks">
              {Object.entries(cfg.tasks).map(([t, def]) => {
                const v = draft.tasks[t] || {};
                const list = models[v.provider_id];
                const opts = Array.isArray(list) ? list.filter((m) => fits(m, def.need)) : [];
                const tr = tests[t];
                return (
                  <li key={t}>
                    <div><b>{def.label}</b><div className="small muted">{def.hint}</div></div>
                    <div className="row" style={{ gap: 6 }}>
                      <select value={v.provider_id || ""} aria-label={`Penyedia untuk ${def.label}`} onChange={(e) => setTask(t, { provider_id: e.target.value })}>
                        <option value="">— tidak dipakai —</option>
                        {usable.filter((p) => def.need !== "video" || info.catalog.find((c) => c.id === p.provider)?.video).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </select>
                      <select value={v.model || ""} disabled={!v.provider_id || !Array.isArray(list)} aria-label={`Model untuk ${def.label}`} onChange={(e) => setTask(t, { model: e.target.value })}>
                        <option value="">{list?.loading ? "Memuat model…" : list?.error ? list.error : "Pilih model"}</option>
                        {v.model && Array.isArray(list) && !opts.some((m) => m.id === v.model) && <option value={v.model}>{v.model}</option>}
                        {opts.map((m) => <option key={m.id} value={m.id}>{m.name} · {priceOf(m)}{capNote(m, def.need)}</option>)}
                      </select>
                      {def.need !== "image" && def.need !== "video" && (
                        <button type="button" className="mini" style={{ flex: "0 0 auto" }} disabled={!v.model || tr?.busy} onClick={() => test(t)}>{tr?.busy ? "…" : "Tes"}</button>
                      )}
                    </div>
                    {tr && !tr.busy && (
                      <div className={`small ${tr.error ? "" : "okbox"}`} style={tr.error ? { color: "var(--low)" } : undefined}>
                        {tr.error ? tr.error : `✓ dijawab “${tr.reply}” · ${tr.ms} ms · ${tr.costUsd != null ? usd(tr.costUsd, 5) + (tr.estimated ? " (perkiraan)" : "") : "biaya ?"}`}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="btns">
              <button type="button" className="primary" disabled={busy} onClick={save}>{busy ? "Menyimpan…" : "Simpan pengaturan"}</button>
              <button type="button" onClick={showRecent}>Riwayat pemakaian</button>
              {usable.length > 0 && <button type="button" onClick={() => usable.forEach((p) => loadModels(p.id, true))}>Muat ulang daftar model</button>}
            </div>
          </section>
        )}

        {msg && <div className={`notice ${msg.ok ? "okbox" : "err"}`}>{msg.text}</div>}

        {recent && (
          <section aria-labelledby="usage-title">
            <h3 id="usage-title">Pemakaian terakhir</h3>
            {recent.length ? (
              <ul className="agent-usage">
                {recent.map((u, i) => (
                  <li key={i} className="small">
                    <span>{new Date(u.created_at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}</span>
                    <span>{u.task}</span><span className="muted">{u.model}</span>
                    <span>{u.ok ? usd(u.cost_usd, 5) : <span style={{ color: "var(--low)" }}>gagal</span>}</span>
                  </li>
                ))}
              </ul>
            ) : <div className="notice">Belum ada pemakaian.</div>}
          </section>
        )}
    </>
  );
  if (embedded) return <div className="hub-pane">{inner}</div>;
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal panel agent-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="agent-title">
        <h2 id="agent-title">Pengaturan Agent AI <button type="button" onClick={onClose} aria-label="Tutup">×</button></h2>
        {inner}
      </div>
    </div>
  );
}
