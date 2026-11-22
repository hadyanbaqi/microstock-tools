// Copies the ffmpeg.wasm core (ProRes encoder) from node_modules into public/ffmpeg so the browser can load it from this site.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "@ffmpeg", "core", "dist", "umd"), to = join(root, "public", "ffmpeg");
if (!existsSync(from)) { console.warn("@ffmpeg/core belum terpasang: export MOV ProRes tidak akan tersedia."); process.exit(0); }
mkdirSync(to, { recursive: true });
for (const f of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) copyFileSync(join(from, f), join(to, f));
console.log("ffmpeg core disalin ke public/ffmpeg");
