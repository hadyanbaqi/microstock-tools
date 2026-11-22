import { NextResponse } from "next/server";
import { getJob, listJobs, updateJob } from "@/lib/motionJobs";

export const dynamic = "force-dynamic";

// Studio Motion video orders created by Claude through MCP (buat_video). The web UI reads them and, after a render,
// marks them "dirender"; the site is already locked behind the owner's password (middleware).
export async function GET(req) {
  const u = new URL(req.url), id = u.searchParams.get("id");
  try {
    if (id) { const job = await getJob(id); return job ? NextResponse.json({ job }) : NextResponse.json({ error: "Video tidak ditemukan." }, { status: 404 }); }
    return NextResponse.json({ jobs: await listJobs(u.searchParams.get("limit") || 30) });
  } catch (e) {
    return NextResponse.json({ error: `Daftar video belum bisa dimuat: ${e.message}` }, { status: 500 });
  }
}

const UI_STATUS = new Set(["baru", "dirender"]);
export async function PATCH(req) {
  const b = await req.json().catch(() => ({}));
  if (!UI_STATUS.has(b.status)) return NextResponse.json({ error: "Status tidak valid." }, { status: 400 });
  try {
    const job = await updateJob(b.id, { status: b.status });
    return job ? NextResponse.json({ job: { id: job.id, status: job.status } }) : NextResponse.json({ error: "Video tidak ditemukan." }, { status: 404 });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 400 }); }
}
