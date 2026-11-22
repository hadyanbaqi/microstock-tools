"use client";
import { useEffect, useRef, useState } from "react";
import HtmlStudio from "./HtmlStudio";

// Studio Motion = Agent, Editor HTML and Bulk in one page (HtmlStudio; owner's choice: no template/scene tab) + the open requests to Claude. A finished request
// opens its HTML in the editor; `/?motion=<id>` opens an HTML order directly. (The "Video dari Claude" list and bulk render
// were removed 27 Oct 2026, owner's choice.)
const REQ_LABEL = { baru: "Menunggu Claude", dikerjakan: "Sedang dibuat", selesai: "Selesai", batal: "Dibatalkan" };

export default function MotionStudio({ active, jobId, onKeys }) {
  const [loaded, setLoaded] = useState(false);
  const [jobErr, setJobErr] = useState("");
  const [job, setJob] = useState(null);
  const [reqs, setReqs] = useState([]);
  const seen = useRef(null);

  async function loadReqs() { try { const r = await fetch("/api/motion/request?limit=10"); const j = await r.json(); if (r.ok) setReqs(j.requests); } catch {} }
  useEffect(() => { if (active && !loaded) { setLoaded(true); loadReqs(); } }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  // While a request waits for Claude, check every 10 s; a finished one opens its HTML in the editor automatically.
  const waiting = reqs.some((r) => r.status === "baru" || r.status === "dikerjakan");
  useEffect(() => {
    if (!active || !waiting) return;
    const iv = setInterval(async () => {
      const r = await fetch("/api/motion/request?limit=10").then((x) => x.json()).catch(() => null); if (!r?.requests) return;
      const done = r.requests.find((q) => q.status === "selesai" && q.job_id && reqs.find((o) => o.id === q.id && o.status !== "selesai"));
      setReqs(r.requests);
      if (done && seen.current !== done.job_id) { seen.current = done.job_id; const j = await fetch(`/api/motion?id=${done.job_id}`).then((x) => x.json()).catch(() => null); if (j?.job) openJob(j.job); }
    }, 10000);
    return () => clearInterval(iv);
  }, [active, waiting, reqs]); // eslint-disable-line react-hooks/exhaustive-deps
  async function cancelReq(id) { await fetch("/api/motion/request", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => {}); loadReqs(); }
  useEffect(() => {
    if (!jobId || !/^[0-9a-f-]{36}$/i.test(jobId)) return;
    fetch(`/api/motion?id=${encodeURIComponent(jobId)}`).then((r) => r.json()).then((j) => {
      if (j.job?.spec?.template === "html") openJob(j.job); else if (j.job) setJobErr("Pesanan ini adegan dengan luma matte, bukan kode HTML, jadi tidak bisa dibuka di editor."); else if (j.error && jobId.length > 8) setJobErr(j.error);
    }).catch(() => {});
  }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps
  function openJob(j) { setJob(j); setJobErr(""); window.scrollTo({ top: 0, behavior: "smooth" }); }

  return (
    <>
      <HtmlStudio job={job} active={active} onKeys={onKeys} onJobUsed={() => setJob(null)} onSent={(r) => setReqs((x) => [r, ...x])} />
      {reqs.length > 0 && <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-head">
          <h2 className="section-title" style={{ margin: 0 }}>Permintaan ke Claude <small className="muted">{waiting ? "menunggu Claude · dicek tiap 10 detik" : "semua selesai"}</small></h2>
          <button type="button" className="mini" onClick={loadReqs}>Muat ulang</button>
        </div>
        <div className="mjobs">
          {reqs.map((r) => (
            <div key={r.id} className="mjob">
              <span className={`mstatus s-${r.status === "selesai" ? "didistribusi" : r.status === "batal" ? "gagal" : r.status === "dikerjakan" ? "dirender" : "baru"}`}>{REQ_LABEL[r.status] ?? r.status}</span>
              <small>{r.idea || (r.has_image ? "Dari gambar referensi" : "-")}</small>
              <small className="muted">{r.has_image ? "Gambar · " : ""}{r.aspect} · {r.duration} dtk · {new Date(r.created_at).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small>
              {r.status === "selesai" && r.job_id && <button type="button" className="mini primary" onClick={async () => { const j = await fetch(`/api/motion?id=${r.job_id}`).then((x) => x.json()).catch(() => null); if (j?.job) openJob(j.job); else setJobErr("Kode tidak bisa dibuka. Coba lagi."); }}>Buka kode</button>}
              {(r.status === "baru" || r.status === "dikerjakan") && <button type="button" className="mini" onClick={() => cancelReq(r.id)}>Batalkan</button>}
            </div>
          ))}
        </div>
      </section>}
      {jobErr && <div className="notice err" style={{ marginTop: 18 }}>{jobErr}</div>}
    </>
  );
}
