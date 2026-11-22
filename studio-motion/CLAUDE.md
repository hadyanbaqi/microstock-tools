# CLAUDE.md

Project: StockScope, a Next.js 15 (App Router, plain JavaScript) SaaS for Adobe Stock microstock contributors.
UI text is in Bahasa Indonesia; keep it that way.

## Commands
- `npm run dev` — dev server on :3000
- `npm run build` — production build (run before declaring work done)

## Architecture
- Personal site (owner's choice): `middleware.js` locks every page and API route behind one password (`SITE_PASSWORD`,
  login at `/login` → `/api/login` sets an HttpOnly cookie `<expiry>.<nonce>.<HMAC>` (new value per login, 14 days, signed with SITE_PASSWORD + optional SESSION_SECRET); `POST /api/logout`, "Keluar" button in the top bar). Without
  SITE_PASSWORD the site answers 503. Helpers in `lib/auth.js` (Web Crypto, edge-safe). Open paths: /login, /api/login, /api/mcp,
  /api/keepalive (daily Vercel cron in `vercel.json`: one tiny Supabase read so the free project is never paused; CRON_SECRET optional).
- Personal MCP server `app/api/mcp/route.js` (Streamable HTTP, stateless JSON responses, protocol 2025-06-18/03-26/2024-11-05):
  auth `?key=` or `Authorization: Bearer` = `MCP_SECRET` (≥24 chars, else closed). Tools in `lib/mcpTools.js`: cari_aset,
  analisis_kontributor (stored result first, else Apify through the token pool, then `MCP_APIFY_TOKEN`/`APIFY_TOKEN`), max 100 items,
  `MCP_DAILY_LIMIT` new searches/day counted from `search_results` rows with source "mcp"), tren_keyword, riwayat_pencarian,
  cek_kuota, plus the Studio Motion video tools (see below). Output is a compact view of `analyze()` (dl_per_bulan first).
- Kantong token Apify (`lib/tokenPool.js`, Supabase `apify_tokens`, `/api/apify-tokens` GET list/?summary=1, POST add with the
  token in `x-apify-token` + {label}, PATCH {id, label|enabled|refresh}, DELETE ?id=): several tokens stored encrypted
  (AES-256-GCM from `lib/secretStore.js`, key derived from `ENC_KEY` if set, else MCP_SECRET (decrypt tries both, so old values stay readable); `token_hash` = HMAC for duplicates, `hint` = last 4).
  Every paid call goes through `withToken`/`fetchPooled`: candidates = pool tokens (enabled, status ok, ≥$0,02 left, most credit
  left first; usage/limit re-read from Apify `/users/me/limits` when older than 10 min) → browser token → env tokens.
  NO_CREDIT → status habis, BAD_TOKEN → ditolak, both move to the next token (Apify refuses before a run: no double cost);
  MEMORY → next account at once (`fetchAssets(..., { memoryRetries: 0 })`), one more round after 8 s when only busy accounts
  are left. After a run the estimated cost is added to `usage_usd` until the next refresh. `payerFor()` → pool|user|server|demo
  (pool/user use `allowUser`, server/demo the stricter limits). Trend scans paid by the pool run `min(6, 2 × usable tokens)` themes
  at once. `/api/apify-runs` lists earlier runs of the browser token and every readable pool token (`tokenId` per run).
  The old single `mcp_apify_token` in `app_secrets` moves into the pool once ("Token Claude (lama)") and is deleted.
- Data source: Apify actor `kawsar~adobe-stock-scraper` ($0.60/1.000 results on the free plan, `COST_PER_100` in
  `lib/themes.js`), called only from the server (`lib/apify.js`). The previous actor (igolaizola) was removed.
  Input (`actorInput`): query, creatorId, assetType (all|photo|illustration|vector|video|template|3d), aiFilter
  (all|only|exclude), order (relevance|downloads|newest|featured|undiscovered; our "recent" is sent as newest), maxItems (≤1000).
  `normalizeItem` maps the actor's camelCase output (assetId, assetTitle, detailsUrl, thumbUrl, creatorId, creatorName,
  categoryInfo, keywordList, createdAt, downloadCount, viewCount, pixelWidth/Height, isGenerativeAi, mediaTypeId,
  contentType) to the Adobe-style names below, so everything after `fetchAssets` sees one shape. These field names come
  from the actor's store page: verify with a real run. `paramsFromInput` maps a stored run INPUT back to our params.
  Useful output fields (after normalizeItem): id, title, details_url, creator_id, creator_name, category.name, keywords[].name,
  creation_date ("YYYY-MM-DD HH:MM:SS.ffffff"), nb_downloads, is_gentech, thumbnail_url.
  Docs also mention views and dimensions (read as nb_views/views, width/height); UI hides those panels when absent.
  A 400 from Apify = input rejected before the run (no cost); the route reports which order/asset was refused.
  Confirmed vs. unverified inputs/outputs: see "Ketersediaan API" in docs/analisis-kebutuhan.md.
