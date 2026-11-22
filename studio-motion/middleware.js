import { NextResponse } from "next/server";
import { SESSION_COOKIE, hasSession } from "./lib/auth.js";

// Personal site: every page and API route needs the login cookie, except the login itself and the MCP
// endpoint (which checks MCP_SECRET on its own). Without SITE_PASSWORD the site stays locked.
const OPEN = ["/login", "/api/login", "/api/mcp", "/api/keepalive"];

export async function middleware(req) {
  const { pathname, search } = req.nextUrl;
  if (OPEN.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (!process.env.SITE_PASSWORD) {
    return new NextResponse("StockScope terkunci: isi SITE_PASSWORD di Environment Variables.", { status: 503 });
  }
  if (await hasSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Perlu login." }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"] };
