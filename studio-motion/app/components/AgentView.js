"use client";
import { useEffect, useRef, useState } from "react";
import { htmlWarnings, qualityFix } from "@/lib/htmlMotion.mjs";
import { commandStates, normalizeIdeas, parseCommand, parseIdeaLine, researchDigest, tooSimilar } from "@/lib/ai/agentPrompt";
import { parseJsonLoose } from "@/lib/ai/anthropic";
import { estimateIdr, fmtIdr } from "@/lib/ai/catalog";
import { keywordList, titleIdeas } from "@/lib/metadataIdeas";
import { COST_PER_100 } from "@/lib/themes";
import { peekResearch, research } from "./util";

// Agent tab of Studio Motion: one command → plan → live Adobe Stock research (Apify; cost confirmed first) → insight + N motion
// ideas (Ciora) → HTML code per idea (/api/motion/generate; a file that fails the checks gets one automatic rewrite) → the
// shared queue as soon as it is written, so stopping keeps what was paid for → SEO metadata (/api/motion/metadata), added to the
// queued videos. Stays mounted (hidden) so a run continues while the owner browses.
const KEY_LAST = "stockscope:agent-last";
const EXAMPLES = [
  "Riset gold particles, buat 5 video loop background luxury",
  "Cari celah di niche abstract technology, buat 10 video 16:9",
  "Riset neon light lines, 6 video vertikal 9:16 untuk reels",
  "Buat 5 video bokeh pastel untuk background wedding",
];
const STEPS = [["plan", "Memahami perintah"], ["research", "Riset Adobe Stock"], ["ideas", "Menyusun ide"], ["code", "Menulis kode HTML"], ["meta", "Metadata SEO"]];
const PAYER = { pool: "kantong token Apify", user: "token Apify kamu", server: "token Apify server", demo: "data demo (gratis)" };
const MAX_ITEMS = 60, PARALLEL = 2;

