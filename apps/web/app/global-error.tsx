"use client";

import { useEffect } from "react";

import "./globals.css";

// Last-resort boundary that replaces the root layout when it (or something it
// renders) throws. It must supply its own <html>/<body> and styling, so the
// button/link styles are inlined and reference the design tokens from
// globals.css — this page must render even if the normal layout is unavailable.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const buttonBase = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    height: 56,
    padding: "0 28px",
    borderRadius: 15,
    fontSize: 16,
    cursor: "pointer",
    textDecoration: "none",
  } as const;

  return (
    <html lang="en">
      <body>
        <title>Something went wrong · Clarke Coach</title>
        <main
          style={{
            maxWidth: 600,
            margin: "0 auto",
            padding: "16vh 24px",
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--gold-deep)",
              margin: "0 0 18px",
            }}
          >
            Something went wrong
          </p>
          <h1 style={{ fontSize: "clamp(32px, 6vw, 50px)", fontWeight: 600, margin: "0 0 18px" }}>
            The page couldn&apos;t load
          </h1>
          <p
            style={{
              fontSize: 16,
              lineHeight: 1.65,
              color: "var(--slate)",
              margin: "0 auto 32px",
              maxWidth: "46ch",
            }}
          >
            An unexpected error interrupted the app. Please try again in a moment.
          </p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => unstable_retry()}
              style={{
                ...buttonBase,
                border: 0,
                background: "var(--grad-gold)",
                color: "var(--navy-700)",
                fontWeight: 700,
              }}
            >
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full-page navigation is deliberate: a hard reload escapes the broken client state this boundary caught */}
            <a
              href="/"
              style={{
                ...buttonBase,
                background: "var(--grad-dark-button)",
                border: "1px solid var(--gold-line)",
                color: "var(--cream)",
                fontWeight: 600,
              }}
            >
              Back to home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
