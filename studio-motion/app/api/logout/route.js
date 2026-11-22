import { SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST only: a plain link or image on another site must not be able to log the owner out.
export async function POST() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` },
  });
}