const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const usd = (n) => `$${String(+n.toFixed(2)).replace(".", ",")}`;
function extractHtml(t) {
  const s = String(t || "").replace(/```[a-z]*\n?/gi, "");
  const a = s.search(/<!DOCTYPE html|<html[\s>]/i); if (a < 0) return "";
  const b = s.toLowerCase().lastIndexOf("</html>");
  return (b > a ? s.slice(a, b + 7) : s.slice(a)).trim();
}

export default function AgentView({ active, onKeys, studio, onApply, onQueue }) {
  const [ready, setReady] = useState(null); // { ready, model, metaModel, reason }
  const [models, setModels] = useState(null);
  const [command, setCommand] = useState("");
  const [run, setRun] = useState(null); // { step, status, plan, peek, digest, data, insight, ideas[], error, demo, queued }
  const abortRef = useRef(null);
  const busy = run && ["plan", "research", "ideas", "code", "meta"].includes(run.step) && run.status === "jalan";

  useEffect(() => {
    if (!active) return;
    fetch("/api/agent/plan").then((r) => r.json()).then(setReady).catch(() => setReady({ ready: false, reason: "Server tidak bisa dihubungi." }));
    fetch("/api/motion/models").then((r) => r.json()).then(setModels).catch(() => {});
  }, [active]);
  useEffect(() => { const last = read(KEY_LAST); if (last?.ideas) setRun({ ...last, peek: undefined, peekKey: undefined, status: last.status === "jalan" ? "berhenti" : last.status }); }, []);
  useEffect(() => { if (run && run.status !== "jalan") write(KEY_LAST, { ...run, data: null, ideas: run.ideas?.map(({ html, ...x }) => x) }); }, [run]);

  const set = (p) => setRun((r) => ({ ...r, ...(typeof p === "function" ? p(r) : p) }));
  const setIdea = (i, p) => setRun((r) => ({ ...r, ideas: r.ideas.map((x, k) => (k === i ? { ...x, ...p } : x)) }));
  const priceOf = (id, task) => { const m = models?.models?.find((x) => x.id === id); return m ? estimateIdr(m, task) : null; };

  // Step 1: plan (read instantly in the browser, no AI call) + the research cost check. Nothing is paid before the confirm.
  async function start(e) {
    e?.preventDefault();
    if (!command.trim() || busy) return;
    const stated = commandStates(command), plan = parseCommand(command);
    if (!stated.aspect) plan.aspect = studio.aspect;
    if (!stated.duration) plan.duration = Math.min(30, Math.max(5, studio.duration));
    if (!plan.keyword) { setRun({ step: "plan", status: "gagal", command: command.trim(), plan, ideas: [], error: "Topik tidak terbaca dari perintah. Sebutkan topiknya, mis. “riset gold particles, buat 5 video”." }); return; }
    setRun({ step: "plan", status: "jalan", command: command.trim(), plan, ideas: [] });
    const peek = await peekResearch(body(plan));
    // Unknown cost (the check failed): do not offer to run, a paid search must always be confirmed with its price.
    if (!peek) { setRun({ step: "plan", status: "gagal", command: command.trim(), plan, ideas: [], error: "Tidak bisa memeriksa biaya riset. Periksa koneksi atau login lalu coba lagi." }); return; }
    setRun({ step: "confirm", status: "tunggu", command: command.trim(), plan, peek, peekKey: JSON.stringify(body(plan)), useSaved: !!peek.savedAt && !peek.cached, ideas: [] });
  }
  const body = (plan) => ({ query: plan.keyword, asset: plan.asset, ai: "", order: "downloads", maxItems: MAX_ITEMS });

  // Steps 2–6 after the confirmation.
  async function go() {
    const ac = new AbortController(); abortRef.current = ac;
    const plan = run.plan, cmd = run.command;
    let useSavedNow = !!run.useSaved;
    // The plan can be edited after the cost check (or restored after a reload): re-check, and ask again if it would now cost money.
    if (run.peekKey !== JSON.stringify(body(plan))) {
      set({ status: "jalan", error: null });
      const fresh = await peekResearch(body(plan));
      if (!fresh) { set({ status: "tunggu", error: "Tidak bisa memeriksa biaya riset. Coba lagi." }); abortRef.current = null; return; }
      const useSaved = !!fresh.savedAt && !fresh.cached;
      useSavedNow = useSaved;
      set({ peek: fresh, peekKey: JSON.stringify(body(plan)), useSaved, status: "tunggu" });
      if (!fresh.cached && fresh.payer !== "demo" && !useSaved) { abortRef.current = null; return; }
    }
    onApply({ aspect: plan.aspect, duration: plan.duration });
    const stop = () => { if (ac.signal.aborted) throw Object.assign(new Error("Dihentikan."), { name: "AbortError" }); };
    try {
      set({ step: "research", status: "jalan", error: null });
      const data = await research({ ...body(plan), ...(useSavedNow ? { useSaved: true } : {}) });
      stop();
      const digest = researchDigest(data);
      set({ data, digest, demo: !!data.demo, cached: !!data.cached });

      // Ideas arrive one per line while the model writes; each one starts its HTML code at once (PARALLEL at a time).
      set({ step: "ideas", ideas: [], insight: "", ideaChars: 0 });
      const out = [], ideaNames = new Set();
      let next = 0, streamDone = false;
      const waiters = [];
      const waitForIdea = () => new Promise((res) => waiters.push(res));
      const poke = () => { while (waiters.length) waiters.shift()(); }; // every waiting worker re-checks the list
      ac.signal.addEventListener("abort", () => { streamDone = true; poke(); });
      async function writeHtml(i) {
        setIdea(i, { status: "menulis", chars: 0 });
        set((r0) => (r0.step === "ideas" && streamDone ? { step: "code" } : {}));
        const brief = `${out[i].title}\n\n${out[i].idea}${plan.style ? `\nGaya: ${plan.style}` : ""}`;
        // A rewrite costs one more HTML call, so it happens once, only for a broken connection or a file that failed the checks.
        let best = null, lastErr = null, fix = "";
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const res = await fetch("/api/motion/generate", { method: "POST", headers: { "content-type": "application/json" }, signal: ac.signal,
              body: JSON.stringify({ idea: fix ? `${brief}\n\nThe previous attempt failed: ${fix}.` : brief, aspect: plan.aspect, duration: plan.duration, background: studio.background }) });
            if (!res.ok) { const j = await res.json().catch(() => ({})); throw Object.assign(new Error(j.error || `Gagal (${res.status})`), { final: res.status < 500 }); }
            const reader = res.body.getReader(), dec = new TextDecoder(); let text = "", tick = 0;
            for (;;) { const { value, done } = await reader.read(); if (done) break; text += dec.decode(value, { stream: true }); if (++tick % 20 === 0) setIdea(i, { chars: text.length }); }
            const err = text.match(/<!-- CVE_ERROR ([^>]*) -->/);
            const html = extractHtml(text);
            if (err) throw new Error(`Penulisan kode terputus: ${err[1]}`);
            if (!html) throw new Error("Model tidak menulis kode HTML.");
            const warns = htmlWarnings(html);
            if (!best || warns.length < best.warns.length) best = { html, warns };
            lastErr = null; fix = qualityFix(best.warns);
            if (!fix) break;
          } catch (e2) {
            if (e2.name === "AbortError") throw e2;
            lastErr = e2; if (e2.final) break;
          }
          if (attempt === 0) setIdea(i, { status: "memperbaiki", chars: 0 });
        }
        if (best) {
          out[i] = { ...out[i], html: best.html, warns: best.warns, status: "selesai", chars: best.html.length };
          setIdea(i, { html: best.html, warns: best.warns, status: "selesai", chars: best.html.length });
          if (!best.warns.includes("besar")) window.dispatchEvent(new CustomEvent("stockscope:batch-sync", { detail: { topic: plan.keyword, items: [{ id: out[i].id, n: i + 1, name: out[i].name, html: best.html, warns: best.warns, status: "antre" }] } }));
        } else {
          out[i] = { ...out[i], status: "gagal", error: lastErr?.message || "Gagal menulis kode." };
          setIdea(i, { status: "gagal", error: out[i].error });
        }
      }
      async function worker() {
        for (;;) {
          stop();
          if (next < out.length) { await writeHtml(next++); continue; }
          if (streamDone) return;
          await waitForIdea();
        }
      }
      // Workers only throw on abort; swallow that here and re-check with stop() after they finish.
      const workers = Array.from({ length: PARALLEL }, () => worker().catch((e) => { if (e.name !== "AbortError") console.warn(e); }));

      const r = await fetch("/api/agent/ideas", { method: "POST", headers: { "content-type": "application/json" }, signal: ac.signal,
        body: JSON.stringify({ command: cmd, plan, digest, background: studio.background }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); streamDone = true; poke(); throw new Error(j.error || `Gagal (${r.status})`); }
      const reader = r.body.getReader(), dec = new TextDecoder();
      let buf = "", all = "", errText = "";
      const take = (line) => {
        const e0 = line.match(/<!-- CVE_ERROR ([^>]*) -->/); if (e0) errText = e0[1];
        const got = parseIdeaLine(line, ideaNames);
        if (got?.insight) set({ insight: got.insight });
        if (got?.idea && out.length < plan.count && !tooSimilar(got.idea.idea, out.map((x) => x.idea))) {
          const x = { ...got.idea, id: uid(), status: "menunggu" };
          out.push(x); set((r0) => ({ ideas: [...r0.ideas, x] })); poke();
        }
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const t = dec.decode(value, { stream: true }); buf += t; all += t;
        set({ ideaChars: all.length });
        let k; while ((k = buf.indexOf("\n")) >= 0) { take(buf.slice(0, k)); buf = buf.slice(k + 1); }
      }
      take(buf);
      // A model that ignored the JSON Lines format and wrote one big JSON object: read it as a whole.
      if (!out.length) {
        const legacy = normalizeIdeas(parseJsonLoose(all) || {}, plan.count);
        if (legacy.insight) set({ insight: legacy.insight });
        for (const x0 of legacy.ideas) { const x = { ...x0, id: uid(), status: "menunggu" }; out.push(x); set((r0) => ({ ideas: [...r0.ideas, x] })); }
      }
      streamDone = true; poke();
      set((r0) => ({ step: out.some((x) => x.status !== "selesai" && x.status !== "gagal") ? "code" : r0.step }));
      if (!out.length) throw new Error(errText ? `${errText} (model ${r.headers.get("x-model") || "?"})` : "Model tidak memberi ide yang bisa dibaca. Coba lagi atau ganti model di Koneksi → AI.");
      set({ step: "code" });
      await Promise.all(workers);
      stop();
      const good = out.filter((x) => x.html && !x.warns.includes("besar"));
      if (!good.length) throw new Error("Tidak ada kode HTML yang berhasil ditulis. Coba lagi atau ganti model di Koneksi → AI.");

      set({ step: "meta" });
      const researchMeta = { keyword: plan.keyword, keywords: keywordList(data, 40), titles: titleIdeas(data).map((t) => t.title) };
      for (let k = 0; k < good.length; k += 10) {
        const chunk = good.slice(k, k + 10);
        try {
          const res = await fetch("/api/motion/metadata", { method: "POST", headers: { "content-type": "application/json" }, signal: ac.signal,
            body: JSON.stringify({ kind: "video", research: researchMeta, items: chunk.map((x) => ({ id: x.id, name: x.name, idea: `${x.title}. ${x.idea}`, html: x.html })) }) });
          const j = await res.json();
          if (!res.ok) throw new Error(j.error || `Gagal (${res.status})`);
          for (const m of j.results) { const x = good.find((g) => g.id === m.id); if (x) { x.meta = m.meta || null; x.metaError = m.error || ""; } }
        } catch (e3) { if (e3.name === "AbortError") throw e3; chunk.forEach((x) => { x.metaError = e3.message; }); }
      }
      set((r0) => ({ ideas: r0.ideas.map((x) => { const g = good.find((y) => y.id === x.id); return g ? { ...x, meta: g.meta, metaError: g.metaError } : x; }) }));
      window.dispatchEvent(new CustomEvent("stockscope:batch-meta", { detail: { items: good.map((x) => ({ id: x.id, meta: x.meta, metaError: x.metaError })) } }));
      set({ step: "done", status: "selesai", queued: good.length });
    } catch (err) {
      ac.abort(); // stop any HTML calls still running (and billing) after a failed stream
      setRun((r0) => ({ ...r0, status: err.name === "AbortError" ? "berhenti" : "gagal", error: err.name === "AbortError" ? "Dihentikan." : err.message }));
    } finally { abortRef.current = null; }
  }

  const stopRun = () => abortRef.current?.abort();
  const editPlan = (p) => setRun((r) => ({ ...r, plan: { ...r.plan, ...p } }));
  const stepIdx = run ? STEPS.findIndex(([k]) => k === run.step) : -1;
  const p = run?.plan;
  const paid = run?.peek && !run.peek.cached && run.peek.payer !== "demo" && !run.useSaved;
  const aiEach = p ? [priceOf(models?.defaults?.html || ready?.model, "html"), priceOf(models?.defaults?.meta || ready?.metaModel, "meta")] : [];
  const aiTotal = p && aiEach.every((x) => x != null) ? (aiEach[0] + aiEach[1]) * p.count : null;

  return (
    <div className="agent">
      <form className="agent-cmd panel" onSubmit={start}>
        <label htmlFor="agent-cmd" className="agent-cmd-label">Perintah untuk agent</label>
        <textarea id="agent-cmd" value={command} onChange={(e) => setCommand(e.target.value)} rows={3} maxLength={1500}
          placeholder="Contoh: riset gold particles, buat 5 video loop background luxury 16:9"
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) start(e); }} />
        <div className="agent-cmd-foot">
          <div className="chips">{EXAMPLES.map((x) => <button key={x} type="button" className="mini" onClick={() => setCommand(x)}>{x}</button>)}</div>
          <div className="btns">
            {busy && <button type="button" onClick={stopRun}>Berhenti</button>}
            <button type="submit" className="primary" disabled={busy || !command.trim() || ready?.ready === false}>{busy ? "Agent bekerja…" : "Jalankan agent"}</button>
          </div>
        </div>
        {ready && !ready.ready && <div className="notice err">{ready.reason} <button type="button" className="linkish" onClick={onKeys}>Buka Koneksi</button></div>}
        {ready?.ready && <small className="muted">AI: <b>{ready.model}</b> · ganti di <button type="button" className="linkish" onClick={onKeys}>Koneksi → AI</button></small>}
      </form>

      {!run && (
        <div className="agent-how panel">
          {STEPS.map(([k, l], i) => <div key={k}><span className="ck-step">{i + 1}</span><span>{l}</span></div>)}
          <p className="muted small">Kamu cukup menulis perintah. Agent membaca perintahmu, menunjukkan rencana dan biayanya, baru jalan setelah kamu setuju. Video langsung masuk antrean di bawah begitu kodenya jadi, siap dirender beserta CSV.</p>
        </div>
      )}

      {run && (
        <div className="agent-run">
          <ol className="agent-steps panel">
            {STEPS.map(([k, l], i) => {
              const st = run.step === "done" || i < stepIdx ? "ok" : i === stepIdx ? (run.status === "gagal" ? "bad" : run.status === "jalan" ? "on" : "wait") : run.step === "confirm" && i === 1 ? "wait" : "";
              return <li key={k} className={st}><i>{st === "ok" ? "✓" : i + 1}</i><span>{l}{k === "ideas" && run.step === "ideas" ? ` ${run.ideas.length}/${p?.count || "?"}${run.ideaChars ? ` · ${Math.round(run.ideaChars / 100) / 10} KB` : ""}` : ""}{k === "code" && run.ideas.length ? ` ${run.ideas.filter((x) => x.status === "selesai").length}/${run.ideas.length}` : ""}</span></li>;
            })}
          </ol>

          <div className="agent-main">
            {run.status === "gagal" && <div className="notice err">{run.error}</div>}
            {run.status === "berhenti" && <div className="notice">{run.error || "Dihentikan."} Video yang sudah jadi tetap ada di antrean.</div>}

            {run.step === "confirm" && p && (
              <div className="panel agent-confirm">
                <h3>Rencana agent</h3>
                <div className="agent-plan">
                  <label>Keyword riset<input value={p.keyword} maxLength={60} onChange={(e) => editPlan({ keyword: e.target.value })} /></label>
                  <label>Jenis aset<select value={p.asset} onChange={(e) => editPlan({ asset: e.target.value })}>{["video", "vector", "illustration", "photo"].map((x) => <option key={x}>{x}</option>)}</select></label>
                  <label>Jumlah video<input type="number" min={1} max={20} value={p.count} onChange={(e) => editPlan({ count: Math.min(20, Math.max(1, +e.target.value || 1)) })} /></label>
                  <label>Rasio<select value={p.aspect} onChange={(e) => editPlan({ aspect: e.target.value })}>{["16:9", "9:16", "1:1"].map((x) => <option key={x}>{x}</option>)}</select></label>
                  <label>Durasi (dtk)<input type="number" min={5} max={30} value={p.duration} onChange={(e) => editPlan({ duration: Math.min(30, Math.max(5, +e.target.value || 10)) })} /></label>
                </div>
                <small className="muted">Keyword pakai bahasa Inggris dengan urutan natural (mis. “gold particles”, bukan “particles gold”). Periksa sebelum jalan: keyword menentukan hasil riset berbayar.</small>
                {p.style && <p className="small muted">Gaya: {p.style}</p>}
                {run.peek?.savedAt && !run.peek.cached && (
                  <label className="agent-saved"><input type="checkbox" checked={!!run.useSaved} onChange={(e) => setRun((r) => ({ ...r, useSaved: e.target.checked }))} />
                    {" "}Pakai salinan tersimpan dari {new Date(run.peek.savedAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })} (gratis). Hilangkan centang untuk ambil data baru (berbayar).</label>
                )}
                <ul className="agent-cost">
                  <li><b>Riset:</b> {run.peek?.cached ? "data masih baru di database, gratis" : run.useSaved ? "salinan tersimpan di database, gratis" : run.peek?.payer === "demo" ? "tidak ada token Apify, memakai data demo" :
                    `${MAX_ITEMS} aset ${p.asset} terlaris untuk “${p.keyword}”, ± ${usd((MAX_ITEMS * COST_PER_100) / 100)} dari ${PAYER[run.peek?.payer] || "Apify"}`}</li>
                  <li><b>AI (Ciora):</b> {p.count} kode HTML + {p.count} metadata, {aiTotal != null ? `perkiraan ${fmtIdr(aiTotal)}` : "harga model belum diketahui"}. Kode yang gagal dicek ditulis ulang otomatis sekali, jadi biaya bisa sedikit naik.</li>
                  <li><b>Waktu:</b> sekitar {Math.max(1, Math.round((60 + p.count * 70 / PARALLEL) / 60))} menit. Boleh pindah halaman, agent tetap jalan. Rasio dan durasi ini juga menjadi Pengaturan video.</li>
                </ul>
                <div className="btns">
                  <button type="button" className="primary" onClick={go} disabled={!p.keyword.trim()}>{paid ? "Setuju, jalankan" : "Jalankan"}</button>
                  <button type="button" onClick={() => setRun(null)}>Batal</button>
                </div>
              </div>
            )}

            {run.digest && (
              <div className="panel agent-research">
                <div className="agent-research-head"><h3>Riset “{run.digest.keyword}”</h3>
                  <span className="muted small">{run.demo ? "data demo" : run.cached ? "dari database (masih baru)" : "data live Adobe Stock"} · {run.digest.sample} aset</span></div>
                <div className="agent-kpis">
                  <div><small>Skor peluang</small><b>{run.digest.opportunityScore ?? "-"}</b></div>
                  <div><small>Rata-rata dl/bln</small><b>{run.digest.avgDlPerMonth ?? "-"}</b></div>
                  <div><small>Aset AI</small><b>{run.digest.aiSharePct ?? "-"}%</b></div>
                  <div><small>Dominasi top 5</small><b>{run.digest.top5DominancePct ?? "-"}%</b></div>
                </div>
                {run.digest.verdict && <p className="small">{run.digest.verdict}</p>}
                {run.insight && <p className="agent-insight">{run.insight}</p>}
                {run.digest.fastKeywords?.length > 0 && <div className="chips">{run.digest.fastKeywords.slice(0, 10).map((k) => <span key={k} className="chip-s ok">{k}</span>)}</div>}
              </div>
            )}

            {run.ideas?.length > 0 && (
              <div className="agent-ideas">
                {run.ideas.map((x) => (
                  <article key={x.id} className={`panel agent-idea ${x.status}`}>
                    <div className="agent-idea-head"><b>{x.title || x.name}</b>
                      <span className={`tokstat ${x.status === "selesai" ? "ok" : x.status === "gagal" ? "ditolak" : ""}`}>
                        {x.status === "menulis" ? `menulis ${Math.round((x.chars || 0) / 1000)} KB` : x.status}</span></div>
                    <p className="small">{x.idea}</p>
                    <small className="muted">{x.name}.mp4{x.warns?.length ? ` · ${x.warns.join(", ")}` : ""}</small>
                    {x.meta && <small>✓ Metadata: <b>{x.meta.title}</b> · {x.meta.keywords.length} keyword</small>}
                    {x.metaError && <small className="err">Metadata: {x.metaError}</small>}
                    {x.error && <small className="err">{x.error}</small>}
                  </article>
                ))}
              </div>
            )}

            {run.step === "done" && (
              <div className="panel agent-done">
                <b>{run.queued} video masuk antrean.</b>
                <p className="small muted">Klik Pratinjau untuk cek tiap video, lalu Render dan CSV Adobe / Shutterstock / Vecteezy.</p>
                <div className="btns">
                  <button type="button" className="primary" onClick={onQueue}>Buka antrean</button>
                  <button type="button" onClick={() => { setRun(null); }}>Perintah baru</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
