import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import { AnalyticsBeacon } from "@/components/AnalyticsBeacon";
import { JsonLd } from "@/components/JsonLd";
import { Nav } from "@/components/Nav";
import {
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
} from "@/lib/site";
import { organizationSchema, websiteSchema } from "@/lib/structured-data";

const serif = Cormorant_Garamond({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const sans = Hanken_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // metadataBase makes the file-convention OG/Twitter images and the canonical
  // URL resolve to absolute URLs, which crawlers and social scrapers require.
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
    // og:image is supplied automatically by app/opengraph-image.tsx.
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    // twitter:image is supplied automatically by app/twitter-image.tsx.
  },
};

export const viewport: Viewport = {
  themeColor: "#0f1e33",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body>
        <JsonLd data={organizationSchema} />
        <JsonLd data={websiteSchema} />
        <AnalyticsBeacon />
        {/* Outside `children`, so the bar stays mounted through the
            `loading.tsx` fallback and every route carries it. `global-error.tsx`
            is the sole exception — it replaces this layout by design. */}
        <Nav />
        {children}
      </body>
    </html>
  );
}
