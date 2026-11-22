"use client";
import { useCallback, useEffect, useState } from "react";
import NicheReport from "./components/NicheReport";
import ContributorView from "./components/ContributorView";
import Dashboard from "./components/Dashboard";
import Guide from "./components/Guide";
import TrendView from "./components/TrendView";
import CalendarView from "./components/CalendarView";
import SavedSearches, { useSaved } from "./components/SavedSearches";
import ConfirmDialog, { confirmSkipped } from "./components/ConfirmDialog";
import SearchFilters from "./components/SearchFilters";
import KeysHub from "./components/KeysHub";
import MotionStudio from "./components/MotionStudio";
import { Icon, Loader, SEARCH_STEPS, SkeletonCards } from "./components/ui";
import { getToken, peekResearch, research, store } from "./components/util";
import { COST_PER_100 } from "@/lib/themes";

const HISTORY_KEY = "stockscope:history";
// The asset type of the last search is kept per browser. Default vector: "Semua jenis" returned only photos in real data.
const ASSET_KEY = "stockscope:last-asset";
const ASSETS = ["all", "photo", "illustration", "vector", "video", "template", "3d"];
const SKIP_SEARCH_CONFIRM = "stockscope:skip-search-confirm";
const PAYER = { pool: "kantong token Apify (sisa kredit terbanyak dulu)", user: "akun Apify Anda (token Anda)", server: "akun Apify server StockScope" };
const ORDER_SHORT = { trending: "naik", relevance: "relevansi", recent: "terkini", newest: "terbaru", featured: "unggulan", undiscovered: "belum terjamah" };

const ICONS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z",
  agent: "M12 3l2.2 4.8L19 10l-4.8 2.2L12 17l-2.2-4.8L5 10l4.8-2.2ZM19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9Z",
  niche: "M21 21l-4.3-4.3M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z",
  trends: "M3 17l6-6 4 4 8-8M14 7h7v7",
  calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
  motion: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM10 9.5v5l4.5-2.5Z",
  contributor: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
};
// Top navigation, in the order of the job: overview, find assets, spot trends, study contributors.
const NAV = [["home", "Beranda", "Beranda"], ["niche", "Cari Aset", "Cari"], ["trends", "Tren Keyword", "Tren"], ["calendar", "Kalender", "Kalender"], ["contributor", "Lacak Kontributor", "Lacak"], ["motion", "Studio Motion", "Motion"]];
const KEY_ICON = "M2.6 18.4A2 2 0 0 0 2 19.8V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.2a2 2 0 0 0 1.4-.6l.8-.8a6.5 6.5 0 1 0-4-4ZM16.5 7.5h.01";
const PAGES = {
  home: ["Beranda", ""],
  niche: [<>Cari <em>Aset</em></>, "Ketik keyword, pilih filter, lalu lihat aset yang paling cepat laku beserta brief, keyword, dan persaingannya."],
  trends: [<>Tren <em>Keyword</em></>, "Keyword yang sedang naik, punya celah, laku stabil, atau sudah jenuh di 15 tema Adobe Stock."],
  calendar: [<>Kalender <em>Microstock</em></>, "Acara yang dicari pembeli 1–3 bulan sebelumnya: apa yang harus di-upload sekarang, dan rencana 12 bulan ke depan."],
  motion: [<>Studio <em>Motion</em></>, "Tempel kode HTML animasi, lihat pratinjaunya, lalu render jadi MP4 di browser. Claude bisa mengirim kodenya langsung lewat MCP."],
  contributor: [<>Lacak <em>Kontributor</em></>, "Lihat karya terlaris, analitik portofolio, dan performa download kontributor mana pun."],
};

