// A user's own Apify token, sent by the browser in the x-apify-token header.
// Only used for the current request: never logged, cached or stored on the server.
export function userTokenFrom(req) {
  const t = (req.headers.get("x-apify-token") ?? "").trim();
  return t.length >= 10 && t.length <= 200 && /^[\w-]+$/.test(t) ? t : "";
}
