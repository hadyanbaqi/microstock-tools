// Plans and limits for the agent. While the site is personal only "owner" is used (no limits, never billed).
// Free/Pro are placeholders for the subscription roadmap (CLAUDE.md): tune the numbers before launch.
// Limits are per calendar month (Asia/Jakarta not needed: UTC months are fine for quotas).
export const PLANS = {
  owner: { label: "Pemilik", unlimited: true, platformKey: true, limits: {} },
  free: { label: "Free", unlimited: false, platformKey: false, limits: { prompt: 60, metadata: 100, quality: 100, image: 0, video: 0 } },
  pro: { label: "Pro", unlimited: false, platformKey: true, limits: { prompt: 2000, metadata: 3000, quality: 3000, image: 500, video: 100 } },
};

export const planOf = (planId) => PLANS[planId] || PLANS.free;

// null = allowed; otherwise the reason (Indonesian, shown to the user).
export function quotaError(planId, task, usedThisMonth) {
  const p = planOf(planId);
  if (p.unlimited) return null;
  const cap = p.limits[task];
  if (cap === undefined) return null;
  if (cap === 0) return `Paket ${p.label} belum termasuk tugas ini.`;
  return usedThisMonth >= cap ? `Kuota ${task} paket ${p.label} bulan ini habis (${cap}).` : null;
}
