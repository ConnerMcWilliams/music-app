import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// The dashboard calls the Django API (auth + admin endpoints), whose origin is
// build-time config. Allow exactly that origin in connect-src (plus 'self').
function apiOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  try {
    return new URL(raw).origin;
  } catch {
    return "http://localhost:8000";
  }
}

// CSP built from what this internal tool actually uses: next/font self-hosts
// fonts; Next's inline hydration needs 'unsafe-inline' scripts (a nonce would
// force dynamic rendering); fetch() targets 'self' and the API origin only.
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
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ];
  return directives.join("; ");
}

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // The dashboard shows subscriber data: keep the referrer off cross-origin
  // navigations entirely.
  { key: "Referrer-Policy", value: "strict-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
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
  // Applied when served by a Node host (`next start`, Vercel, Railway, …). If
  // ever exported to a pure static CDN, replicate them at the CDN.
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
