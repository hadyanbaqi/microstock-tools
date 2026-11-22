// Owner-only encrypted settings (the token pool in lib/tokenPool.js uses the same encrypt/decrypt). The single
// "mcp_apify_token" from before the pool is only read once to move it into the pool, then deleted. in Supabase `app_secrets` (personal site). Values are AES-256-GCM encrypted with a key
// derived from MCP_SECRET, so the database alone never reveals them; changing MCP_SECRET makes old values unreadable.
import crypto from "node:crypto";
import { hasDb, rest } from "./supabase.js";

const NAME = "mcp_apify_token";
const derive = (s) => crypto.createHash("sha256").update("stockscope-secret-v1:" + s).digest();
// Optional ENC_KEY: a separate encryption secret, so MCP_SECRET (which sits in the connector URL and in access
// logs) is not also the master key. Values written with MCP_SECRET before stay readable (see decrypt).
const secretOf = () => process.env.ENC_KEY || process.env.MCP_SECRET || "";
export const keyOf = () => (secretOf() ? derive(secretOf()) : null);
export const weakSecret = () => !!secretOf() && secretOf().length < 24;

export function encrypt(text) {
  const key = keyOf(), iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString("base64");
}
export function decrypt(b64) {
  const buf = Buffer.from(b64, "base64");
  const keys = [keyOf(), process.env.MCP_SECRET ? derive(process.env.MCP_SECRET) : null].filter(Boolean);
  let last = new Error("Tidak ada kunci enkripsi.");
  for (const key of keys) {
    try {
      const d = crypto.createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
      d.setAuthTag(buf.subarray(12, 28));
      return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
    } catch (e) { last = e; }
  }
  throw last;
}

export const canStore = () => hasDb && !!keyOf();

let memo = { at: 0, value: null };
export async function getMcpToken() {
  if (!canStore()) return "";
  if (Date.now() - memo.at < 60e3) return memo.value ?? "";
  try {
    const [row] = await rest(`app_secrets?name=eq.${NAME}&select=value,updated_at&limit=1`);
    memo = { at: Date.now(), value: row ? decrypt(row.value) : "" };
  } catch (e) {
    console.warn("mcp token read failed:", e.message);
    memo = { at: Date.now(), value: "" };
  }
  return memo.value;
}

export async function deleteMcpToken() {
  await rest(`app_secrets?name=eq.${NAME}`, { method: "DELETE" });
  memo = { at: 0, value: null };
}
