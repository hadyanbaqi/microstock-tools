// Normalized search params: the same object (and so the same cache key) whether a search comes from
// the browser or is recovered from an earlier Apify run.
import { TYPE_IDS } from "./contentTypes.js";

const ASSETS = ["all", ...TYPE_IDS];
const AI = ["", "only", "exclude"];
const ORDERS = ["downloads", "relevance", "recent", "newest", "featured", "undiscovered"];

export function normalizeParams(body = {}) {
  // Adobe search is case-insensitive; normalize so the cache hits more often.
  const query = String(body.query ?? "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 100);
  const creatorId = body.creatorId ? String(body.creatorId).replace(/\D/g, "").replace(/^0+/, "") : "";
  return {
    query,
    creatorId,
    asset: ASSETS.includes(body.asset) ? body.asset : "all",
    ai: AI.includes(body.ai) ? body.ai : "",
    order: ORDERS.includes(body.order) ? body.order : "downloads",
    maxItems: Math.min(Math.max(Math.round(Number(body.maxItems)) || 60, 10), 300),
  };
}
