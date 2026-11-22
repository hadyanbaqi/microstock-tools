// Understands what the user typed into a search box.
//   https://stock.adobe.com/contributor/208000000/name  → contributor
//   https://stock.adobe.com/images/some-title/123456789 → asset (also /video/, /templates/, /3d-assets/)
//   123456789                                            → asset ID
//   anything else                                        → niche keyword
export function parseInput(raw) {
  const s = String(raw ?? "").trim();
  const contributor = s.match(/contributor\/(\d{3,})/i);
  if (contributor) return { kind: "contributor", id: contributor[1] };
  const asset = s.match(/stock\.adobe\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:images|image|video|templates|template|3d-assets|stock-photo)\/(?:[^/?#]+\/)?(\d{5,})/i);
  if (asset) return { kind: "asset", id: asset[1] };
  if (/^#?\d{5,}$/.test(s)) return { kind: "asset", id: s.replace("#", "") };
  return s ? { kind: "niche", query: s } : { kind: "empty" };
}
