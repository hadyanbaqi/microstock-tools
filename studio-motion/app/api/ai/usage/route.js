// Agent usage: this month's totals + the latest calls.
import { accountFrom } from "@/lib/account";
import { agentFail } from "@/lib/ai/http";
import { monthUsage, recentUsage } from "@/lib/ai/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const account = accountFrom(req);
  try {
    const [month, recent] = await Promise.all([monthUsage(account), recentUsage(account, 20)]);
    return Response.json({ month, recent });
  } catch (e) { return agentFail(e, "ai usage failed:"); }
}
