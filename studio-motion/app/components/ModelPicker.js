"use client";
import { useEffect, useState } from "react";
import { estimateIdr, fmtIdr, mergeModels } from "@/lib/ai/catalog";

// Model choice for the AI gateway (Ciora via ANTHROPIC_*): recommended first, price per job in Rupiah, a note per model.
// task "html" | "meta". The choice is remembered per browser (localStorage stockscope:model-<task>).
let listing = null;
const loadList = () => (listing ||= fetch("/api/motion/models").then((r) => r.json()).catch(() => { listing = null; return { enabled: false, ids: [] }; }));
const TIER = { gratis: "Gratis", hemat: "Hemat", seimbang: "Seimbang", premium: "Premium", "?": "?" };
const TASK = { html: "per video HTML", meta: "per metadata" };

export function useModelChoice(task) {
  const key = `stockscope:model-${task}`;
  const [info, setInfo] = useState(null);
  const [model, setModel] = useState("");
  useEffect(() => {
    let live = true;
    const load = () => loadList().then((d) => {
      if (!live) return;
      setInfo(d);
      let saved = ""; try { saved = localStorage.getItem(key) || ""; } catch {}
      setModel(saved || d.defaults?.[task] || "");
    });
    load();
    // Koneksi saved a new key or model: read the list again instead of keeping the old one until reload.
    const onChange = () => { listing = null; load(); };
    window.addEventListener("stockscope:models-changed", onChange);
    return () => { live = false; window.removeEventListener("stockscope:models-changed", onChange); };
  }, [key, task]);
  const choose = (m) => { setModel(m); try { localStorage.setItem(key, m); } catch {} };
  return { info, model, choose };
}

export default function ModelPicker({ task, choice, label = "Model AI" }) {
  const { info, model, choose } = choice;
  if (!info?.enabled) return null;
  // Ciora: its live models with agent/coding tags, non-Anthropic only (owner's choice); else the Claude catalog.
  const list = info.provider === "ciora" && Array.isArray(info.models)
    ? info.models.filter((m) => !m.anthropic && !/vision/i.test(m.id))
        .sort((a, b) => (b.id === info.defaults?.[task]) - (a.id === info.defaults?.[task]) || (a.in ?? 1e12) - (b.in ?? 1e12))
    : mergeModels(info.ids, task);
  const cur = list.find((m) => m.id === model) || (model ? { id: model, name: model, in: null, out: null, rec: [], tier: "?", note: "Model dari Environment Variables." } : null);
  const isRec = (m) => (info.provider === "ciora" ? m.id === info.defaults?.[task] : m.rec.includes(task));
  const rec = list.filter(isRec), rest = list.filter((m) => !isRec(m));
  const opt = (m) => <option key={m.id} value={m.id}>{m.name} · {TIER[m.tier] || m.tier} · {fmtIdr(estimateIdr(m, task))} {TASK[task]}</option>;
  return (
    <div className="model-pick">
      <label><span className="muted small">{label}</span>
        <select value={model} onChange={(e) => choose(e.target.value)} aria-label={label}>
          {cur && !list.some((m) => m.id === cur.id) && <option value={cur.id}>{cur.name} (env)</option>}
          {rec.length > 0 && <optgroup label={info.provider === "ciora" ? "Pilihan di Koneksi" : "Rekomendasi"}>{rec.map(opt)}</optgroup>}
          <optgroup label={info.live ? "Semua model Ciora" : "Model lain (katalog)"}>{rest.map(opt)}</optgroup>
        </select>
      </label>
      {cur && <small className="muted">
        {isRec(cur) ? "★ Rekomendasi · " : ""}{cur.family ? `${cur.family} · ` : ""}{cur.in != null ? `Rp ${cur.in.toLocaleString("id-ID")} / Rp ${cur.out.toLocaleString("id-ID")} per 1 juta token (input/output) · ` : ""}
        {fmtIdr(estimateIdr(cur, task))} {TASK[task]}{cur.note ? ` · ${cur.note}` : ""}
      </small>}
    </div>
  );
}
