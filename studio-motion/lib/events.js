// Microstock calendar: events buyers design for, with the window (days before the event) in which to upload
// and suggested keywords. Dates come from lib/holidays.js, so the calendar never needs yearly edits.
// `major` events also appear as seasonal ideas on Beranda.
import { daysUntil, nextEvent } from "./holidays.js";

export const CATEGORIES = {
  agama: "Hari raya",
  belanja: "Belanja & promo",
  peringatan: "Hari peringatan",
  musim: "Musim",
  budaya: "Budaya & festival",
  indonesia: "Indonesia",
};

const W = { big: [110, 7], mid: [90, 5], small: [60, 5] };

export const EVENTS = [
  // Hari raya
  { id: "christmas", emoji: "🎄", label: "Natal", cat: "agama", window: W.big, major: true, query: "christmas background", keywords: ["christmas", "xmas", "christmas tree", "santa", "gift", "winter holiday", "festive", "ornament"] },
  { id: "newYear", emoji: "🎆", label: "Tahun Baru", cat: "agama", window: W.mid, query: "new year celebration", keywords: ["new year", "fireworks", "countdown", "celebration", "party", "new year eve", "resolution", "champagne"] },
  { id: "ramadan", emoji: "🌙", label: "Ramadan", cat: "agama", window: W.big, major: true, query: "ramadan kareem background", keywords: ["ramadan", "ramadan kareem", "lantern", "crescent moon", "mosque", "iftar", "islamic", "fasting"] },
  { id: "eidFitr", emoji: "🕌", label: "Idul Fitri", cat: "agama", window: W.big, major: true, query: "eid al fitr background", keywords: ["eid al fitr", "eid mubarak", "lebaran", "ketupat", "islamic greeting", "mosque", "family gathering", "celebration"] },
  { id: "eidAdha", emoji: "🐐", label: "Idul Adha", cat: "agama", window: W.mid, major: true, query: "eid al adha", keywords: ["eid al adha", "qurban", "sacrifice", "goat", "islamic", "eid mubarak", "hajj", "mosque"] },
  { id: "islamicNewYear", emoji: "🌙", label: "Tahun Baru Islam", cat: "agama", window: W.small, query: "islamic new year", keywords: ["islamic new year", "hijri", "muharram", "crescent", "islamic", "greeting card"] },
  { id: "easter", emoji: "🐣", label: "Paskah", cat: "agama", window: W.mid, major: true, query: "easter spring", keywords: ["easter", "easter egg", "bunny", "spring", "pastel", "egg hunt", "holiday", "flowers"] },
  { id: "diwali", emoji: "🪔", label: "Diwali", cat: "agama", window: W.mid, major: true, query: "diwali festival", keywords: ["diwali", "deepavali", "diya", "oil lamp", "rangoli", "festival of lights", "indian festival", "celebration"] },
  { id: "holi", emoji: "🎨", label: "Holi", cat: "budaya", window: W.small, query: "holi festival colors", keywords: ["holi", "festival of colors", "color powder", "india", "spring festival", "celebration"] },
  { id: "lunarNewYear", emoji: "🧧", label: "Imlek", cat: "budaya", window: W.big, major: true, query: "chinese new year", keywords: ["chinese new year", "lunar new year", "red envelope", "lantern", "dragon", "gold", "festive", "asian"] },
  { id: "midAutumn", emoji: "🥮", label: "Festival Kue Bulan", cat: "budaya", window: W.small, query: "mid autumn festival", keywords: ["mid autumn festival", "mooncake", "lantern", "full moon", "chinese festival", "rabbit"] },
  { id: "songkran", emoji: "💦", label: "Songkran", cat: "budaya", window: W.small, query: "songkran water festival", keywords: ["songkran", "thai new year", "water festival", "thailand", "celebration"] },
  { id: "oktoberfest", emoji: "🍺", label: "Oktoberfest", cat: "budaya", window: W.small, query: "oktoberfest", keywords: ["oktoberfest", "beer festival", "bavarian", "pretzel", "germany", "party"] },
  { id: "stPatrick", emoji: "☘️", label: "St. Patrick's Day", cat: "budaya", window: W.small, query: "st patricks day", keywords: ["st patricks day", "shamrock", "clover", "irish", "green", "leprechaun", "lucky"] },
  { id: "halloween", emoji: "🎃", label: "Halloween", cat: "budaya", window: [75, 3], major: true, query: "halloween background", keywords: ["halloween", "pumpkin", "spooky", "witch", "ghost", "trick or treat", "costume", "autumn night"] },
  // Belanja & promo
  { id: "valentine", emoji: "💝", label: "Valentine", cat: "belanja", window: [75, 5], major: true, query: "valentines day background", keywords: ["valentines day", "love", "heart", "romantic", "couple", "gift", "pink", "red"] },
  { id: "mothersDay", emoji: "🌷", label: "Hari Ibu (Mother's Day)", cat: "belanja", window: [70, 5], major: true, query: "mothers day", keywords: ["mothers day", "mom", "mother and child", "flowers", "family", "love", "gift", "greeting card"] },
  { id: "fathersDay", emoji: "👔", label: "Hari Ayah (Father's Day)", cat: "belanja", window: W.small, query: "fathers day", keywords: ["fathers day", "dad", "father and son", "family", "gift", "tie", "greeting card"] },
  { id: "backToSchool", emoji: "🎒", label: "Kembali ke sekolah", cat: "belanja", window: W.mid, major: true, query: "back to school", keywords: ["back to school", "school supplies", "student", "classroom", "education", "backpack", "pencil", "kids"] },
  { id: "singlesDay", emoji: "🛒", label: "11.11 Singles Day", cat: "belanja", window: W.small, query: "11.11 sale", keywords: ["11.11", "singles day", "online shopping", "sale", "discount", "e-commerce", "banner"] },
  { id: "thanksgiving", emoji: "🦃", label: "Thanksgiving", cat: "belanja", window: W.mid, query: "thanksgiving dinner", keywords: ["thanksgiving", "turkey", "family dinner", "autumn", "harvest", "gratitude", "pumpkin pie"] },
  { id: "blackFriday", emoji: "🛍️", label: "Black Friday", cat: "belanja", window: [80, 5], major: true, query: "black friday sale", keywords: ["black friday", "sale", "discount", "shopping", "promo", "banner", "price tag", "deal"] },
  { id: "cyberMonday", emoji: "💻", label: "Cyber Monday", cat: "belanja", window: W.small, query: "cyber monday sale", keywords: ["cyber monday", "online shopping", "sale", "e-commerce", "laptop", "discount", "banner"] },
  { id: "harbolnas", emoji: "🇮🇩", label: "Harbolnas 12.12", cat: "indonesia", window: W.small, query: "12.12 sale", keywords: ["12.12", "online shopping", "sale", "discount", "e-commerce", "banner", "flash sale"] },
  // Hari peringatan
  { id: "worldCancerDay", emoji: "🎗️", label: "Hari Kanker Sedunia", cat: "peringatan", window: W.small, query: "world cancer day", keywords: ["world cancer day", "cancer awareness", "ribbon", "healthcare", "support", "medical"] },
  { id: "blackHistoryMonth", emoji: "✊🏿", label: "Black History Month", cat: "peringatan", window: W.small, query: "black history month", keywords: ["black history month", "african american", "diversity", "heritage", "equality"] },
  { id: "womensDay", emoji: "👩", label: "Hari Perempuan Internasional", cat: "peringatan", window: W.mid, major: true, query: "international womens day", keywords: ["international womens day", "women empowerment", "female", "equality", "diversity", "march 8", "girl power"] },
  { id: "worldHealthDay", emoji: "🩺", label: "Hari Kesehatan Sedunia", cat: "peringatan", window: W.small, query: "world health day", keywords: ["world health day", "healthcare", "doctor", "medical", "wellness", "hospital"] },
  { id: "earthDay", emoji: "🌎", label: "Hari Bumi", cat: "peringatan", window: [60, 5], major: true, query: "earth day environment", keywords: ["earth day", "environment", "save the planet", "eco friendly", "sustainability", "green", "nature"] },
  { id: "laborDay", emoji: "👷", label: "Hari Buruh", cat: "peringatan", window: W.small, query: "labour day workers", keywords: ["labour day", "may day", "workers", "industry", "construction", "workforce"] },
  { id: "prideMonth", emoji: "🏳️‍🌈", label: "Pride Month", cat: "peringatan", window: W.mid, query: "pride month", keywords: ["pride month", "lgbtq", "rainbow", "diversity", "inclusion", "love"] },
  { id: "environmentDay", emoji: "🌱", label: "Hari Lingkungan Hidup", cat: "peringatan", window: W.small, query: "world environment day", keywords: ["world environment day", "sustainability", "recycling", "green energy", "nature", "climate"] },
  { id: "oceansDay", emoji: "🌊", label: "Hari Laut Sedunia", cat: "peringatan", window: W.small, query: "world oceans day", keywords: ["world oceans day", "ocean", "marine life", "plastic pollution", "underwater", "coral reef"] },
  { id: "yogaDay", emoji: "🧘", label: "Hari Yoga Internasional", cat: "peringatan", window: W.small, query: "international yoga day", keywords: ["yoga day", "yoga", "meditation", "wellness", "mindfulness", "fitness"] },
  { id: "teachersDay", emoji: "🍎", label: "Hari Guru Sedunia", cat: "peringatan", window: W.small, query: "world teachers day", keywords: ["teachers day", "teacher", "classroom", "education", "school", "thank you teacher"] },
  { id: "breastCancerMonth", emoji: "🎀", label: "Bulan Kesadaran Kanker Payudara", cat: "peringatan", window: W.mid, query: "breast cancer awareness", keywords: ["breast cancer awareness", "pink ribbon", "october", "women health", "support", "survivor"] },
  { id: "mentalHealthDay", emoji: "🧠", label: "Hari Kesehatan Mental", cat: "peringatan", window: W.small, query: "world mental health day", keywords: ["mental health", "mental health day", "wellbeing", "therapy", "anxiety", "self care"] },
  { id: "worldFoodDay", emoji: "🍲", label: "Hari Pangan Sedunia", cat: "peringatan", window: W.small, query: "world food day", keywords: ["world food day", "food security", "agriculture", "hunger", "healthy food", "farming"] },
  { id: "childrensDay", emoji: "🧒", label: "Hari Anak Sedunia", cat: "peringatan", window: W.small, query: "world childrens day", keywords: ["childrens day", "kids", "happy children", "childhood", "family", "education"] },
  { id: "aidsDay", emoji: "❤️", label: "Hari AIDS Sedunia", cat: "peringatan", window: W.small, query: "world aids day", keywords: ["world aids day", "red ribbon", "hiv awareness", "healthcare", "support"] },
  // Musim
  { id: "springStart", emoji: "🌸", label: "Awal musim semi", cat: "musim", window: W.mid, query: "spring flowers background", keywords: ["spring", "flowers", "blossom", "fresh", "pastel", "garden", "nature"] },
  { id: "summerStart", emoji: "☀️", label: "Awal musim panas", cat: "musim", window: W.mid, major: true, query: "summer vacation beach", keywords: ["summer", "beach", "vacation", "tropical", "sun", "holiday", "travel", "pool"] },
  { id: "autumnStart", emoji: "🍂", label: "Awal musim gugur", cat: "musim", window: W.mid, query: "autumn leaves background", keywords: ["autumn", "fall", "leaves", "cozy", "harvest", "pumpkin", "orange"] },
  { id: "winterStart", emoji: "❄️", label: "Awal musim dingin", cat: "musim", window: W.mid, query: "winter snow background", keywords: ["winter", "snow", "cold", "cozy", "snowflake", "frost", "holiday season"] },
  // Indonesia
  { id: "kartini", emoji: "🌺", label: "Hari Kartini", cat: "indonesia", window: W.small, query: "kartini day indonesia", keywords: ["kartini", "indonesian woman", "kebaya", "women empowerment", "indonesia"] },
  { id: "indonesiaIndependence", emoji: "🇮🇩", label: "HUT RI 17 Agustus", cat: "indonesia", window: W.mid, query: "indonesia independence day", keywords: ["indonesia independence day", "17 august", "merah putih", "flag", "indonesia", "celebration"] },
  { id: "batikDay", emoji: "🧵", label: "Hari Batik Nasional", cat: "indonesia", window: W.small, query: "batik pattern", keywords: ["batik", "batik pattern", "indonesian culture", "traditional", "textile", "motif"] },
  { id: "usIndependence", emoji: "🇺🇸", label: "4th of July", cat: "budaya", window: W.mid, query: "4th of july", keywords: ["4th of july", "independence day", "usa", "american flag", "fireworks", "patriotic"] },
];

