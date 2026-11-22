// Agent settings of the account: preset, provider + model per task, monthly budget.
// GET also returns this month's usage summary and the plan (for the settings panel header).
import { accountFrom } from "@/lib/account";
import { agentFail } from "@/lib/ai/http";
import { TASKS, TASK_IDS } from "@/lib/ai/providers";
import { accountPlan, getSettings, monthUsage, saveSettings } from "@/lib/ai/store";
import { planOf } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const account = accountFrom(req);
  try {
    const [settings, usage, plan] = await Promise.all([getSettings(account), monthUsage(account), accountPlan(account)]);
    return Response.json({ settings, usage, plan: { id: plan, ...planOf(plan) }, tasks: TASKS });
  } catch (e) { return agentFail(e, "ai settings read failed:"); }
}

// Body { preset, tasks: { <task>: { provider_id, model } | null }, monthly_budget_usd }
export async function PUT(req) {
  const b = (await req.json().catch(() => null)) ?? {};
  const preset = ["hemat", "seimbang", "kualitas", "custom"].includes(b.preset) ? b.preset : "custom";
  const tasks = {};
  for (const t of TASK_IDS) {
    const v = b.tasks?.[t];
    if (v?.provider_id && v?.model) tasks[t] = { provider_id: String(v.provider_id).slice(0, 80), model: String(v.model).slice(0, 160) };
  }
  let budget = b.monthly_budget_usd;
  const omitted = budget === undefined; // a PUT without the field must not silently reset the budget to unlimited
  budget = budget === null || budget === "" || budget === undefined ? null : Math.max(0, Math.min(100000, Number(budget)));
  if (Number.isNaN(budget)) budget = null;
  try {
    // Keep entries this panel does not edit (e.g. the Ciora model choice in tasks.ciora).
    const cur = await getSettings(accountFrom(req));
    const kept = Object.fromEntries(Object.entries(cur?.tasks ?? {}).filter(([k]) => !TASK_IDS.includes(k)));
    await saveSettings(accountFrom(req), { preset, tasks: { ...kept, ...tasks }, monthly_budget_usd: omitted ? (cur?.monthly_budget_usd ?? null) : budget });
    return Response.json({ ok: true });
  } catch (e) { return agentFail(e, "ai settings save failed:"); }
}