- `lib/contentTypes.js` is the single list of content types (labels, tips, Adobe media_type_id).
  `detectType` reads media_type_id / content_type-like fields or the URL path when the actor provides them;
  otherwise it falls back to the searched type ("image"/"unknown" when searching all types).
- Sales speed (dl/month = total downloads ÷ age) is the primary metric everywhere; total downloads is secondary.
  Keyword ranking weighs assets ≤24 months half, and each keyword gets a naik/turun trend.
- `analyze().brief` is the content brief (format, orientation, category, AI advice, elements, avoid, references)
  computed from the fastest-selling quarter of the sample; shown by `BriefCard.js`.
- `lib/analyze.js` derives all metrics; the opportunity score is a heuristic, tune weights there.
- `lib/cache.js`: every paid result is stored permanently in Supabase `search_results` (key = sha1 of the params from
  `lib/params.js normalizeParams`; local `.cache/` files without Supabase). TTL `CACHE_TTL_HOURS` only decides "fresh";
  `getStored` also reuses the same search stored with more assets (default sample is 60, stored 100/200/300 count):
  a fresh hit is served directly; an older stored copy is offered in the confirm dialog ("Buka yang tersimpan (gratis)",
  `useSaved: true`). `/api/saved` lists stored searches (Cari Aset "Tersimpan" row + dialog). `/api/apify-runs` lists the
  account's earlier actor runs (user token) and imports one (dataset items → analyze → stored, source apify-import);
  Apify keeps run datasets ~7 days. Never store demo results.
- `lib/ratelimit.js`: in-memory per-IP limits: uncached searches on the server token (`RATE_LIMIT_PER_HOUR`) and trend
  scans not paid by the user's token (`SCAN_LIMIT_PER_DAY`, default 3); searches on a visitor's own token
  (`USER_LIMIT_PER_HOUR`, default 120) and token tests (30/hour). With Supabase, demo trend scans are refused.
- Every action that fetches new data is an explicit button + `ConfirmDialog` (cost, payer, time). Searches first call
  `/api/research` with `peek: true` (cache check, never calls Apify); cached/demo results skip the dialog, and users
  can tick "jangan tanya lagi" (localStorage `stockscope:skip-search-confirm`).
- UI: `app/page.js` holds navigation (top bar: Beranda, Cari Aset, Tren Keyword, Kalender, Lacak Kontributor, Studio Motion) and the
  Cari Aset search (the main feature: keyword + filters; mode id is still "niche"). Views in `app/components/`:
  Dashboard (greeting, smart search via `lib/parse.js`, 3-step checklist, KPI tiles, tool cards, top trend keywords,
  fastest assets of the last search), NicheReport (opens on the Aset gallery tab; Ringkasan with Tren kategori:
  treemap + heatmap from `analyze().heatmap` / Keyword with content ideas / Kompetisi), TrendView, ContributorView,
  AssetList + AssetModal; shared bits in `ui.js`. ContributorView and TrendView stay mounted (hidden) to keep state
  (a trend scan keeps running while the user browses).
