import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Hanken_Grotesk } from "next/font/google";
import "./globals.css";

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
  title: "Clarke Coach — Daily trumpet fundamentals, built around Clarke Studies",
  description:
    "Record your daily Clarke Study, get structured feedback, build a streak, and improve your trumpet fundamentals one session at a time. Join the waitlist for early beta access.",
  openGraph: {
    title: "Clarke Coach",
    description:
      "The daily trumpet fundamentals app built around Clarke Studies. Join the waitlist for early beta access.",
    type: "website",
    siteName: "Clarke Coach",
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
      <body>{children}</body>
    </html>
  );
}
