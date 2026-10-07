import { timingSafeEqual } from "node:crypto";
import { buildSpendReport, webhookPayload } from "@kp/core";
import { getRecentSpend, spendConfig } from "@/server/spend-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; reject everything if it's unset.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const config = spendConfig();
  const spend = await getRecentSpend();
  const report = buildSpendReport({
    spend,
    runCount: spend.runCount,
    alertThresholdUsd: config.alertThresholdUsd,
    dailyLimitUsd: config.dailyLimitUsd,
    runsDisabled: config.runsDisabled,
  });

  let alerted = false;
  if (report.shouldAlert) {
    const webhook = process.env.KP_ALERT_WEBHOOK_URL;
    if (!webhook) {
      console.warn("[spend-report] over alert threshold but KP_ALERT_WEBHOOK_URL is unset\n" + report.text);
    } else {
      const res = await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(webhookPayload(report.text)),
      });
      alerted = res.ok;
      if (!res.ok) console.error(`[spend-report] webhook failed: ${res.status} ${await res.text()}`);
    }
  }

  return Response.json({ ...report, alerted });
}