const fmtDay = (d, year = true) => d.toLocaleDateString("id-ID", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}) });

// Where an event stands today. upload = inside its window with time to spare; mepet = less than a month
// to go (buyers already bought); nanti = window not open yet (startOn = when to start).
export function eventStatus(e, date = new Date()) {
  const at = nextEvent(e.id, date);
  if (!at) return null;
  const left = daysUntil(at, date);
  const uploadBy = new Date(at.getTime() - 30 * 864e5);
  const startOn = new Date(at.getTime() - e.window[0] * 864e5);
  const status = left > e.window[0] ? "nanti" : daysUntil(uploadBy, date) > 0 ? "upload" : "mepet";
  return { ...e, at, left, uploadBy, startOn, status, dateText: fmtDay(at), uploadByText: fmtDay(uploadBy, false), startText: fmtDay(startOn, false) };
}

// Rolling 12 months from the current month: [{ key, label, events: [...] }].
export function calendar(date = new Date()) {
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = new Date(date.getFullYear(), date.getMonth() + i, 1, 12);
    return { key: `${m.getFullYear()}-${m.getMonth()}`, label: m.toLocaleDateString("id-ID", { month: "long", year: "numeric" }), year: m.getFullYear(), month: m.getMonth(), events: [] };
  });
  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1, 12);
  for (const e of EVENTS) {
    const s = eventStatus(e, date);
    if (s) months.find((m) => m.year === s.at.getFullYear() && m.month === s.at.getMonth())?.events.push(s);
    // Earlier this month: keep it visible as "lewat" so the current month is complete.
    const past = nextEvent(e.id, monthStart);
    if (past && past.getMonth() === date.getMonth() && daysUntil(past, date) < 0) {
      months[0].events.push({ ...e, at: past, left: daysUntil(past, date), status: "lewat", dateText: fmtDay(past) });
    }
  }
  for (const m of months) m.events.sort((a, b) => a.at - b.at);
  return months;
}

// Events to work on now (inside their window, still with time to upload), soonest first.
export const uploadNow = (date = new Date()) =>
  EVENTS.map((e) => eventStatus(e, date)).filter((s) => s && s.status !== "nanti" && s.left >= s.window[1]).sort((a, b) => a.left - b.left);
