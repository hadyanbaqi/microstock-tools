// StockScope tools for the personal MCP endpoint (app/api/mcp). Paid Apify calls use the token pool (lib/tokenPool.js),
// then MCP_APIFY_TOKEN / APIFY_TOKEN,
// always reuse stored results first, and stop at MCP_DAILY_LIMIT new searches per day.
import { fetchPooled, listRows, poolSummary, viewRow } from "./tokenPool.js";
import { analyze } from "./analyze.js";
import { getStored, setCached } from "./cache.js";
import { normalizeParams } from "./params.js";
import { hasDb, rest } from "./supabase.js";
import { latestTrends } from "./trendStore.js";
import { COST_PER_100 } from "./themes.js";
import { TEMPLATES, RESOLUTIONS, FPS, SCENE_API, MAX_CODE, normalizeSpec, defaultMeta, compileScene } from "./motion.mjs";
import { brandHits } from "./brands.js";
import { MAX_HTML, htmlPrompt } from "./htmlMotion.mjs";
import { listRequests, getRequest, updateRequest } from "./motionRequests.js";
import { createJob, listJobs, updateJob } from "./motionJobs.js";

// Kantong token (Pengaturan Apify, encrypted in Supabase) first, then env tokens.
const envTokens = () => [process.env.MCP_APIFY_TOKEN, process.env.APIFY_TOKEN].filter(Boolean);
const DAILY = Number(process.env.MCP_DAILY_LIMIT ?? 30);
const MAX_ITEMS = 100;
const JENIS = ["all", "photo", "illustration", "vector", "video", "template", "3d"];
const URUTAN = ["downloads", "relevance", "newest", "featured", "undiscovered"];

// New paid searches today: counted from stored results tagged "mcp" (Supabase), else in memory per instance.
let memCount = { day: "", n: 0 };
const today = () => new Date().toISOString().slice(0, 10);
async function usedToday() {
  if (hasDb) {
    try {
      const rows = await rest(`search_results?source=eq.mcp&updated_at=gte.${today()}T00:00:00Z&select=key`);
      return rows.length;
    } catch (e) { console.warn("mcp quota read failed:", e.message); }
  }
  return memCount.day === today() ? memCount.n : 0;
}
function countOne() { memCount = memCount.day === today() ? { day: memCount.day, n: memCount.n + 1 } : { day: today(), n: 1 }; }

const pickAsset = (a) => ({ judul: a.title, jenis: a.type, dl_per_bulan: a.dlPerMonth, total_download: a.downloads, umur_bulan: a.ageMonths,
  upload: a.created, ai: a.isAI, views: a.views, kontributor: a.creator, creator_id: a.creatorId, kategori: a.category, url: a.url,
  keyword: (a.keywords ?? []).slice(0, 12) });

// Compact view of analyze() for the model: numbers that drive decisions, not the whole UI payload.
function compact(result, meta) {
  const assets = [...(result.assets ?? [])].sort((x, y) => y.dlPerMonth - x.dlPerMonth);
  return {
    ...meta,
    parameter: result.params,
    ringkasan: result.summary,
    insight: (result.insights ?? []).map((i) => i.text),
    brief: result.brief ? { ...result.brief, references: (result.brief.references ?? []).slice(0, 5).map(pickAsset) } : null,
    aset_tercepat_laku: assets.slice(0, 15).map(pickAsset),
    aset_baru_laku: assets.filter((a) => a.ageMonths !== null && a.ageMonths <= 12).slice(0, 10).map(pickAsset),
    keyword_teratas: (result.keywords ?? []).slice(0, 30).map((k) => ({ keyword: k.keyword, dipakai_persen: k.share, dl_per_bulan_rata: k.avgVelocity, tren: k.trend })),
    kategori: result.categories?.slice?.(0, 8),
    jenis_konten: result.types,
    kontributor_teratas: (result.topCreators ?? []).slice(0, 8),
    kontributor: result.creator ?? undefined,
  };
}

let inFlight = 0; // paid searches running right now in this instance

