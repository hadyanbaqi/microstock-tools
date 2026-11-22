// A visitor's workspace code (random, kept in their browser, sent as x-workspace). It only scopes the
// "Tersimpan" list; it is not authentication. Replace with real accounts when auth lands (roadmap).
export function workspaceFrom(req) {
  const w = (req.headers.get("x-workspace") ?? "").trim().toLowerCase();
  return /^ss-[a-f0-9]{16,40}$/.test(w) ? w : "";
}
