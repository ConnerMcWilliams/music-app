import { ImageResponse } from "next/og";

import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

// Static social share card, rendered at build time (no request data), so it is
// generated once and served from the CDN. Root-level, so every route inherits
// it unless a deeper opengraph-image overrides it.
export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand palette (mirrors app/globals.css). Kept inline because ImageResponse
// runs through Satori, which does not read our CSS variables.
const NAVY = "#0f1e33";
const NAVY_DEEP = "#05080e";
const GOLD = "#e4c57e";
const CREAM = "#f4ebd7";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY_DEEP} 100%)`,
          color: CREAM,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            letterSpacing: "8px",
            fontSize: 30,
            fontWeight: 700,
            color: GOLD,
          }}
        >
          CLARKE COACH
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ display: "flex", fontSize: 68, fontWeight: 700, lineHeight: 1.1 }}>
            Daily trumpet fundamentals, built around Clarke Studies.
          </div>
          <div style={{ display: "flex", fontSize: 32, color: "rgba(244,235,215,0.75)" }}>
            Record · get feedback · build a streak — join the private beta.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            padding: "16px 32px",
            borderRadius: "999px",
            background: GOLD,
            color: NAVY,
            fontSize: 28,
            fontWeight: 700,
          }}
        >
          Join the waitlist →
        </div>
      </div>
    ),
    { ...size },
  );
}