async function research(args, creator) {
  const params = normalizeParams({
    query: creator ? "" : args.keyword, creatorId: creator ? String(args.creator_id ?? "") : "",
    asset: JENIS.includes(args.jenis) ? args.jenis : creator ? "all" : "vector",
    ai: args.ai === "only" || args.ai === "exclude" ? args.ai : "",
    order: URUTAN.includes(args.urutan) ? args.urutan : "downloads",
    maxItems: Math.min(Math.max(Number(args.jumlah) || 60, 10), MAX_ITEMS),
  });
  if (!params.query && !params.creatorId) throw new Error(creator ? "Isi creator_id." : "Isi keyword.");
  const hit = (await getStored(params, { freshOnly: true })) ?? (args.data_baru ? null : await getStored(params));
  if (hit) return compact(hit.data, { sumber: "tersimpan (gratis)", diambil: new Date(hit.at).toISOString() });
  const pool = await poolSummary().catch(() => ({ usable: 0 }));
  if (!pool.usable && !envTokens().length) throw new Error("Belum ada token Apify yang masih punya kredit. Tambahkan lewat web: Token Apify → Kantong token. Hasil tersimpan tetap bisa dibuka.");
  const used = await usedToday();
  // Searches already running count too, so parallel calls cannot slip past the daily limit together.
  if (used + inFlight >= DAILY) throw new Error(`Batas ${DAILY} pencarian baru per hari lewat MCP sudah tercapai (${used + inFlight}). Hasil tersimpan tetap bisa dibuka.`);
  inFlight++;
  let fetched;
  try { fetched = await fetchPooled(params, { env: envTokens() }); } finally { inFlight--; }
  const { items, label } = fetched;
  if (!items?.length) throw new Error("Tidak ada aset untuk pencarian ini. Coba keyword lebih umum atau ganti jenis.");
  const result = { params, demo: false, tokenSource: "server", ...analyze(items, { query: params.query, asset: params.asset, creatorId: params.creatorId }) };
  await setCached(params, result, "mcp");
  countOne();
  return compact(result, { sumber: "data baru dari Apify", token: label, biaya_perkiraan_usd: +((params.maxItems * COST_PER_100) / 100).toFixed(3), sisa_kuota_hari_ini: Math.max(0, DAILY - used - 1) });
}

const jenisProp = { type: "string", enum: JENIS, description: "Jenis konten Adobe Stock. Default vector (keyword) / all (kontributor)." };
const common = {
  jenis: jenisProp,
  urutan: { type: "string", enum: URUTAN, description: "Urutan Adobe Stock. Default downloads (terlaris)." },
  ai: { type: "string", enum: ["semua", "only", "exclude"], description: "Filter konten AI. Default semua." },
  jumlah: { type: "integer", minimum: 10, maximum: MAX_ITEMS, description: "Jumlah aset dianalisis (10–100, default 60). ±$0,06 per 100 aset bila belum tersimpan." },
  data_baru: { type: "boolean", description: "true = abaikan salinan tersimpan yang lebih tua dari 48 jam dan ambil data baru (berbayar). Default false." },
};

/* ---------- Studio Motion (video) ---------- */
const SITE = process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
const OUTPUTS = ["mp4", "matte", "alpha"];
const STATUS = ["baru", "dirender", "didistribusi", "diupload", "gagal"];
const slimTemplate = (t) => ({ id: t.id, nama: t.name, jenis: t.kind, keterangan: t.desc, alasan_riset: t.why,
  parameter: t.params.map((d) => ({ key: d.key, label: d.label, tipe: d.type, default: d.def, ...(d.type === "range" ? { min: d.min, max: d.max } : {}), ...(d.options ? { pilihan: d.options.map(([v]) => v) } : {}) })),
  judul_default: t.meta.title });
const jobView = (j) => ({ id: j.id, nama: j.name, status: j.status, catatan: j.note, dibuat: j.created_at, judul: j.title, keywords: j.keywords,
  spec: j.spec, outputs: j.outputs, job_json: { name: j.name, spec: j.spec, outputs: j.outputs },
  file: j.outputs.map((o) => `${j.name}${o === "mp4" ? ".mp4" : o === "matte" ? "-matte.mp4" : "-alpha.mov"}`), link: SITE ? `${SITE}/?motion=${j.id}` : `/?motion=${j.id}`,
  html_render: j.spec?.template === "html" ? (SITE ? `${SITE}/?motion=${j.id}` : `/?motion=${j.id}`) : SITE ? `${SITE}/api/motion/html?id=${j.id}` : `/api/motion/html?id=${j.id}` });

