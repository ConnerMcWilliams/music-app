import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

// Generated at build time into /robots.txt. Allow everything (there is nothing
// private on the marketing site) and point crawlers at the sitemap.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
