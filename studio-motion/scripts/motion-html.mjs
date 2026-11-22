#!/usr/bin/env node
// Build the standalone "render in Chrome" page for a Studio Motion job (see lib/motionHtml.mjs).
// Usage: node scripts/motion-html.mjs <job.json> <out.html> [meta.json]
//   job.json: { name, spec, outputs } (job_json from buat_video); meta.json (optional): { judul, keywords } for the info panel.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { motionHtml } = await import(join(root, "lib", "motionHtml.mjs"));
const [jobPath, out, metaPath] = process.argv.slice(2);
if (!jobPath || !out) { console.error("usage: node scripts/motion-html.mjs job.json out.html [meta.json]"); process.exit(2); }
const job = JSON.parse(readFileSync(jobPath, "utf8")), meta = metaPath ? JSON.parse(readFileSync(metaPath, "utf8")) : {};
const mbPath = createRequire(join(root, "package.json")).resolve("mediabunny").replace(/dist\/.*$/, "dist/bundles/mediabunny.min.mjs");
const html = motionHtml({ job: { ...job, title: meta.judul ?? job.title, keywords: meta.keywords ?? job.keywords }, engine: readFileSync(join(root, "lib", "motion.mjs"), "utf8"), mediabunny: readFileSync(mbPath, "utf8") });
writeFileSync(out, html);
console.log(`ok ${out} ${(html.length / 1e6).toFixed(2)} MB`);