- Tren Keyword: `lib/themes.js` (15 themes, 40 best-selling + 40 most relevant + 40 newest per theme, cost estimate), `lib/trends.js`:
  best-sellers + relevance sample = demand (relevance surfaces recent assets that already sell, so "naik" can appear;
  the all-time best-seller sample alone was always >1 year old), newest uploads = supply (they are days old with no sales, so never use them for velocity).
  Per keyword: median dl/month of best-sellers ≤1 year, momentum (≤1 year vs older best-sellers), demand share
  (stored in `sold_share`), supply share, AI share → label naik/celah/stabil/jenuh + score, pairs, best format,
  3 samples. `/api/trends`: GET = stored results (free) incl. rank of each keyword in the previous scan for ▲/▼;
  POST start → theme (one per call; the three Apify runs of a theme are sequential, browser runs 2 themes at a time
  to stay within Apify's account memory cap; failed themes are retried once) → finish. Payer is fixed at start (user token, server token, or demo). Storage `lib/trendStore.js`: Supabase REST
  with `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (server only; tables in `supabase/migrations/`, RLS on, no policies),
  else a local JSON file for development.
- Contributor watchlist lives in localStorage via `app/components/watch.js` (asset watching was removed).
  `/api/asset` finds one asset by ID by searching Adobe for the ID (unverified with real data) and matching it.
- Privacy without login: each browser has a workspace code (`ss-` + hex, localStorage `stockscope:workspace`, header
  `x-workspace`, validated in `lib/workspace.js`). `search_history` (owner, key) makes the "Tersimpan" list private;
  `search_results` stays a shared cache of public Adobe data. Users copy the code to sync devices. Not authentication.
- `/api/apify-runs` uses the visitor's own token and the owner's pool tokens (never the env server token).
- Real data showed "Semua jenis" (asset omitted) returning only photos; NicheReport warns when an "all" search has a
  single type and offers searches per type. Verify the actor's default before relying on mixed-type results.
- Studio Motion (nav "Studio Motion", `app/components/MotionStudio.js`) is the **Editor HTML** (`HtmlStudio.js`) plus the list of
  HTML orders from MCP. Layout from the owner's "Motion Studio" mockup (25 Oct 2026; its own render was fake, a text file named
  .mov): hero with Import .html / Tempel kode / Render, then editor | preview with Pengaturan video as a full-width row below (owner's choice, 1 Nov 2026: the preview box takes the video's ratio, capped at 72vh). The preset collection, quick preset chips,
  summary tiles and `lib/motionPresets.js` were removed 27 Oct 2026 (owner's choice). The page hides the generic page header (own hero).
  Preview runs the page in "frame" mode and the parent drives the virtual clock (`cveSeek` {t, dt}; forward jumps replay skipped
  frames): Play/Pause, Ulang, timeline scrubber, ±1 frame, safe-area grid, zoom. Settings: duration 1–60 + quick 5/10/15/30,
  FPS 24/25/30/50/60, output 1920×1080 / 1080×1920 / 1080×1080 / 3840×2160 / custom (page viewport = `viewportFor`, short side 1080),
  background "Sesuai kode" | "Transparan" (`bgStyle` alpha override; `renderHtml` writes MP4 on black + `-matte` MP4 built from the
  frame's alpha) | "Warna solid", bitrate, file name ≤20. Render dialog: frame n/total, %, elapsed, remaining, downloads.
  Studio settings reach the page: `injectRuntime(html, mode, w, h, bg, { duration, fps })` defines `window.STUDIO` {width, height,
  duration, fps, background, transparent, u(ms) = loop position 0..1} plus CSS `--studio-w/-h/-duration` and `.studio-transparent`
  on <html> (`.studio-custom-bg` whenever the Studio picks the background). `htmlPrompt` (structured English prompt with a starter page; rules shared with
  `batchPrompt` via `htmlRules`, which also carries the performance rules: no shadowBlur/filter, sprites, max 60 particles) tells AIs to read STUDIO instead of
  hard-coding size/duration/background (whole cycles per loop, own background only when `S.background` is "code"; a solid color bans close hues for clean keying); `followsStudio(html)` drives the editor hint. Preview reloads when duration/fps change.
  Browsers have no ProRes encoder: MOV with alpha stays with the Mac renderer. The preview iframe needs `color-scheme: normal`
  (the app is dark) or Chrome paints a transparent iframe opaque. Any HTML/CSS/SVG/JS animation renders frame by frame: `lib/htmlMotion.mjs`
  RUNTIME is injected before the page's scripts in a sandboxed iframe (`/motion-preview/html`, own CSP, no network) and
  virtualizes time (rAF, performance.now, Date, timers; pauses + seeks every CSS/Web animation); snapshot() freezes animated
  computed values as !important rules, canvases as images, and serializes to an SVG foreignObject data URL drawn on the encoder
  canvas (Mediabunny H.264). Fast path (10 Nov 2026): when the only visible thing is one full-frame <canvas>, the runtime sends
  it as a transferred ImageBitmap (+ html/body background colour) instead of PNG + SVG (≈40× faster capture; render result `fast`).
  CSS 3D IS captured (tested 10 Nov 2026: foreignObject draws perspective/rotateX/Y/backface-visibility); only preserve-3d face
  order was wrong, so `depth3d` gives the children of each preserve-3d element a z-index from their depth every frame (no
  warning, MCP accepts it, prompts allow it; intersecting planes still sort per face centre). Not captured: SVG SMIL (warned, refused by MCP).
  `renderHtml` returns `loop` {ok, seam, step, median}: the jump last frame → frame 0 vs. the LARGEST frame-to-frame change inside
  the video (192 px thumbnails of every frame, ok when seam ≤ max(1.5, 1.25 × largest step); comparing with only the first/last
  pair flagged every CRT-flicker, glitch and "on twos" animation as broken, fixed 10 Nov 2026); queue items show "✓ Loop mulus" / "Loop patah" and "⚡ Render cepat",
  the editor's render dialog says the same. Queue warnings are recomputed from the HTML on load. Save location (owner's request,
  10 Nov 2026): `saveAs` (showSaveFilePicker, falls back to download) behind "Simpan … ke…" on every rendered queue file and in the
  editor's render dialog, which also has "Simpan semua ke folder…". The fast path changes speed only: same pixels, same file size
  (measured 40.8 MB both ways, 12 s vs 72 s); small files come from simple/dark content, bitrate is a ceiling. `htmlPrompt()` = rules for
  any AI ("Salin prompt"); MCP buat_video takes `html` (+ rasio) → job with spec.template "html", link `/?motion=<id>` opens it.
  Input tabs: Ide teks / Ide gambar / Kode HTML; editor and preview start empty ("Pratinjau muncul di sini").
  Main generation path = owner's Claude subscription, not the API (owner's choice): "Kirim ke Claude" stores the idea and/or
  reference image (downscaled to 1568 px JPEG via FileReader, the CSP blocks blob: images) in Supabase `motion_requests`
  (`lib/motionRequests.js`, `/api/motion/request` GET/POST/PATCH cancel; status baru → dikerjakan → selesai | batal). In chat Claude
  calls MCP `permintaan_video` (list; with id: detail + the image as MCP image content + HTML rules) and answers with
  `buat_video` (html + permintaan_id → request selesai, job_id linked). The page polls every 10 s while a request waits and
  opens the finished job's HTML in the editor. Optional "Buat dengan API" (`/api/motion/generate`, streamed Claude Messages
  API) only shows when `ANTHROPIC_API_KEY` is set (`ANTHROPIC_MODEL`, `ANTHROPIC_BASE_URL` for tests).
  Legacy, no longer in the UI (kept for MCP scene orders and the Mac renderer): stock video overlays that loop seamlessly.
  `lib/motion.mjs` is the single template engine (Canvas 2D, deterministic: draw(ctx, S) depends only on frame/size/params,
  t = frame/frames, all motion periodic in t). Same file runs in the browser (preview + export with WebCodecs/Mediabunny:
  H.264 MP4 + luma matte; VP9 WebM fallback when the browser has no H.264 encoder) and on the owner's Mac
  (`scripts/render-motion.mjs` with @napi-rs/canvas + FFmpeg: MP4 on bg colour, luma matte, optional PNG-codec MOV with alpha).
  Copy both files to the Mac (`Microstok/_FILE-KERJA/_scripts/motion/`) whenever they change.
  Main render path (owner's choice, the Mac renderer is slow and capped at ~3 min per command): `lib/motionHtml.mjs` builds one
  standalone HTML per job (engine + Mediabunny inlined, offline): owner opens it in Google Chrome, "Render & unduh" downloads
  <name>.mp4 + -matte.mp4 + -poster.jpg (H.264), puts them in the batch folder, then Claude runs video_dist.py + platforms.py.
  `/api/motion/html?id=` downloads it, `/motion-preview/render?id=` serves it inline (own strict CSP), MCP returns `html_render`; locally `node scripts/motion-html.mjs job.json out.html [meta.json]`.
  MCP: template_video, buat_video (validates spec + title ≤70/no comma/≥5 words + 40 keywords + `lib/brands.js` trademark
  list, stores in Supabase `motion_jobs` / local `.cache/motion-jobs.json`, returns job_json for the renderer), riwayat_video,
  status_video. `/api/motion` lists jobs for the UI (PATCH sets status baru/dirender); `/?motion=<id>` opens one.
  The "Video dari Claude" list (every MCP job + bulk render) was removed 27 Oct 2026 (owner's choice); MotionStudio keeps only
  "Permintaan ke Claude". `app/components/htmlRender.js` (loadFrame, renderHtml, renderScene, saveBlob) stays shared with the editor.
- Streams: a ReadableStream `pull` must not return without enqueuing or it is never called again, so `cioraStream` and the Claude path in `/api/motion/generate` loop until there is text (role, thinking, keep-alive and [DONE] chunks hung Agent until the 300 s timeout). `cioraStream` also stops itself after 90 s of silence or 280 s in total with a CVE_ERROR marker.
- Kunci & Token renamed Koneksi (owner's choice, 1 Nov 2026): `KeysHub` is one page, named by function: what works now, card Data riset (`ApifySettings part="pool"`: one input, saved tokens folded) and card AI (`CioraSettings`: key, summary of the two models, "Ganti model" opens the picker and a pick saves at once; defaults come from `cioraChoice`). Browser token, Claude env and `AgentSettings` sit behind "Pengaturan lanjutan" (tab value `lanjutan`).
- Studio Motion unified (owner's choice, 1 Nov 2026): the Agent nav entry is gone; `HtmlStudio` has source tabs Agent (`AgentView`) | Manual (editor) | Bulk (BatchPanel input card, portalled into `.ms-slot`), all sharing the preview, Pengaturan video and the always-visible queue. BatchPanel takes events `stockscope:batch-sync` (items), `stockscope:batch-meta` (metadata) and `stockscope:batch-files` (hero multi-import). Queue render: extra ratios (`RATIOS`, `sizeForAspect`, suffix -916 etc., base cut to 16) and a picked folder (`showDirectoryPicker`, `writeFile`, falls back to download). Owner's choice 8 Nov 2026: queue render saves only video files (MP4, plus -matte.mp4 when transparent; no poster JPG), asks for the folder before rendering when the browser can pick one, and "Simpan semua video" writes every video rendered this session into a folder picked at that moment. Agent: each finished video enters the queue at once (Stop keeps it), `htmlWarnings` + `qualityFix` trigger one automatic rewrite, `tooSimilar` drops near-duplicate ideas, a plan without a stated ratio/duration uses the Studio values and `onApply` pushes the plan into the Studio settings so 9:16 runs render 9:16.
- Batch HTML (27 Oct 2026, `app/components/BatchPanel.js`, below the Studio Motion workspace): `batchPrompt`
  in `lib/htmlMotion.mjs` (mode variasi = one brief → N clearly different takes; daftar = one file per line; max `BATCH_MAX` 50;
  same `htmlRules` as `htmlPrompt`) asks any AI to wrap each file in `<!-- ===== VIDEO n/N · nama-file ===== -->` … `SELESAI`
  and to stop with `LANJUT DARI k` near its length limit (`batchContinue` = the follow-up message). `splitBatch` splits a pasted
  answer by those markers (fallback: each <!DOCTYPE html>…</html>), strips markdown fences, names from marker/title, and
  `htmlWarnings` flags terpotong/smil/3d/besar. Queue in localStorage `stockscope:batch-queue` (brief in `stockscope:batch-brief`),
  duplicates skipped, names unique ≤20. Render & unduh renders ticked items one after another with the editor's settings
  (size, FPS, duration, background, bitrate) via `renderHtml`, own offscreen iframe, wake lock. No metadata/CSV (owner's choice).
- Research helpers (25 Oct 2026): Cari Aset defaults to asset "vector" and remembers the last type per browser
  (localStorage `stockscope:last-asset`; "Semua" is labelled "sering hanya foto"). Keyword tab → `MetadataPanel` with
  `lib/metadataIdeas.js` (pure): `keywordList` = searched phrase + weighted ranking, 40, no brands (`lib/brands.js`), only
  a-z0-9 space hyphen (platforms.py rules); `titleIdeas` = 3 titles (keyword ranking / sales speed / best title phrase), ≤70 chars,
  no comma, ≥5 words, filler words skipped, format suffix (vector, illustration, video loop…). "Bandingkan niche" (`CompareView.js`,
  from the Tersimpan row) reads `/api/compare` = `listStoredSummaries()` in `lib/cache.js`: every stored keyword search (web and
  MCP, not limited to the workspace; local `.cache` without Supabase) with summary, brief and top keywords; best value per row in
  lime. Lacak Kontributor → "Portofolio saya": own Creator ID in localStorage `stockscope:my-creator`, buttons fetch the newest
  vector 300 / video 100 / illustration 100; `MyUploads` panel (uploads ≤6 months: sold vs not sold, top sellers by dl/month,
  keywords shared by selling ones) shows when the report's creator is the saved ID.
  Apify 403 "platform-feature-disabled / Monthly usage hard limit" = NO_CREDIT (not BAD_TOKEN); rejected pool tokens are
  re-checked every 6 h so a fixed token comes back.
- Kalender Microstock (`CalendarView.js`, nav "Kalender"): `lib/events.js` is the event catalog (~50 events: label,
  category, upload window in days before the event, suggested keywords, `major` for Beranda) on top of
  `lib/holidays.js` dates. `eventStatus()` → upload / mepet (<30 days, buyers already bought) / nanti / lewat;
  `calendar()` = rolling 12 months; `uploadNow()` = open windows. No external calendar export (owner's choice).
- `lib/ideas.js` POPULAR: evergreen keyword categories most searched on microstock, each with sub-keywords (Beranda
  "Ide niche siap pakai"); stored results open free and show dl/month. Seasonal ideas live only in the Kalender.
- Filters everywhere use `FilterPill` (ui.js): one row of compact pills (label + native select), changed pills highlighted.
- In-app help: `app/components/Guide.js` (floating "?" button → modal; topics per page + glossary). Update its TOPICS when a feature changes.
- Competitor feature feasibility and the dashboard structure: `docs/analisis-fitur-pesaing.md`.
- Order "trending" exists only in the UI: `research()` in `app/components/util.js` sends it to Apify as "newest" and the list sorts by dl/month. Result filters are client-side and cost nothing.
- No APIFY_TOKEN → demo data, so the app always runs. Demo results are never cached.
- Needs analysis and feature rationale: `docs/analisis-kebutuhan.md`.
- Kunci & Token (28 Oct 2026, `app/components/KeysHub.js`, the only key button in the top bar; old `setSettingsOpen(true)`
  callers open the Apify tab): side tab menu, one panel at a time: Apify (embedded `ApifySettings`), Ciora (`CioraSettings.js`),
  Lanjutan (Claude fallback env status + embedded `AgentSettings`).
- Ciora tab (owner's choice: Ciora = the non-Anthropic models): API key entered in the UI → `/api/ai/ciora` (checked against
  `https://ciora.id/v1/models`, stored encrypted as ai_providers provider "ciora"); model choice for HTML code (agent = tool
  calling + coding) and SEO metadata saved in ai_settings.tasks.ciora {html, meta, verified}; "Tes" makes a real tool call.
  `lib/ai/ciora.js` (OpenAI-compatible chat/stream/models; key from the tab, else env CIORA_API_KEY, else ANTHROPIC_* pointing at
  ciora.id). `lib/ai/catalog.js modelInfo` tags family/agent/coding from the id; `pickDefault` prefers non-Anthropic models.
  Studio Motion "Buat dengan API" + Metadata SEO use Ciora when a key exists; the Claude path (ANTHROPIC_*) is the fallback.
  The agent migration `20261027_agent_foundation.sql` is applied on the stockscope Supabase project (28 Oct 2026).
