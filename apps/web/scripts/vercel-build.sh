#!/bin/sh
# Vercel build entrypoint (Vercel runs the `vercel-build` script instead of `build` when present).
# Preview deployments usually share the production DATABASE_URL, so migrations only run for
# production builds unless PRISMA_MIGRATE_ON_BUILD=1 (e.g. previews pointed at a branch DB).
# Requires DIRECT_URL: `migrate deploy` takes an advisory lock that poolers (pgbouncer) break.
set -eu

prisma generate
next build

if [ "${VERCEL_ENV:-}" = "production" ] || [ "${PRISMA_MIGRATE_ON_BUILD:-}" = "1" ]; then
  prisma migrate deploy
else
  echo "vercel-build: skipping prisma migrate deploy (VERCEL_ENV=${VERCEL_ENV:-unset})"
fi
