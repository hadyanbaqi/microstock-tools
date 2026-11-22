import { NextResponse } from "next/server";
import { createRequest, listRequests, updateRequest } from "@/lib/motionRequests";
import { ASPECTS } from "@/lib/htmlMotion.mjs";

export const dynamic = "force-dynamic";

// Studio Motion "Kirim ke Claude": the owner sends a video idea (text and/or reference image); Claude picks it up through
// MCP (permintaan_video) and answers with buat_video. Behind the site password (middleware).
const MAX_IMG = 4_000_000;
const light = ({ image, ...r }) => ({ ...r, has_image: r.has_image ?? Boolean(image) });

export async function GET(req) {
  const u = new URL(req.url);
  try { return NextResponse.json({ requests: await listRequests({ limit: u.searchParams.get("limit") || 20 }) }); }
  catch (e) { return NextResponse.json({ error: `Permintaan belum bisa dimuat: ${e.message}` }, { status: 500 }); }
}

export async function POST(req) {
  let b; try { b = await req.json(); } catch { return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 }); }
  const idea = String(b.idea || "").trim().slice(0, 4000), img = typeof b.image === "string" ? b.image : "";
  if (img && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(img) || img.length > MAX_IMG)) return NextResponse.json({ error: "Gambar harus PNG/JPG/WEBP di bawah ±3 MB." }, { status: 400 });
  if (!idea && !img) return NextResponse.json({ error: "Tulis ide atau unggah gambar dulu." }, { status: 400 });
  const aspect = Object.hasOwn(ASPECTS, b.aspect) ? b.aspect : "16:9", duration = Math.min(60, Math.max(5, Math.round(Number(b.duration) || 10)));
  try { return NextResponse.json({ request: light(await createRequest({ idea, image: img || null, aspect, duration })) }); }
  catch (e) { return NextResponse.json({ error: `Permintaan gagal disimpan: ${e.message}` }, { status: 500 }); }
}

// Cancel a request that Claude has not finished yet.
export async function PATCH(req) {
  let b; try { b = await req.json(); } catch { return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 }); }
  try { const r = await updateRequest(b.id, { status: "batal" }); return r ? NextResponse.json({ request: light(r) }) : NextResponse.json({ error: "Permintaan tidak ditemukan." }, { status: 404 }); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: 400 }); }
}
