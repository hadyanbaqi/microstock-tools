import fs from "node:fs/promises";
import path from "node:path";
import { getJob } from "@/lib/motionJobs";
import { motionHtml } from "@/lib/motionHtml.mjs";

export const dynamic = "force-dynamic";

// The same standalone render page as /api/motion/html, served inline so it can be opened straight in Chrome
// (behind the site password). Lives under /motion-preview so the site-wide CSP is replaced by this stricter one:
// scene code may run (unsafe-eval) but nothing can be fetched (connect-src 'none').
const CSP = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; media-src blob:; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

export async function GET(req) {
  let job;
  try { job = await getJob(new URL(req.url).searchParams.get("id")); } catch (e) { return new Response(e.message, { status: 400 }); }
  if (!job) return new Response("Video tidak ditemukan.", { status: 404 });
  const root = process.cwd();
  const [engine, mediabunny] = await Promise.all([fs.readFile(path.join(root, "lib", "motion.mjs"), "utf8"),
    fs.readFile(path.join(root, "node_modules", "mediabunny", "dist", "bundles", "mediabunny.min.mjs"), "utf8")]);
  const html = motionHtml({ job: { name: job.name, spec: job.spec, outputs: job.outputs, title: job.title, keywords: job.keywords }, engine, mediabunny });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": CSP, "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer", "Cache-Control": "no-store", "X-Frame-Options": "DENY" } });
}