async function makeVideo(a) {
  if (typeof a.html === "string" && a.html.trim()) return makeHtmlVideo(a);
  const code = typeof a.kode === "string" ? a.kode.trim() : "";
  if (!code && !a.template) throw new Error("Isi kode (adegan kustom dari brief riset) atau template.");
  if (code.length > MAX_CODE) throw new Error(`Kode adegan terlalu panjang (maks ${MAX_CODE} karakter).`);
  if (code) { try { compileScene(code); } catch (e) { throw new Error(`Kode adegan tidak valid: ${e.message}`); }
    if (!a.judul || !a.keywords) throw new Error("Adegan kustom wajib diberi judul dan keywords dari hasil riset."); }
  const spec = normalizeSpec({ template: a.template, code, params: a.params, resolution: a.resolusi, fps: a.fps, duration: a.durasi, seed: a.seed ?? Math.floor(Math.random() * 1e6), bg: a.warna_latar });
  if (!code && spec.template !== a.template) throw new Error(`Template "${a.template}" tidak ada. Pilihan: ${TEMPLATES.map((t) => t.id).join(", ")}.`);
  const name = String(a.nama || `${code ? "scene" : spec.template}-${spec.resolution}`).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 20);
  if (name.length < 3) throw new Error("Nama file minimal 3 karakter (huruf kecil, angka, tanda minus).");
  const meta = defaultMeta(spec, a.keywords ?? ""), title = String(a.judul || meta.title).trim();
  const problems = [];
  if (title.length > 70) problems.push(`judul ${title.length} karakter (maks 70)`);
  if (title.includes(",")) problems.push("judul tidak boleh berisi koma");
  if (title.split(/\s+/).length < 5) problems.push("judul minimal 5 kata");
  const brands = brandHits(`${title} ${meta.keywords.join(" ")}`);
  if (brands.length) problems.push(`merek dagang: ${brands.join(", ")}`);
  if (meta.keywords.length < 40) problems.push(`keyword baru ${meta.keywords.length} (perlu 40)`);
  if (problems.length) throw new Error(`Metadata belum lolos: ${problems.join("; ")}.`);
  const outputs = (Array.isArray(a.outputs) && a.outputs.length ? a.outputs : ["mp4", "matte"]).filter((o) => OUTPUTS.includes(o));
  const job = await createJob({ name, spec, outputs: outputs.length ? outputs : ["mp4", "matte"], title, keywords: meta.keywords.join(", ") });
  const [W, H] = RESOLUTIONS[spec.resolution];
  return { ...jobView(job), resolusi_piksel: `${W}x${H}`, frame: spec.fps * spec.duration,
    cara_render: "Utama: pemilik membuka html_render (file HTML mandiri) di Google Chrome, klik Render & unduh (MP4 + luma matte + poster, H.264 lewat encoder Chrome), lalu menaruh hasilnya di folder batch; Claude membuat CSV dan mengisi folder platform. Alternatif (lambat, perlu MOV alpha): node _FILE-KERJA/_scripts/motion/render-motion.mjs job.json <folder>. Setelah selesai, set status_video ke dirender." };
}

