// Who is calling. The site is personal for now (one password, middleware.js), so every request belongs to the single
// account "owner". Subscription-ready: every agent table carries account_id; when real auth lands, resolve the user's
// id here (from the session) and nothing else has to change.
export const OWNER = "owner";

export function accountFrom(/* req */) {
  return OWNER;
}
