// Trademark / brand words that must never appear in stock titles or keywords (same list as the owner's
// platforms.py checker). Used by the MCP metadata tools before anything reaches a CSV.
export const BRAND_RE = /\b(instagram|insta|facebook|tiktok|youtube|whatsapp|iphone|ipad|macbook|imac|apple|android|google|twitter|pinterest|snapchat|linkedin|telegram|messenger|disney|pixar|marvel|pokemon|lego|barbie|coca cola|pepsi|nike|adidas|sony|tesla|microsoft|gucci|ferrari|toyota|mercedes|bmw|starbucks|mcdonalds|amazon|adobe|canva|chatgpt|openai|samsung|netflix|spotify|discord|reddit|hollywood|oscar|oscars|polaroid|grammy|olympic|olympics|kodak|starbucks|amazon|paypal|hello kitty|sanrio|grinch|rudolph|harry potter|star wars|minecraft|roblox|fortnite|after effects|premiere|final cut|davinci|lottie)\b/i;

export const brandHits = (text) => {
  const out = new Set(); const re = new RegExp(BRAND_RE.source, "gi"); let m;
  while ((m = re.exec(String(text)))) out.add(m[1].toLowerCase());
  return [...out];
};
