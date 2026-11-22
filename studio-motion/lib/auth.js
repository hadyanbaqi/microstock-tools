// Personal lock: the whole site sits behind one password (SITE_PASSWORD), the MCP endpoint behind MCP_SECRET.
// Edge-safe (Web Crypto only) because middleware.js uses it too.

export const SESSION_COOKIE = "ss_session";
export const SESSION_DAYS = 14;

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

const hmac = async (secret, msg) => {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
};
// The signing key mixes the password with the optional SESSION_SECRET, so the cookie never reveals anything
// that can be attacked offline, and changing either one logs every device out.
const signingSecret = (password) => `stockscope-session-v2:${password}:${process.env.SESSION_SECRET ?? ""}`;

// Session value = "<expiry ms>.<random nonce>.<HMAC>": a fresh value per login that expires on its own.
export async function sessionValue(password = process.env.SITE_PASSWORD) {
  if (!password) return null;
  const exp = Date.now() + SESSION_DAYS * 864e5;
  const nonce = hex(crypto.getRandomValues(new Uint8Array(12)));
  return `${exp}.${nonce}.${await hmac(signingSecret(password), `${exp}.${nonce}`)}`;
}

// Constant-time string comparison.
export function safeEqual(a, b) {
  a = String(a ?? ""); b = String(b ?? "");
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export async function hasSession(cookieValue, password = process.env.SITE_PASSWORD) {
  if (!password || !cookieValue) return false;
  const [exp, nonce, sig] = String(cookieValue).split(".");
  if (!/^\d{10,15}$/.test(exp ?? "") || !/^[a-f0-9]{24}$/.test(nonce ?? "") || !sig) return false;
  if (Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmac(signingSecret(password), `${exp}.${nonce}`));
}
