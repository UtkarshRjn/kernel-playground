# Operations: cost guardrails checklist

The app enforces per-user credits plus a platform-wide daily GPU spend cap (see
"In-app guardrails" below). Those only see runs the app knows about. Provider-side limits are
the backstop if the app has a bug, is bypassed, or a secret leaks. Set **all** of these
before launch. Click-paths were checked against provider docs in Oct 2026, so they may have moved since.

## In-app guardrails (env vars on Vercel)

| Env var | Default | Effect |
| --- | --- | --- |
| `KP_RUNS_DISABLED` | unset | `1` rejects every new run ("GPU capacity paused for today"). Fastest kill switch. |
| `KP_DAILY_SPEND_LIMIT_USD` | `25` | Rejects new runs once trailing-24h spend (settled `Run.costUsd` + in-flight holds) reaches this. |
| `KP_SPEND_ALERT_USD` | `10` | Daily cron posts to the webhook when trailing-24h spend reaches this. |
| `KP_ALERT_WEBHOOK_URL` | unset | Slack or Discord incoming webhook (payload sends both `text` and `content`). |
| `CRON_SECRET` | unset | Required; Vercel Cron sends it as `Authorization: Bearer …`. Route returns 401 without it. |

- [ ] Set the env vars above in Vercel → Project → Settings → Environment Variables (Production), then redeploy.
      **Env var changes only take effect after a redeploy**, including flipping `KP_RUNS_DISABLED`.
- [ ] Confirm the cron shows under Vercel → Project → Settings → Cron Jobs (`/api/cron/spend-report`, daily 15:00 UTC).
      On Hobby, cron runs at most once per day and may fire anytime within the scheduled hour.
- [ ] Test the alert manually: `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/spend-report`
      (temporarily set `KP_SPEND_ALERT_USD=0` to force a webhook post).

## Modal (GPU, the biggest risk)

- [ ] **Workspace budget + spend limit**: Modal dashboard → Settings → **Usage & Billing**. Set a Workspace budget
      (monthly usage cap) and a spend limit (monthly net-charge cap). Requires Owner/Manager role.
      Suggested: ~30× `KP_DAILY_SPEND_LIMIT_USD` at most.
- [ ] **Budget alerts**: Settings → **Slack Notifications** → "Add to Slack". This alerts when the workspace approaches or
      reaches its usage limit/budget, or hits GPU resource limits.
- [ ] (Team/Enterprise plans) Optional per-environment budget: Workspace Management → **Environments**.
- Docs: <https://modal.com/docs/guide/budgets>, <https://modal.com/docs/guide/slack-notifications>

## Vercel

- [ ] (Pro plan) Team dashboard → Settings → **Billing** → **Spend Management**: enable, set an On-Demand Budget,
      turn on notifications. Optionally enable **Pause Production Deployments** (this takes the site down when hit,
      and projects must be resumed manually).
- [ ] Hobby plan has hard usage limits instead of billing; check Usage tab periodically.
- Emergency: Project → Settings → General → **Pause Project**.
- Docs: <https://vercel.com/docs/spend-management>

## Postgres

**Neon** (Launch/Scale plans):
- [ ] Console → select organization (profile menu, top-right) → **Billing** → **Spending Notifications** card →
      Enable, enter monthly $ amount. Emails org admins at 80% and 100%. Alert-only; it does not suspend computes.
- [ ] Also cap autoscaling: in the production branch's compute settings, set a low max compute size.
- Docs: <https://neon.com/docs/introduction/spending-notifications>

**Supabase** (if used instead):
- [ ] Organization → **Billing** → **Cost Control**: keep **Spend Cap** ON (Pro default). There are no $-threshold
      alerts; watch the organization **Usage** page and the "Upcoming Invoice" on Billing.
- Docs: <https://supabase.com/docs/guides/platform/spend-cap>

## PostHog

- [ ] Organization settings → **Billing** → for *each* product (Product analytics, Session replay, …) scroll to the
      bottom → **Set billing limit** → enter $ → Save. Owner gets emails at 80%/100%; data past the limit is dropped.
- [ ] Consider disabling session replay or lowering its sample rate before launch.
- Docs: <https://posthog.com/docs/billing/limits-alerts>

## Incident runbook: unexpected spend

1. Vercel → set `KP_RUNS_DISABLED=1` → redeploy. New runs are rejected immediately after deploy.
2. If GPU usage continues (in-flight or leaked token): Modal dashboard → stop the app, rotate `EXECUTION_TOKEN`.
3. Inspect recent runs: `SELECT "userId", count(*), sum("costUsd") FROM "Run" WHERE "createdAt" > now() - interval '24 hours' GROUP BY 1 ORDER BY 3 DESC;`
4. Unset `KP_RUNS_DISABLED` and redeploy once resolved.
