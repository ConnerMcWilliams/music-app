"use client";

import { useEffect } from "react";

import "./globals.css";

// Last-resort boundary that replaces the root layout when it throws. Supplies
// its own <html>/<body> and inline styles (referencing globals.css tokens) so it
// renders even when the normal layout is unavailable.
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

  return (
    <html lang="en">
      <body>
        <title>Something went wrong · Clarke Coach Admin</title>
        <main
          style={{
            maxWidth: 520,
            margin: "48px auto",
            padding: "36px 28px",
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
              margin: "0 0 12px",
            }}
          >
            Error
          </p>
          <h1 style={{ fontSize: 30, fontWeight: 600, margin: "0 0 12px" }}>
            Something went wrong
          </h1>
          <p style={{ color: "var(--slate-dim)", fontSize: 13, margin: "0 0 22px" }}>
            An unexpected error interrupted the dashboard. Please try again.
          </p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              background: "var(--grad-gold)",
              color: "var(--navy-900)",
              fontWeight: 700,
              fontSize: 14,
              border: 0,
              borderRadius: 8,
              padding: "10px 18px",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
