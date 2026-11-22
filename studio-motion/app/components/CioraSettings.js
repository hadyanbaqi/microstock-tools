"use client";
import { useEffect, useMemo, useState } from "react";
import { estimateIdr, fmtIdr } from "@/lib/ai/catalog";

// Koneksi → AI: the API key (sent once, stored encrypted on the server), then a short summary of the two models in use: the
// server already picks good defaults (cioraChoice). "Ganti model" opens the picker, a pick saves at once. Owner's choice: Ciora
// is for the non-Anthropic models (Gemini, Qwen, DeepSeek, GLM, Kimi, MiniMax, GPT…). "Cek model" really asks it to call a tool.
const ROLES = [
  ["html", "Kode animasi", "Dipakai Agent untuk ide dan kode animasi."],
  ["meta", "Metadata", "Judul dan keyword untuk CSV. Model murah sudah cukup."],
];

const agentOf = (m) => (m.verified ? m.verified.agent : m.agent); // verified test wins over the guess from the id
function rank(m) {
  const a = agentOf(m);
  return (m.verified?.agent ? 0 : 2) + (a === true ? 0 : a === null ? 1 : 3) + (m.coding === true ? 0 : 1) + (m.anthropic ? 5 : 0);
}

export default function CioraSettings() {
  const [d, setD] = useState(null);
  const [key, setKey] = useState(""), [show, setShow] = useState(false), [editKey, setEditKey] = useState(false);
  const [showAll, setShowAll] = useState(false), [q, setQ] = useState(""), [picking, setPicking] = useState(false);
  const [pick, setPick] = useState({ html: "", meta: "" });
  const [busy, setBusy] = useState(""), [msg, setMsg] = useState(null), [tests, setTests] = useState({});

  async function load(fresh) {
    const r = await fetch(`/api/ai/ciora${fresh ? "?fresh=1" : ""}`).then((x) => x.json()).catch(() => ({ error: "Server tidak bisa dihubungi." }));
    const safe = { models: [], choice: {}, ...r };
    if (!Array.isArray(safe.models)) safe.models = [];
    setD(safe);
    setPick({ html: safe.choice?.html || "", meta: safe.choice?.meta || "" });
    if (r.error && !r.models) setMsg({ ok: false, text: r.error });
  }
  useEffect(() => { load(); }, []);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (d?.models || [])
      .filter((m) => showAll || (!m.anthropic && agentOf(m) !== false && m.coding !== false))
      .filter((m) => !s || m.id.toLowerCase().includes(s) || m.family.toLowerCase().includes(s))
      .sort((a, b) => rank(a) - rank(b) || (a.in ?? 1e12) - (b.in ?? 1e12) || a.id.localeCompare(b.id));
  }, [d, showAll, q]);

  async function saveKey(e) {
    e.preventDefault();
    setBusy("key"); setMsg(null);
    const r = await fetch("/api/ai/ciora", { method: "POST", headers: { "content-type": "application/json", "x-ai-key": key.trim() }, body: JSON.stringify({ action: "key" }) })
      .then(async (x) => ({ ok: x.ok, ...(await x.json()) })).catch(() => ({ ok: false, error: "Server tidak bisa dihubungi." }));
    setBusy("");
    if (!r.ok) { setMsg({ ok: false, text: r.error || "Gagal menyimpan key." }); return; }
    setKey(""); setEditKey(false);
    setMsg({ ok: true, text: "Key valid dan tersimpan. AI siap dipakai." });
    window.dispatchEvent(new Event("stockscope:models-changed"));
    load(true);
  }
  async function removeKey() {
    setBusy("key"); setMsg(null);
    await fetch("/api/ai/ciora", { method: "DELETE" }).catch(() => {});
    setBusy(""); setMsg({ ok: true, text: "Key Ciora dihapus dari server." }); window.dispatchEvent(new Event("stockscope:models-changed")); load(true);
  }
  async function test(model) {
    if (!model) return;
    setBusy(`test:${model}`); setTests((t) => ({ ...t, [model]: null }));
    const r = await fetch("/api/ai/ciora", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "test", model }) })
      .then(async (x) => ({ ok: x.ok, ...(await x.json()) })).catch(() => ({ ok: false, error: "Server tidak bisa dihubungi." }));
    setBusy(""); setTests((t) => ({ ...t, [model]: r }));
    if (r.ok) setD((x) => x && { ...x, models: x.models.map((m) => (m.id === model ? { ...m, verified: { agent: r.agent, ms: r.ms } } : m)) });
  }
  async function choose(task, model) {
    const next = { ...pick, [task]: model };
    setPick(next); setBusy("choice"); setMsg(null);
    const r = await fetch("/api/ai/ciora", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "choice", ...next }) })
      .then(async (x) => ({ ok: x.ok, ...(await x.json()) })).catch(() => ({ ok: false, error: "Server tidak bisa dihubungi." }));
    setBusy("");
    try { localStorage.removeItem("stockscope:model-html"); localStorage.removeItem("stockscope:model-meta"); } catch {}
    window.dispatchEvent(new Event("stockscope:models-changed")); // pickers re-read the list and the new default
    setMsg(r.ok ? { ok: true, text: "Model tersimpan." } : { ok: false, text: r.error || "Gagal menyimpan." });
  }

  if (!d) return <p className="muted">Memuat…</p>;
  const hasKey = !!d.key, fromEnv = d.key?.source === "env";

  return (
    <div className="ck">
      {hasKey && !editKey ? (
        <div className="ck-keyrow">
          <code>••••••••{d.key.hint}</code>
          <span className="muted small">{d.error ? d.error : "Tersimpan aman"}</span>
          <div className="btns">
            <button type="button" className="mini" onClick={() => setEditKey(true)}>Ganti key</button>
            {!fromEnv && <button type="button" className="mini" disabled={!!busy} onClick={removeKey}>Hapus</button>}
          </div>
        </div>
      ) : (
        <>
          {!hasKey && <ol className="cn-steps">
            <li>Buka <a href="https://ciora.id/dashboard" target="_blank" rel="noreferrer">dashboard Ciora</a> → API Keys, lalu salin key-nya.</li>
            <li>Tempel di bawah. Model terbaik dipilih otomatis.</li>
          </ol>}
          <form className="ck-keyform" onSubmit={saveKey}>
            <input type={show ? "text" : "password"} value={key} onChange={(e) => setKey(e.target.value)} placeholder="Tempel API key Ciora di sini"
              autoComplete="off" spellCheck={false} aria-label="API key Ciora" />
            <button type="button" className="mini" onClick={() => setShow((v) => !v)}>{show ? "Sembunyikan" : "Lihat"}</button>
            <button type="submit" className="primary" disabled={busy === "key" || key.trim().length < 8 || !d.canStore}>{busy === "key" ? "Mengecek…" : "Simpan & cek"}</button>
            {hasKey && <button type="button" className="mini" onClick={() => { setEditKey(false); setKey(""); }}>Batal</button>}
          </form>
          {!d.canStore && <small className="err">Penyimpanan key belum aktif di server (MCP_SECRET kosong di Vercel).</small>}
        </>
      )}

      {hasKey && (
        <div className="cn-models">
          {ROLES.map(([task, title]) => {
            const cur = d.models.find((m) => m.id === pick[task]);
            return <div key={task}><small className="muted">{title}</small><b>{cur?.name || pick[task] || "Belum dipilih"}</b>
              {cur && <small className="muted">{fmtIdr(estimateIdr(cur, task))} {task === "html" ? "per video" : "per metadata"}</small>}</div>;
          })}
          <button type="button" className="mini" onClick={() => setPicking((v) => !v)}>{picking ? "Tutup" : "Ganti model"}</button>
        </div>
      )}

      {hasKey && picking && (
        <div className="cn-picker">
          <div className="ck-filters">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari model" aria-label="Cari model" />
            <label className="check"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Tampilkan semua</label>
          </div>
          {ROLES.map(([task, title, hint]) => {
            const cur = d.models.find((m) => m.id === pick[task]);
            const opts = cur && !list.some((m) => m.id === cur.id) ? [...list, cur] : list;
            const t = tests[pick[task]];
            return (
              <div className="ck-role" key={task}>
                <div className="ck-role-head"><b>{title}</b><small className="muted">{hint}</small></div>
                <div className="ck-pickrow">
                  <select value={pick[task]} onChange={(e) => choose(task, e.target.value)} aria-label={title} disabled={!opts.length || busy === "choice"}>
                    {!pick[task] && <option value="">Pilih model…</option>}
                    {opts.map((m) => <option key={m.id} value={m.id}>{m.id === list[0]?.id ? "★ " : ""}{m.name} · {fmtIdr(estimateIdr(m, task))}</option>)}
                  </select>
                  <button type="button" className="mini" disabled={!pick[task] || !!busy} onClick={() => test(pick[task])}>{busy === `test:${pick[task]}` ? "Mengecek…" : "Cek model"}</button>
                </div>
                {t && <small className={t.ok && t.agent ? "ok-text" : "err"}>{t.ok ? `${t.note} (${(t.ms / 1000).toFixed(1)} dtk)` : t.error}</small>}
                {task === "html" && cur && agentOf(cur) === false && <small className="err">Model ini kurang cocok untuk Agent. Pilih yang bertanda ★.</small>}
              </div>
            );
          })}
          {!list.length && <p className="muted small">Tidak ada model yang cocok.</p>}
          <small className="muted">★ = direkomendasikan. Pilihan langsung tersimpan. Cek model memakai sedikit saldo.</small>
        </div>
      )}

      {msg && <div className={`notice ${msg.ok ? "okbox" : "err"}`}>{msg.text}</div>}
    </div>
  );
}
