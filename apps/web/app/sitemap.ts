import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

// Generated at build time into /sitemap.xml. The landing page is the priority;
// the legal/contact/updates pages are listed so they get discovered too.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/updates`, lastModified, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/contact`, lastModified, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE_URL}/privacy`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
