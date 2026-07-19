import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Hanken_Grotesk } from "next/font/google";
import "./globals.css";

import { AdminNav } from "@/components/AdminNav";

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
  title: "Clarke Coach Admin",
  description: "Internal dashboard: analytics, newsletter, and updates.",
  // Internal tool — keep it out of search indexes if it ever gets exposed.
  robots: { index: false, follow: false },
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
        <AdminNav />
        <main className="adminMain">{children}</main>
      </body>
    </html>
  );
}
