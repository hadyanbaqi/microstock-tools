"use client";
import { useCallback, useState } from "react";
import AssetModal from "./AssetModal";
import { CopyButton } from "./ui";
import { fmtVel } from "./util";
import { typeLabel } from "@/lib/contentTypes";

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// "What to make": the niche summary turned into a production brief.
export default function BriefCard({ data, onCreator }) {
  const b = data.brief;
  const [detail, setDetail] = useState(null);
  const close = useCallback(() => setDetail(null), []);
  if (!b) return null;

  const make = [
    b.format && { label: "Format", value: typeLabel(b.format.name), why: b.format.others != null ? `${fmtVel(b.format.avgVelocity)} vs ${fmtVel(b.format.others)} dl/bln format lain` : null },
    b.orientation && { label: "Orientasi", value: cap(b.orientation.name), why: b.orientation.others != null ? `${fmtVel(b.orientation.avgVelocity)} vs ${fmtVel(b.orientation.others)} dl/bln` : null },
    b.category && { label: "Kategori", value: b.category.name, why: "paling cepat laku di aset ≤2 tahun" },
    { label: "Konten AI", value: b.ai.level === "non-ai" ? "Non-AI" : b.ai.level === "ai" ? "AI boleh" : "Bebas", why: b.ai.text },
  ].filter(Boolean);

  const text = [
    `BRIEF KONTEN: ${data.params?.query}`,
    ...make.map((m) => `${m.label}: ${m.value}${m.why ? ` (${m.why})` : ""}`),
    b.elements.length ? `Sertakan: ${b.elements.map((e) => e.keyword).join(", ")}` : "",
    b.avoid.length ? `Hindari tema umum yang lambat: ${b.avoid.map((e) => e.keyword).join(", ")}` : "",
    b.phrases.length ? `Frasa judul: ${b.phrases.map((p) => p.phrase).join(" / ")}` : "",
    `Keyword: ${b.keywords.join(", ")}`,
    `Referensi: ${b.references.map((a) => a.url).join(" ")}`,
  ].filter(Boolean).join("\n");

  return (
    <div className="panel brief">
      <h2>
        Brief konten <small className="muted">apa yang harus dibuat, dari aset yang paling cepat laku</small>
        <span className="btns"><CopyButton label="Salin brief" text={text} /><CopyButton label="Salin 25 keyword" text={b.keywords.join(", ")} /></span>
      </h2>

      <div className="brief-make">
        {make.map((m) => (
          <div key={m.label}>
            <span className="field-label">{m.label}</span>
            <b>{m.value}</b>
            {m.why && <small className="muted">{m.why}</small>}
          </div>
        ))}
      </div>

      <div className="brief-cols">
        <div>
          <span className="field-label">Sertakan: elemen yang sering ada di aset paling laris</span>
          {b.elements.length ? (
            <div className="chips">{b.elements.map((e) => <span key={e.keyword} className="chip static" title={`dipakai ${e.shareWinners}% aset tercepat`}>{e.keyword} <small>{e.shareWinners}%</small></span>)}</div>
          ) : <p className="hint">Tidak ada pola keyword yang menonjol.</p>}
          {b.phrases.length > 0 && <>
            <span className="field-label" style={{ marginTop: 12, display: "block" }}>Frasa judul dari aset laris</span>
            <div className="chips">{b.phrases.map((p) => <span key={p.phrase} className="chip static">{p.phrase}</span>)}</div>
          </>}
        </div>
        <div>
          <span className="field-label">Hindari: tema umum yang lambat laku</span>
          {b.avoid.length ? (
            <div className="chips">{b.avoid.map((e) => <span key={e.keyword} className="chip static avoid" title={`${e.share}% aset memakainya, hanya ${e.avgVelocity} dl/bln`}>{e.keyword} <small>{fmtVel(e.avgVelocity)}/bln</small></span>)}</div>
          ) : <p className="hint">Tidak ada tema umum yang jelas lambat.</p>}
          <p className="hint">Aset tercepat di niche ini rata-rata <b>{fmtVel(b.winnersVelocity)} dl/bln</b>, sedangkan rata-rata niche {fmtVel(b.avgVelocity)} dl/bln.</p>
        </div>
      </div>

      <span className="field-label">Referensi: aset ≤2 tahun yang paling cepat laku · klik untuk detail</span>
      <div className="brief-refs">
        {b.references.map((a) => (
          <button key={a.id} type="button" className="ref" onClick={() => setDetail(a)} title={a.title}>
            <span className="ref-img">{a.thumb && <img src={a.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />}</span>
            <b>~{fmtVel(a.dlPerMonth)}/bln</b>
            <small className="muted clamp1">{a.title}</small>
          </button>
        ))}
      </div>

      {detail && <AssetModal asset={detail} onClose={close} onCreator={onCreator} thumbStyle={() => ({})} />}
    </div>
  );
}
