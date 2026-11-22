"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, calendar, uploadNow } from "@/lib/events";
import { CopyButton, FilterPill } from "./ui";
import { fmtVel } from "./util";

const STATUS = {
  upload: ["Upload sekarang", "Jendela upload sedang terbuka"],
  mepet: ["Mepet", "Kurang dari sebulan: pembeli sudah banyak yang membeli"],
  nanti: ["Nanti", "Belum waktunya upload"],
  lewat: ["Lewat", "Sudah lewat tahun ini"],
};

// Microstock calendar: what to upload now, and the next 12 months of events buyers design for.
// Dates are computed (lib/holidays.js), so the page is always current. Opening an event's search is free
// when a stored result exists (onSearch handles that).
export default function CalendarView({ saved, onSearch }) {
  const [now, setNow] = useState(null);
  const [cat, setCat] = useState("");
  const [open, setOpen] = useState(null);
  // Dates depend on the viewer's "today": compute after mount so static HTML and the browser agree.
  useEffect(() => setNow(new Date()), []);
  const months = useMemo(() => (now ? calendar(now) : []), [now]);
  const current = useMemo(() => (now ? uploadNow(now) : []), [now]);
  const savedFor = (q) => (saved ?? []).find((x) => !x.creatorId && x.query === q.toLowerCase());
  const keep = (e) => !cat || e.cat === cat;
  const close = useCallback(() => setOpen(null), []);
  if (!now) return null;

  const nowList = current.filter(keep);
  return (
    <>
      <section className="cal-now">
        <div className="panel-head">
          <h2 className="section-title" style={{ margin: 0 }}>Upload sekarang <small className="muted">{nowList.length} acara · urut dari yang paling dekat</small></h2>
          <FilterPill label="Kategori" value={cat} def="" onChange={setCat} options={[["", "Semua"], ...Object.entries(CATEGORIES)]} />
        </div>
        {nowList.length ? (
          <div className="cal-now-grid">
            {nowList.map((e) => {
              const hit = savedFor(e.query);
              return (
                <article key={e.id} className={`cal-card st-${e.status}`}>
                  <div className="cal-card-top">
                    <span className="cal-emoji" aria-hidden="true">{e.emoji}</span>
                    <span className={`cal-status st-${e.status}`}>{STATUS[e.status][0]}</span>
                  </div>
                  <b className="cal-title">{e.label}</b>
                  <span className="cal-when">{e.dateText} · <b>{e.left} hari lagi</b></span>
                  <span className="hint" style={{ margin: 0 }}>{e.status === "upload" ? `Upload sebelum ${e.uploadByText}` : "Upload secepatnya, atau siapkan untuk tahun depan"}</span>
                  {hit?.velocity != null && <span className="idea-data"><b>~{fmtVel(+hit.velocity)} dl/bln</b>{hit.score != null && <> · skor {hit.score}</>}<em> · data tersimpan</em></span>}
                  <div className="chips small-chips">{e.keywords.slice(0, 4).map((k) => <span key={k} className="chip static">{k}</span>)}</div>
                  <div className="btns">
                    <button type="button" className="mini primary" onClick={() => onSearch(e.query)}>{hit ? "Buka data (gratis)" : "Cari aset →"}</button>
                    <button type="button" className="mini" onClick={() => setOpen(e)}>Detail</button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : <p className="hint">Tidak ada acara {cat ? `kategori ${CATEGORIES[cat]} ` : ""}yang jendela upload-nya sedang terbuka.</p>}
      </section>

      <section aria-labelledby="cal-year">
        <div className="panel-head">
          <h2 id="cal-year" className="section-title" style={{ margin: 0 }}>12 bulan ke depan</h2>
          <div className="cal-legend" aria-hidden="true">
            {["upload", "mepet", "nanti", "lewat"].map((s) => <span key={s}><i className={`dot st-${s}`} />{STATUS[s][0]}</span>)}
          </div>
        </div>
        <div className="cal-grid">
          {months.map((m, i) => {
            const list = m.events.filter(keep);
            return (
              <div key={m.key} className={`cal-month panel ${i === 0 ? "current" : ""}`}>
                <h3>{m.label}{i === 0 && <span className="nav-badge">BULAN INI</span>}</h3>
                {list.length ? (
                  <ul>
                    {list.map((e) => (
                      <li key={e.id + e.status}>
                        <button type="button" className={`cal-row st-${e.status}`} onClick={() => setOpen(e)} title={STATUS[e.status][1]}>
                          <span className="cal-day">{e.at.getDate()}</span>
                          <span className="cal-name"><span aria-hidden="true">{e.emoji}</span> {e.label}</span>
                          <i className={`dot st-${e.status}`} aria-label={STATUS[e.status][0]} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : <p className="hint" style={{ margin: 0 }}>Tidak ada acara.</p>}
              </div>
            );
          })}
        </div>
        <p className="hint">Tanggal dihitung otomatis. Hari raya berbasis kalender bulan (Ramadan, Idul Fitri/Adha, Imlek, Diwali, Holi) bisa bergeser ±1 hari tergantung negara.</p>
      </section>

      {open && <EventModal e={open} hit={savedFor(open.query)} onClose={close} onSearch={(q) => { close(); onSearch(q); }} />}
    </>
  );
}

function EventModal({ e, hit, onClose, onSearch }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.focus();
    const onKey = (ev) => ev.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal panel cal-modal" role="dialog" aria-modal="true" aria-labelledby="cal-modal-title" onClick={(ev) => ev.stopPropagation()}>
        <button ref={ref} type="button" className="modal-close" onClick={onClose} aria-label="Tutup">×</button>
        <span className="cal-emoji big" aria-hidden="true">{e.emoji}</span>
        <h2 id="cal-modal-title" style={{ margin: 0 }}>{e.label}</h2>
        <p className="muted" style={{ margin: 0 }}>{CATEGORIES[e.cat]} · {e.dateText}{e.status !== "lewat" && ` · ${e.left} hari lagi`}</p>
        <span className={`cal-status st-${e.status}`} style={{ justifySelf: "start" }}>{STATUS[e.status][0]}</span>
        {e.status !== "lewat" && (
          <dl className="asset-facts">
            <div><dt>Mulai siapkan</dt><dd>{e.startText}</dd></div>
            <div><dt>Upload sebelum</dt><dd>{e.uploadByText}</dd></div>
          </dl>
        )}
        {hit?.velocity != null && <p className="idea-data" style={{ margin: 0 }}><b>~{fmtVel(+hit.velocity)} dl/bln</b>{hit.score != null && <> · skor peluang {hit.score}</>}<em> · dari data tersimpan</em></p>}
        <div>
          <span className="field-label">Keyword yang disarankan</span>
          <div className="chips small-chips" style={{ marginTop: 6 }}>{e.keywords.map((k) => <span key={k} className="chip static">{k}</span>)}</div>
        </div>
        <div className="btns">
          <button type="button" className="primary" onClick={() => onSearch(e.query)}>{hit ? "Buka data tersimpan (gratis)" : `Cari aset “${e.query}” →`}</button>
          <CopyButton label="Salin keyword" text={e.keywords.join(", ")} />
        </div>
      </div>
    </div>
  );
}
