// Event dates for seasonal ideas, computed so the "upload now" list never needs yearly edits.
// Fixed-date and rule-based events are calculated; lunar events (Ramadan, Eid, Lunar New Year, Diwali)
// come from tables through 2035 (dates can differ by a day by country/moon sighting; fine for planning).
const D = (s) => new Date(`${s}T12:00:00`);

const TABLES = {
  ramadan: ["2026-02-18", "2027-02-08", "2028-01-28", "2029-01-16", "2030-01-06", "2030-12-26", "2031-12-15", "2032-12-04", "2033-11-23", "2034-11-12", "2035-11-01"],
  eidFitr: ["2026-03-20", "2027-03-10", "2028-02-27", "2029-02-15", "2030-02-05", "2031-01-25", "2032-01-14", "2033-01-03", "2033-12-23", "2034-12-12", "2035-12-01"],
  eidAdha: ["2026-05-27", "2027-05-16", "2028-05-05", "2029-04-24", "2030-04-13", "2031-04-02", "2032-03-22", "2033-03-11", "2034-03-01", "2035-02-18"],
  lunarNewYear: ["2026-02-17", "2027-02-06", "2028-01-26", "2029-02-13", "2030-02-03", "2031-01-23", "2032-02-11", "2033-01-31", "2034-02-19", "2035-02-08"],
  islamicNewYear: ["2026-06-16", "2027-06-06", "2028-05-25", "2029-05-14", "2030-05-03", "2031-04-23", "2032-04-11", "2033-04-01", "2034-03-21", "2035-03-10"],
  holi: ["2026-03-04", "2027-03-22", "2028-03-11", "2029-03-01", "2030-03-20", "2031-03-09", "2032-03-27", "2033-03-16", "2034-03-05", "2035-03-24"],
  midAutumn: ["2026-09-25", "2027-09-15", "2028-10-03", "2029-09-22", "2030-09-12", "2031-10-01", "2032-09-19", "2033-09-08", "2034-09-27", "2035-09-16"],
  diwali: ["2026-11-08", "2027-10-29", "2028-10-17", "2029-11-05", "2030-10-26", "2031-11-14", "2032-11-02", "2033-10-22", "2034-11-10", "2035-10-30"],
};

// Easter Sunday (anonymous Gregorian algorithm).
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day, 12);
}
// n-th weekday (0 = Sunday) of a month.
function nthWeekday(y, month, weekday, n) {
  const first = new Date(y, month, 1, 12);
  return new Date(y, month, 1 + ((weekday - first.getDay() + 7) % 7) + (n - 1) * 7, 12);
}

const fixed = (m, d) => (y) => new Date(y, m - 1, d, 12);

const RULES = {
  christmas: (y) => new Date(y, 11, 25, 12),
  newYear: (y) => new Date(y, 0, 1, 12),
  valentine: (y) => new Date(y, 1, 14, 12),
  halloween: (y) => new Date(y, 9, 31, 12),
  blackFriday: (y) => { const t = nthWeekday(y, 10, 4, 4); return new Date(y, 10, t.getDate() + 1, 12); },
  easter,
  mothersDay: (y) => nthWeekday(y, 4, 0, 2), // US/Indonesia-style May date used by most buyers
  backToSchool: (y) => new Date(y, 7, 15, 12),
  earthDay: (y) => new Date(y, 3, 22, 12),
  // more fixed days
  worldCancerDay: fixed(2, 4), blackHistoryMonth: fixed(2, 1), womensDay: fixed(3, 8), stPatrick: fixed(3, 17),
  springStart: fixed(3, 20), worldHealthDay: fixed(4, 7), songkran: fixed(4, 13), kartini: fixed(4, 21), laborDay: fixed(5, 1),
  prideMonth: fixed(6, 1), environmentDay: fixed(6, 5), oceansDay: fixed(6, 8), summerStart: fixed(6, 21), yogaDay: fixed(6, 21),
  usIndependence: fixed(7, 4), indonesiaIndependence: fixed(8, 17), autumnStart: fixed(9, 22), batikDay: fixed(10, 2),
  teachersDay: fixed(10, 5), breastCancerMonth: fixed(10, 1), mentalHealthDay: fixed(10, 10), worldFoodDay: fixed(10, 16),
  singlesDay: fixed(11, 11), childrensDay: fixed(11, 20), aidsDay: fixed(12, 1), harbolnas: fixed(12, 12), winterStart: fixed(12, 21),
  // rule-based
  fathersDay: (y) => nthWeekday(y, 5, 0, 3),
  thanksgiving: (y) => nthWeekday(y, 10, 4, 4),
  cyberMonday: (y) => { const t = nthWeekday(y, 10, 4, 4); return new Date(y, 10, t.getDate() + 4, 12); },
  oktoberfest: (y) => nthWeekday(y, 8, 6, 3),
};

// Next date of an event on or after `from` (null when outside the tables).
export function nextEvent(id, from = new Date()) {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 0);
  if (RULES[id]) {
    const y = today.getFullYear();
    const d = RULES[id](y);
    return d >= today ? d : RULES[id](y + 1);
  }
  return (TABLES[id] ?? []).map(D).find((d) => d >= today) ?? null;
}

export const daysUntil = (date, from = new Date()) =>
  Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - new Date(from.getFullYear(), from.getMonth(), from.getDate())) / 864e5);
