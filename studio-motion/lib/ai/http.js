// Shared error answer for the /api/ai/* routes.
export function agentFail(e, msg) {
  console.error(msg, e.message);
  if (/fetch failed|supabase|ENOTFOUND|ECONNREFUSED/i.test(e.message) && !e.status)
    return Response.json({ error: "Database (Supabase) tidak bisa dihubungi. Sudah jalankan migration 20261027_agent_foundation.sql?" }, { status: 503 });
  return Response.json({ error: e.status ? e.message : `${msg.replace(/:$/, "")}.`, code: e.code }, { status: e.status ?? 502 });
}