- Agent (28 Oct 2026, nav "Agent", `app/components/AgentView.js`, stays mounted hidden): one command → `/api/agent/plan`
  (Ciora html model reads it into keyword/asset/count/aspect/duration/style) → confirm card (editable plan + Apify and Ciora
  cost) → `research()` (live Apify, or a still-fresh stored copy) → `/api/agent/ideas` (`researchDigest` of analyze() →
  insight + N distinct motion ideas, `lib/ai/agentPrompt.js`) → `/api/motion/generate` per idea (2 at a time, streamed) →
  `/api/motion/metadata` (research keywords + titles) → appended to the Batch queue (localStorage + window event
  "stockscope:batch-sync", merged by BatchPanel). Last run kept in localStorage `stockscope:agent-last` (without HTML).
- AI via Ciora (owner's choice, Claude path kept): Studio Motion "Buat dengan API" and the SEO metadata use the
  Anthropic-compatible API at `ANTHROPIC_BASE_URL` (Ciora: `https://ciora.id/v1`; `lib/ai/anthropic.js messagesUrl` accepts
  the base with or without /v1, sends x-api-key and Bearer). `ANTHROPIC_MODEL` = HTML default, `ANTHROPIC_META_MODEL` =
  metadata default; the browser can pick another model per task (`ModelPicker.js`, localStorage `stockscope:model-html|meta`,
  body `model`). `/api/motion/models` = live ids from `{base}/models` (1 h memo) merged with `lib/ai/catalog.js` (Ciora
  prices in Rupiah per 1M tokens, `rec` html/meta, tier, note, estimate per job): update the catalog when prices change.
- SEO metadata (`/api/motion/metadata`, Batch HTML "Metadata SEO (AI)"): `lib/ai/metaPrompt.js` (rules: title front-loads the
  search phrase, ≤70, no comma; 40 keywords ordered by importance, first 10 matter most on Adobe; categories) + research
  keyword; every answer is normalized/validated by `lib/stockMeta.js` (same rules as aset.js/platforms.py, brands from
  `lib/brands.js`) with one retry. Queue items keep `meta`; CSV buttons build Adobe / Shutterstock / Vecteezy files in the
  platforms.py formats (file name = rendered `${fileBase(name)}.mp4`; motion from code is not AI so Shutterstock is allowed).
- Stored searches: an identical search still fresh (`CACHE_TTL_HOURS`) is reused; an older copy is history only (the
  confirm dialog no longer offers "Buka yang tersimpan"; the Tersimpan list still opens it as history).
- Agent foundation (stage 1, subscription-ready, not used by other features yet): `supabase/migrations/20261027_agent_foundation.sql`,
  `lib/account.js` ("owner"), `lib/plans.js`, `lib/ai/{providers,store,models,client,http}.js`, `/api/ai/*`. Progress: `docs/agent-progress.md`.

## Design
- Dark "Higgsfield" style (requested by the product owner; references from Mobbin): near-black canvas #0c0d0e,
  graphite cards #17181a with a 1px rgba(255,255,255,.08) hairline, 18px card radius, pill controls.
  Inter 400–600 for text; Inter 800 UPPERCASE for display headings (page titles, greeting, section titles), with
  the second word of a page title in lime (`<em>`).
- Neon lime #c8f031 is the one action colour: primary buttons, search submit, brand logo, progress, selected state
  accents, NEW badges. Text on lime/light fills uses `--on-ink`. Selected chips/tabs are white with dark text.
- Navigation is a sticky top bar (`.topbar`): brand, menu (short labels on mobile, icons hidden ≤440px), Token button.
- Data colours: heatmap = one-hue ramp graphite → lime; treemap/trend labels = diverging lime ↔ gray ↔ red
  (validated with the dataviz validator against #17181a; every tile carries a text label). Green/amber/red stay data
  semantics only. Tool tints (`--tint-*`) are dark hues for Beranda cards, illustrations and empty states only.
  All colours are tokens at the top of `app/globals.css`; `docs/DESIGN.md` keeps the earlier light "Shop" reference.

## Rules
- Never expose APIFY_TOKEN or SUPABASE_SECRET_KEY to the client or commit `.env.local`.
- Users may bring their own token: the browser stores it (localStorage/sessionStorage, `app/components/util.js`) and
  sends it as `x-apify-token`; `lib/token.js` validates it; it is used after the token pool and before APIFY_TOKEN. Never log,
  cache or persist it server-side, except when the owner explicitly adds it to the token pool (encrypted). API responses never
  include a pool token, only label, last 4 characters and credit. The per-IP rate limit only applies to calls on the server token. `/api/apify-check` tests a token.
- Every Apify call costs money: keep maxItems capped (route clamps to 10–300) and keep caching.
- Apify returns 402 both for exhausted credit and for a full account memory cap (too many runs at once, free plan
  8 GB). `lib/apify.js` runs with `memory=1024` MB (`APIFY_RUN_MEMORY_MB`), retries the memory case, and maps it
  to code MEMORY (503, "bukan kredit habis"); only other 402s are NO_CREDIT.
- Do not download or re-host Adobe Stock preview images; link to details_url.
- `next.config.mjs` sets security headers + CSP (connect-src 'self', images only *.ftcdn.net): add any new external
  host there. External links from scraped data go through `safeUrl` (util.js, http(s) only).

## Roadmap
1. Supabase (keyword trends and stored search results done): users, quota.
2. Auth + plans (Free 5 searches/day, Pro).
3. Payments (Midtrans/Xendit or Stripe).
4. Async runs + Apify webhook for large portfolios.
