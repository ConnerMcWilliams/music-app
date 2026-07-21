// Canonical marketing-site identity, shared by the metadata, sitemap, robots,
// and structured-data code so the domain and copy live in exactly one place.
//
// The production origin is inlined at build time from NEXT_PUBLIC_SITE_URL; the
// default is the live domain, so a local build still produces valid absolute
// URLs. A trailing slash is stripped so `${SITE_URL}/path` never doubles up.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://clarkecoach.com"
).replace(/\/+$/, "");

export const SITE_NAME = "Clarke Coach";

export const SITE_TITLE =
  "Clarke Coach — Daily trumpet fundamentals, built around Clarke Studies";

export const SITE_TAGLINE = "Daily trumpet fundamentals, built around Clarke Studies";

export const SITE_DESCRIPTION =
  "Record your daily Clarke Study, get structured feedback, build a streak, and improve your trumpet fundamentals one session at a time. Join the waitlist for early beta access.";

// Informational search intent we want to be understood for. Modest and honest —
// keyword tags are a weak signal on their own; the FAQ content does the heavy
// lifting (see components/FaqSection.tsx).
export const SITE_KEYWORDS = [
  "trumpet practice app",
  "how to get better at trumpet",
  "Clarke Studies",
  "trumpet fundamentals",
  "daily trumpet practice",
  "trumpet warm-ups",
  "practice streak",
];

// Public profiles for the site owner / brand — used as Organization `sameAs`
// so search and AI engines can connect the site to its social presence.
export const SOCIAL_PROFILES = [
  "https://www.linkedin.com/in/thomas-mcwilliams-035582315",
  "https://www.instagram.com/conner_mcwilliams",
];