// HTML animation order: Claude writes one self-contained HTML file (see htmlPrompt), the owner renders it in
// Studio Motion → Editor HTML (link) with one click. Same metadata checks as scene orders.
async function makeHtmlVideo(a) {
  const html = a.html.trim();
  if (html.length > MAX_HTML) throw new Error(`HTML terlalu besar (maks ${Math.round(MAX_HTML / 1000)} KB).`);
  if (/<(animate|animateTransform|animateMotion|set)\b/i.test(html)) throw new Error("HTML memakai SVG SMIL (<animate>) yang tidak ikut terekam: ganti dengan CSS @keyframes atau JavaScript.");
  if (/<(script|link|img|iframe)[^>]+(src|href)=["']https?:/i.test(html)) throw new Error("HTML memuat file eksternal; semua harus inline (halaman render tidak boleh mengakses internet).");
  if (!a.judul || !a.keywords) throw new Error("Video HTML wajib diberi judul dan keywords dari hasil riset.");
  const spec = normalizeSpec({ html, aspect: a.rasio, fps: a.fps, duration: a.durasi, resolution: a.resolusi === "4k" ? "4k" : "hd" });
  const name = String(a.nama || "html-video").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 20);
  if (name.length < 3) throw new Error("Nama file minimal 3 karakter (huruf kecil, angka, tanda minus).");
  const kw = []; for (const x of String(a.keywords).split(",")) { const s = x.trim().toLowerCase(); if (s && /^[a-z0-9 -]+$/.test(s) && !kw.includes(s)) kw.push(s); }
  const title = String(a.judul).trim(), problems = [];
  if (title.length > 70) problems.push(`judul ${title.length} karakter (maks 70)`);
  if (title.includes(",")) problems.push("judul tidak boleh berisi koma");
  if (title.split(/\s+/).length < 5) problems.push("judul minimal 5 kata");
  const brands = brandHits(`${title} ${kw.join(" ")}`); if (brands.length) problems.push(`merek dagang: ${brands.join(", ")}`);
  if (kw.length < 40) problems.push(`keyword ${kw.length} (perlu 40)`);
  if (problems.length) throw new Error(`Metadata belum lolos: ${problems.join("; ")}.`);
  const job = await createJob({ name, spec, outputs: ["mp4"], title, keywords: kw.slice(0, 40).join(", ") });
  if (a.permintaan_id) await updateRequest(a.permintaan_id, { status: "selesai", job_id: job.id }).catch(() => null);
  return { ...jobView(job), cara_render: "Pemilik membuka link (Studio Motion → Editor HTML, kode sudah termuat), memilih resolusi/FPS lalu klik Render video; MP4 + poster terunduh. Taruh di folder batch, lalu Claude menjalankan video_dist.py + platforms.py." };
}

// Owner's "Kirim ke Claude" requests from Studio Motion. Without id: the open ones (no images). With id: the full request,
// its reference image as MCP image content and the HTML rules; it is marked "dikerjakan".
async function videoRequests(a) {
  if (!a.id) {
    const rows = await listRequests({ limit: a.limit || 20, status: a.status || undefined });
    const open = a.status ? rows : rows.filter((r) => r.status === "baru" || r.status === "dikerjakan");
    return { permintaan: open.map((r) => ({ id: r.id, ide: r.idea, ada_gambar: r.has_image, rasio: r.aspect, durasi: r.duration, status: r.status, dibuat: r.created_at })),
      cara: "Panggil permintaan_video dengan id untuk melihat gambar referensi, riset bila perlu (cari_aset jenis video), lalu buat_video dengan html + judul + 40 keywords + permintaan_id." };
  }
  const r = await getRequest(a.id); if (!r) throw new Error("Permintaan tidak ditemukan.");
  if (r.status === "baru") await updateRequest(r.id, { status: "dikerjakan" }).catch(() => null);
  const m = r.image && r.image.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  return { id: r.id, ide: r.idea || "(tanpa teks: ikuti gambar referensi)", rasio: r.aspect, durasi: r.duration, status: r.status === "baru" ? "dikerjakan" : r.status,
    gambar: m ? "terlampir: tiru suasana, warna, komposisi dan gaya geraknya sebagai animasi orisinal (tanpa logo/teks merek)" : null,
    aturan_html: htmlPrompt({ idea: r.idea, aspect: r.aspect, duration: r.duration }), ...(m ? { __images: [{ mimeType: m[1], data: m[2] }] } : {}) };
}

export const TOOLS = [
  { name: "cari_aset", description: "Riset keyword di Adobe Stock: aset tercepat laku (download/bulan), aset baru yang laku, keyword teratas, brief konten, skor peluang dan kontributor dominan. Memakai hasil tersimpan bila ada (gratis); kalau belum, menjalankan Apify (berbayar, dibatasi per hari).",
    inputSchema: { type: "object", properties: { keyword: { type: "string", description: "Kata kunci pencarian, mis. 'check mark icon'." }, ...common }, required: ["keyword"] },
    run: (a) => research(a, false) },
  { name: "analisis_kontributor", description: "Analisis portofolio kontributor Adobe Stock dari Creator ID: aset terlaris, download/bulan, kategori, jenis konten. Hasil tersimpan dipakai dulu (gratis).",
    inputSchema: { type: "object", properties: { creator_id: { type: "string", description: "Creator ID Adobe Stock (angka)." }, ...common }, required: ["creator_id"] },
    run: (a) => research(a, true) },
  { name: "tren_keyword", description: "Hasil scan Tren Keyword terakhir yang tersimpan (gratis, tidak memanggil Apify): keyword naik/celah/stabil/jenuh per tema.",
    inputSchema: { type: "object", properties: { tema: { type: "string", description: "Opsional: id tema, mis. bisnis, teknologi, kesehatan." }, label: { type: "string", enum: ["naik", "celah", "stabil", "jenuh"], description: "Opsional: filter label." }, limit: { type: "integer", minimum: 1, maximum: 120, description: "Jumlah keyword (default 40), urut naik → celah → stabil → jenuh." } } },
    run: async (a) => {
      const t = await latestTrends();
      let kws = t.keywords ?? [];
      if (a.tema) kws = kws.filter((k) => k.theme === a.tema);
      if (a.label) kws = kws.filter((k) => k.label === a.label);
      const rank = { naik: 0, celah: 1, stabil: 2, jenuh: 3 };
      kws = [...kws].sort((x, y) => rank[x.label] - rank[y.label] || y.score - x.score);
      const slim = (k) => ({ tema: k.theme, keyword: k.keyword, label: k.label, skor: +k.score, dl_per_bulan: +k.median_velocity,
        rasio_baru_lama: k.ratio, permintaan_persen: k.sold_share, pesaing_baru_persen: k.supply_share, ai_persen: k.ai_share,
        aset_baru_laku: k.new_assets, format: k.best_format, orientasi: k.best_orientation, pasangan: k.pairs,
        contoh: (k.samples ?? []).map((s) => ({ judul: s.title, dl_per_bulan: s.v, url: s.url })) });
      return { scan: t.scan ? { tanggal: t.scan.created_at, status: t.scan.status, tema_selesai: t.scan.themes_done } : null,
        jumlah: kws.length, keyword: kws.slice(0, Math.min(Number(a.limit) || 40, 120)).map(slim) };
    } },
  { name: "riwayat_pencarian", description: "Daftar pencarian yang sudah tersimpan (gratis dibuka ulang lewat cari_aset/analisis_kontributor dengan parameter yang sama).",
    inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100 } } },
    run: async (a) => {
      if (!hasDb) return { catatan: "Tanpa Supabase, riwayat tidak tersedia." };
      const rows = await rest(`search_results?select=params,item_count,source,updated_at&order=updated_at.desc&limit=${Math.min(Number(a.limit) || 30, 100)}`);
      return rows.map((r) => ({ ...r.params, jumlah_aset: r.item_count, sumber: r.source, disimpan: r.updated_at }));
    } },
  { name: "cek_kuota", description: "Sisa batas pencarian baru lewat MCP hari ini dan sisa kredit tiap token di kantong token Apify.",
    inputSchema: { type: "object", properties: {} },
    run: async () => {
      const used = await usedToday();
      const rows = (await listRows().catch(() => [])).map(viewRow);
      const tokens = rows.map((t) => ({ label: t.label, akun: t.username, status: t.enabled ? t.status : "dimatikan",
        sisa_usd: t.leftUsd, pemakaian_usd: t.usageUsd, batas_usd: t.limitUsd, dicek: t.checkedAt }));
      const total = tokens.filter((t) => t.status === "ok" && t.sisa_usd !== null).reduce((a, t) => a + t.sisa_usd, 0);
      return { pencarian_baru_hari_ini: used, batas_harian: DAILY, sisa: Math.max(0, DAILY - used),
        kantong_token: tokens.length ? { total_sisa_usd: +total.toFixed(2), token: tokens } : "Kosong: tambahkan token lewat web (Token Apify → Kantong token).",
        token_env: envTokens().length };
    } },
  { name: "template_video", description: "Panduan Studio Motion: cara menulis adegan kustom (API kode untuk buat_video), daftar bahan/template (grain, partikel emas, neon frame, light leak, ledakan kartun, grunge stop motion, kabut, doodle) yang bisa dipakai di adegan atau langsung, resolusi dan fps. Gratis.",
    inputSchema: { type: "object", properties: {} },
    run: async () => ({ html_prompt: htmlPrompt({ aspect: "16:9", duration: 10 }), adegan_kustom: SCENE_API, template: TEMPLATES.map(slimTemplate), resolusi: Object.fromEntries(Object.entries(RESOLUTIONS).map(([k, v]) => [k, v.join("x")])), fps: FPS, durasi_detik: "5-60 (saran 10-20, loop mulus)" }) },
  { name: "buat_video", description: "Buat pesanan video stock Studio Motion. Cara utama: kirim `html` (satu file HTML animasi, lihat template_video.html_prompt) → pemilik merender di Editor HTML. Utamakan ADEGAN KUSTOM (kode) yang ditulis dari brief riset: warna, elemen dan gaya gerak mengikuti aset yang laku; template hanya bahan atau titik awal. Memvalidasi kode, parameter, judul (maks 70 karakter, tanpa koma, min 5 kata) dan 40 keyword (tanpa merek dagang), menyimpannya, lalu mengembalikan html_render (halaman HTML mandiri: buka di Chrome, klik Render & unduh) dan job_json untuk render Mac. Tidak memanggil Apify.",
    inputSchema: { type: "object", properties: {
      html: { type: "string", description: "Alternatif utama: satu file HTML animasi lengkap (CSS/SVG/JS inline, tanpa file eksternal, tanpa SVG SMIL, loop tepat di durasi; CSS 3D boleh). Pemilik merendernya di Studio Motion → Editor HTML. Aturan lengkap: template_video.html_prompt." },
      permintaan_id: { type: "string", description: "Untuk html: id dari permintaan_video yang dijawab; permintaannya ditandai selesai dan terhubung ke video ini." },
      rasio: { type: "string", enum: ["16:9", "9:16", "1:1"], description: "Untuk html: kanvas 1920x1080 / 1080x1920 / 1080x1080. Default 16:9." },
      kode: { type: "string", description: "Adegan kustom: isi fungsi (ctx, S, H) yang menggambar satu frame (lihat template_video.adegan_kustom). Bila diisi, template diabaikan dan judul + keywords wajib." },
      template: { type: "string", enum: TEMPLATES.map((t) => t.id), description: "ID template bila tidak memakai kode (lihat template_video)." },
      params: { type: "object", description: "Parameter template, atau nilai bebas untuk adegan kustom (dibaca sebagai S.p), mis. {\"color\":\"#ffd400\"}. Yang tidak diisi memakai default." },
      resolusi: { type: "string", enum: Object.keys(RESOLUTIONS), description: "Default 4k (3840x2160)." },
      fps: { type: "integer", enum: [24, 25, 30, 60], description: "Default 30 (60 hanya untuk html)." },
      durasi: { type: "integer", minimum: 5, maximum: 60, description: "Detik, default 10." },
      seed: { type: "integer", description: "Angka acak tetap; seed lain = variasi lain dengan gaya yang sama." },
      warna_latar: { type: "string", description: "Hex latar video MP4, default #000000 (overlay di atas hitam)." },
      nama: { type: "string", description: "Nama dasar file (maks 20 karakter, huruf kecil-angka-minus), mis. gold-particles-4k." },
      judul: { type: "string", description: "Judul stock (maks 70 karakter, tanpa koma, min 5 kata). Default dari template." },
      keywords: { type: "string", description: "Keyword hasil riset dipisah koma; digabung dengan keyword template sampai 40." },
      outputs: { type: "array", items: { type: "string", enum: OUTPUTS }, description: "mp4 (latar warna), matte (luma matte untuk Shutterstock), alpha (MOV PNG transparan; besar untuk template berbintik). Default mp4 + matte." },
    } },
    run: makeVideo },
  { name: "permintaan_video", description: "Permintaan video dari pemilik (Studio Motion → Kirim ke Claude): ide teks dan/atau gambar referensi. Tanpa id: daftar yang belum dikerjakan. Dengan id: detail + gambar referensinya + aturan HTML (status jadi dikerjakan). Jawab dengan buat_video (html, permintaan_id). Gratis.",
    inputSchema: { type: "object", properties: { id: { type: "string", description: "ID permintaan untuk detail + gambar." }, status: { type: "string", enum: ["baru", "dikerjakan", "selesai", "batal"], description: "Filter daftar (default: baru + dikerjakan)." }, limit: { type: "integer", minimum: 1, maximum: 100 } } },
    run: videoRequests },
  { name: "riwayat_video", description: "Daftar pesanan video Studio Motion terbaru beserta status (baru, dirender, didistribusi, diupload, gagal) dan job_json untuk render ulang.",
    inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100 } } },
    run: async (a) => (await listJobs(a.limit || 20)).map(jobView) },
  { name: "status_video", description: "Ubah status pesanan video setelah dirender, didistribusi ke folder platform, atau diupload.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, status: { type: "string", enum: STATUS }, catatan: { type: "string" } }, required: ["id", "status"] },
    run: async (a) => { if (!STATUS.includes(a.status)) throw new Error("Status tidak dikenal."); const j = await updateJob(a.id, { status: a.status, note: a.catatan ?? null }); if (!j) throw new Error("Pesanan video tidak ditemukan."); return jobView(j); } },
];
