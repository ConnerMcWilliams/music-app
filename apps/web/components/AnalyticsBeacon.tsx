"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { getAttribution } from "@/lib/attribution";

// Inlined at build time; unset, we target the local dev API.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Fire-and-forget page-visit ping — the conversion-rate denominator. Runs in the
// browser only, once on load and again on each client-side route change. A
// failed beacon is swallowed so analytics never disturbs the page. Renders
// nothing; mounted once in the root layout.
export function AnalyticsBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    try {
      const attribution = getAttribution();
      fetch(`${API_URL}/api/site/visit/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...attribution, path: pathname }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // best-effort — ignore
    }
  }, [pathname]);

  return null;
}
