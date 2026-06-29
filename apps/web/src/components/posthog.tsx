"use client";

import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import { useEffect } from "react";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

let initialized = false;
function ensureInit() {
  if (initialized || !KEY || typeof window === "undefined") return;
  posthog.init(KEY, {
    api_host: HOST,
    capture_pageview: false, // we send $pageview on route change below
    person_profiles: "identified_only",
  });
  initialized = true;
}

/** Initializes PostHog (if configured) and sends a pageview on each route change. */
export function Analytics() {
  const pathname = usePathname();
  useEffect(() => {
    ensureInit();
  }, []);
  useEffect(() => {
    if (initialized) posthog.capture("$pageview", { path: pathname });
  }, [pathname]);
  return null;
}

/** Capture a product event (no-op when PostHog isn't configured). */
export function track(event: string, props?: Record<string, unknown>) {
  if (KEY && typeof window !== "undefined") posthog.capture(event, props);
}
