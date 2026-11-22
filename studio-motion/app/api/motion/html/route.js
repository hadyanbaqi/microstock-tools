import fs from "node:fs/promises";
import path from "node:path";
import { getJob } from "@/lib/motionJobs";
import { motionHtml } from "@/lib/motionHtml.mjs";

export const dynamic = "force-dynamic";

// Download the standalone "render in Chrome" page of one video order (lib/motionHtml.mjs). Behind the site password.
export async function GET(req) {
  const id = new URL(req.url).searchParams.get("id");
  let job;
  try { job = await getJob(id); } catch (e) { return Response.json({ error: e.message }, { status: 400 }); }
  if (!job) return Response.json({ error: "Video tidak ditemukan." }, { status: 404 });
  const root = process.cwd();
  const [engine, mediabunny] = await Promise.all([fs.readFile(path.join(root, "lib", "motion.mjs"), "utf8"),
    fs.readFile(path.join(root, "node_modules", "mediabunny", "dist", "bundles", "mediabunny.min.mjs"), "utf8")]);
  const html = motionHtml({ job: { name: job.name, spec: job.spec, outputs: job.outputs, title: job.title, keywords: Array.isArray(job.keywords) ? job.keywords.join(", ") : job.keywords }, engine, mediabunny });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": `attachment; filename="${job.name}.html"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
