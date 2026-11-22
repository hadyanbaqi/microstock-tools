// Adobe Stock content types, in the actor's "Content Type" order. Shared by server and UI.

export const CONTENT_TYPES = [
  { id: "photo", label: "Foto", mediaTypeId: 1,
    tip: "Minimal 4 MP, JPEG. Keyword: subjek, aksi, lokasi, emosi, konsep." },
  { id: "illustration", label: "Ilustrasi", mediaTypeId: 2,
    tip: "Raster JPEG. Sebutkan gaya (flat, 3d render, watercolor) di keyword." },
  { id: "vector", label: "Vektor", mediaTypeId: 3,
    tip: "Upload EPS/AI (+ JPEG pratinjau). Keyword gaya: vector, flat, icon set, seamless pattern." },
  { id: "video", label: "Video", mediaTypeId: 4,
    tip: "MOV/MP4, 5–60 detik. Sebutkan resolusi, slow motion, aerial, loop di keyword." },
  { id: "template", label: "Template", mediaTypeId: 7,
    tip: "Template PSD/AI/INDD/MOGRT. Sebutkan kegunaan: flyer, social media post, mockup." },
  { id: "3d", label: "3D", mediaTypeId: 6,
    tip: "Model/material/light 3D. Sebutkan objek, gaya, dan format di keyword." },
];

export const TYPE_IDS = CONTENT_TYPES.map((t) => t.id);
export const typeInfo = (id) => CONTENT_TYPES.find((t) => t.id === id);
export const typeLabel = (id) => typeInfo(id)?.label ?? (id === "image" ? "Gambar" : "Lainnya");

const BY_MEDIA_ID = Object.fromEntries(CONTENT_TYPES.map((t) => [t.mediaTypeId, t.id]));
const ALIASES = { photos: "photo", image: "image", images: "image", illustrations: "illustration", vectors: "vector",
  videos: "video", templates: "template", "3d": "3d", "3d-assets": "3d", "3d asset": "3d", "3d assets": "3d" };

// Best-effort type of a scraped item. Uses whichever field the actor provides; falls back to the
// URL path (only tells image/video/template/3d apart) and finally to the type that was searched.
export function detectType(item, searched) {
  const byId = BY_MEDIA_ID[Number(item.media_type_id ?? item.mediaTypeId)];
  if (byId) return byId;
  const raw = String(item.content_type ?? item.asset_type ?? item.media_type ?? item.type ?? "").toLowerCase().trim();
  if (raw) {
    const t = TYPE_IDS.includes(raw) ? raw : ALIASES[raw];
    if (t && t !== "image") return t;
  }
  const url = String(item.details_url ?? "");
  if (/\/video\//.test(url)) return "video";
  if (/\/templates?\//.test(url)) return "template";
  if (/\/3d-assets?\//.test(url)) return "3d";
  if (searched && searched !== "all") return searched;
  return /\/images?\//.test(url) ? "image" : "unknown";
}
