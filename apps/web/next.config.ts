import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// The marketing forms and the analytics beacon POST to the Django API, whose
// origin is build-time config. Allow exactly that origin in connect-src (plus
// 'self'). Falls back to the dev API when unset.
function apiOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  try {
    return new URL(raw).origin;
  } catch {
    return "http://localhost:8000";
  }
}

// CSP built from the services this static site actually uses:
// - next/font self-hosts fonts (no external font domain) → font-src 'self'
// - Next's inline hydration bootstrap needs 'unsafe-inline' scripts; a nonce
//   would force dynamic rendering and defeat static output. Dev additionally
//   needs 'unsafe-eval' for React's dev tooling and ws: for HMR.
// - images are same-origin SVG/OG images plus data:/blob: URIs
// - fetch() targets 'self' and the API origin only
function contentSecurityPolicy(): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${apiOrigin()}${isDev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Upgrade http→https in production only; omitted in dev so the plain-http
    // localhost API isn't force-upgraded.
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ];
  return directives.join("; ");
}

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  // HSTS is meaningful only over HTTPS (browsers ignore it over http), so it is
  // sent in production only. 2-year max-age; `preload` is intentionally left off
  // as a reversible default (see docs/security.md).
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
      ]),
];

const nextConfig: NextConfig = {
  // These apply when served by a Node host (`next start`, Vercel, Railway,
  // Render…). If the site is ever exported to a pure static CDN, replicate them
  // at the CDN — headers() does not run there.
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