export default function Home() {
  const [mode, setMode] = useState("home");
  const [form, setForm] = useState({ query: "", asset: "vector", ai: "", order: "downloads", maxItems: 60 });
  const [data, setData] = useState(null);
  const [trending, setTrending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  // Koneksi hub: false = closed, else the open tab. setSettingsOpen(true) (old callers) opens the Apify tab.
  const [hubTab, setHubTab] = useState(false);
  const setSettingsOpen = useCallback((v) => setHubTab(v ? (typeof v === "string" ? v : "apify") : false), []);
  const [hasToken, setHasToken] = useState(false);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  // One focus trap for every modal (role="dialog" aria-modal): Tab and Shift+Tab stay inside the topmost one.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Tab") return;
      const all = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      const dlg = all[all.length - 1];
      if (!dlg) return;
      const f = [...dlg.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (!dlg.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const [contributorRequest, setContributorRequest] = useState(null);
  // A search waiting for the user's OK because it would spend Apify credit: { body, peek }.
  const [pending, setPending] = useState(null);
  const cancelPending = useCallback(() => setPending(null), []);
  const [trendsOpened, setTrendsOpened] = useState(false);
  const [motionOpened, setMotionOpened] = useState(false);
  const [motionJob, setMotionJob] = useState(null);
  const [saved, reloadSaved] = useSaved();
  useEffect(() => {
    // Older history entries used "keyword"; contributor lookups now live in the watchlist.
    setHistory((store(HISTORY_KEY) ?? []).map((h) => (h.mode === "keyword" ? { ...h, mode: "niche" } : h)).filter((h) => h.mode === "niche"));
    setHasToken(!!getToken());
    const lastAsset = store(ASSET_KEY);
    if (ASSETS.includes(lastAsset)) setForm((f) => ({ ...f, asset: lastAsset }));
    // Tokens in the server's pool count too (shared by every device).
    fetch("/api/apify-tokens?summary=1").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.usable) setHasToken(true); }).catch(() => {});
    // A link from Claude (MCP buat_video) opens that video order in Studio Motion.
    const job = new URLSearchParams(window.location.search).get("motion");
    if (job) { setMotionJob(job); setMotionOpened(true); setMode("motion"); }
  }, []);

  // useSaved: reopen the stored copy of this search (free) instead of fetching new data.
  async function search(body, { useSaved = false } = {}) {
    if (loading) return;
    setLoading(true); setError("");
    try {
      const json = await research({ ...body, creatorId: "", ...(useSaved ? { useSaved: true } : {}) });
      setData(json);
      setTrending(body.order === "trending");
      remember(body);
      // A paid fetch is now stored; show it in "Tersimpan".
      if (!json.cached && !json.demo) reloadSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Cached or demo results are free; anything else asks first (unless the user opted out). When an older
  // stored copy exists the dialog always opens, so the user can reopen it for free instead of paying again.
  async function requestSearch(body) {
    if (loading || !body.query.trim()) return;
    if (ASSETS.includes(body.asset)) store(ASSET_KEY, body.asset);
    const peek = await peekResearch({ ...body, creatorId: "" });
    // Unknown cost (check failed): never search unconfirmed, it could spend credit.
    if (!peek) { setError("Tidak bisa memeriksa biaya pencarian. Periksa koneksi atau login lalu coba lagi."); return; }
    if (peek.cached || peek.payer === "demo") return search(body);
    if (confirmSkipped(SKIP_SEARCH_CONFIRM)) return search(body);
    setPending({ body, peek });
  }
  function openSaved(params) {
    if (loading) { setError("Tunggu pencarian yang sedang berjalan selesai dulu."); return; }
    const next = { ...form, query: params.query, asset: params.asset, ai: params.ai, order: params.order, maxItems: params.maxItems };
    setForm(next);
    go("niche");
    search(next, { useSaved: true });
  }

  function remember(body) {
    const entry = { mode: "niche", query: body.query.trim().toLowerCase(), asset: body.asset, order: body.order };
    const id = (h) => `${h.query}|${h.asset}|${h.order}`;
    setHistory((h) => {
      const next = [entry, ...h.filter((x) => id(x) !== id(entry))].slice(0, 12);
      store(HISTORY_KEY, next);
      return next;
    });
  }

  function go(m) {
    if (m === "trends") setTrendsOpened(true);
    if (m === "motion") setMotionOpened(true);
    setMode(m);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function researchQuery(q, asset) {
    if (loading) { setError("Tunggu pencarian yang sedang berjalan selesai dulu."); go("niche"); return; }
    const next = { ...form, query: q, ...(asset ? { asset } : {}) };
    setForm(next);
    go("niche");
    requestSearch(next);
  }
  // A keyword from ideas/calendar: reopen its stored result for free, otherwise search (with confirmation).
  function openQuery(q) {
    const hit = (saved ?? []).find((x) => !x.creatorId && x.query === q.toLowerCase());
    return hit ? openSaved(hit.params) : researchQuery(q);
  }
  function trackContributor(id, opts) {
    setContributorRequest({ id: String(id), opts, at: Date.now() });
    go("contributor");
  }

  const [title, desc] = PAGES[mode];

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <button type="button" className="brand" onClick={() => go("home")} aria-label="StockScope, ke Beranda">
            <span className="brand-logo" aria-hidden="true">s</span>
            <span className="brand-name">Stock<em>scope</em></span>
          </button>
          <nav className="topnav" aria-label="Menu">
            {NAV.map(([k, label, short, badge]) => (
              <button key={k} type="button" className={mode === k ? "on" : ""} aria-current={mode === k ? "page" : undefined} aria-label={label} onClick={() => go(k)}>
                <Icon d={ICONS[k]} /><span className="nav-full">{label}</span><span className="nav-short" aria-hidden="true">{short}</span>
                {badge && <span className="nav-badge">{badge}</span>}
              </button>
            ))}
          </nav>
          <div className="topbar-right">
            <button type="button" className={`token-btn ${hasToken ? "" : "off"}`} onClick={() => setSettingsOpen("ciora")}
              title="Hubungkan data riset dan AI" aria-label="Koneksi">
              <Icon d={KEY_ICON} /><span className="lbl">Koneksi</span><span className="dot" aria-hidden="true" />
            </button>
            <button type="button" className="logout-btn" onClick={async () => { await fetch("/api/logout", { method: "POST" }).catch(() => {}); window.location.href = "/login"; }}
              title="Keluar dari StockScope" aria-label="Keluar">Keluar</button>
          </div>
        </div>
      </header>

      <main className="wrap">
        {mode !== "home" && mode !== "motion" && <section className="hero compact">
          <h1 className="page-title">{title}</h1>
          <p className="tagline">{desc}</p>

          {mode === "niche" && (
            <form onSubmit={(e) => { e.preventDefault(); requestSearch(form); }}>
              <div className="searchbar">
                <input aria-label="Kata kunci" placeholder="Ketik keyword, mis. “ramadan background”" value={form.query}
                  onChange={(e) => setForm({ ...form, query: e.target.value })} required />
                <button className="submit" disabled={loading} aria-label={loading ? "Mencari" : "Cari aset"}>
                  {loading ? <span className="spin" /> : <Icon d="M5 12h14M13 5l7 7-7 7" />}
                </button>
              </div>
              <SearchFilters form={form} setForm={setForm} />
            </form>
          )}

          {mode === "niche" && (
            <>
              <SavedSearches items={saved} reload={reloadSaved} onOpen={openSaved} onContributor={trackContributor}
                hasToken={hasToken} onSettings={() => setSettingsOpen(true)} />
              {!saved?.length && history.length > 0 && (
                <div className="chips history">
                  <small className="muted">Terakhir:</small>
                  {history.slice(0, 8).map((h) => (
                    <span key={`${h.query}|${h.asset}|${h.order}`} className="chip" role="button" tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.click()}
                      onClick={() => { const next = { ...form, query: h.query, asset: h.asset, order: h.order ?? form.order }; setForm(next); requestSearch(next); }}>
                      {h.query} <small>{h.asset === "all" ? "semua jenis" : h.asset}{h.order && h.order !== "downloads" ? ` · ${ORDER_SHORT[h.order] ?? h.order}` : ""}</small>
                    </span>
                  ))}
                </div>
              )}
              {loading && <Loader title={`Mencari aset untuk “${form.query.trim()}”`} steps={SEARCH_STEPS} note="Biasanya 20–90 detik. Halaman lain tetap bisa dibuka." />}
              {error && <div className="notice err">{error}</div>}
              {data?.demo && <div className="notice">Mode demo: data contoh acak. <button type="button" className="linkish" onClick={() => setSettingsOpen(true)}>Masukkan token Apify Anda</button> untuk data asli.</div>}
              {data?.cached && <div className="notice">Data tersimpan dari {new Date(data.fetchedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}{data.recovered ? " (dipulihkan dari Apify)" : ""}: dibuka gratis, tanpa kredit Apify.</div>}
            </>
          )}
        </section>}

        {mode === "home" && (
          <Dashboard icons={ICONS} history={history} saved={saved} onOpenSaved={openSaved} lastNiche={data} hasToken={hasToken} onSettings={() => setSettingsOpen(true)} onGo={go} onNiche={(q) => researchQuery(q)} onContributor={trackContributor} />
        )}

        {mode === "niche" && loading && <SkeletonCards />}
        {mode === "niche" && !loading && data?.summary && (
          <NicheReport key={`${data.fetchedAt}-${JSON.stringify(data.params)}-${trending}`} data={data}
            initialSort="dlPerMonth" initialTab="assets" onCreator={trackContributor} onResearch={researchQuery} />
        )}
        {mode === "calendar" && <CalendarView saved={saved} onSearch={openQuery} />}
        {/* Kept mounted so a running trend scan keeps going while the user looks elsewhere. */}
        <div hidden={mode !== "trends"} className="view">
          {(mode === "trends" || trendsOpened) && <TrendView active={mode === "trends"} onResearch={(q) => researchQuery(q)} />}
        </div>
        {/* Kept mounted so a running lookup and its results survive switching tabs. */}
        <div hidden={mode !== "contributor"} className="view">
          <ContributorView request={contributorRequest} onResearch={researchQuery} />
        </div>
        {/* Kept mounted so a running browser export survives switching tabs. */}
        <div hidden={mode !== "motion"} className="view">
          {(mode === "motion" || motionOpened) && <MotionStudio active={mode === "motion"} jobId={motionJob} onKeys={() => setSettingsOpen("ciora")} />}
        </div>
        <Guide mode={mode} onGo={go} />
        <ConfirmDialog open={!!pending} onCancel={cancelPending} title="Ambil data baru dari Adobe Stock?"
          skipKey={SKIP_SEARCH_CONFIRM}
          onConfirm={() => { const b = pending.body; setPending(null); search(b); }}
          confirmLabel="Ambil data baru"
          lines={pending ? [
            pending.peek.savedAt
              ? `Data “${pending.body.query.trim()}” terakhir diambil ${new Date(pending.peek.savedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })} dan sudah tidak baru, jadi diambil ulang dari Adobe Stock. Data lama tetap ada di riwayat.`
              : `Mencari ${pending.peek.maxItems} aset untuk “${pending.body.query.trim()}”. Belum pernah dicari.`,
            `Data baru: ± $${String(+((pending.peek.maxItems * COST_PER_100) / 100).toFixed(2)).replace(".", ",")}, dibayar oleh ${PAYER[pending.peek.payer]}, sekitar 20–90 detik.`,
            "Pencarian yang sama dalam waktu dekat memakai data ini lagi (gratis); sesudahnya diambil baru. Semua hasil tetap tersimpan di riwayat.",
          ] : []} />
        <KeysHub open={!!hubTab} tab={hubTab || "ringkas"} onTab={setHubTab} onClose={closeSettings} onApifyChange={(on) => setHasToken(!!on)} />
      </main>
    </div>
  );
}
