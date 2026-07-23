"use client";

import Link from "next/link";
import { useEffect } from "react";

import { AdminMessage } from "@/components/AdminMessage";

// Route-level error boundary for the dashboard. Shows a calm recovery UI instead
// of a broken page, and never renders the raw error to the screen.
export default function Error({
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
    <AdminMessage
      kicker="Error"
      title="Something went wrong"
      body="An unexpected error interrupted this page. Try again, or head back to the dashboard."
    >
      <button type="button" className="btnPrimary" onClick={() => unstable_retry()}>
        Try again
      </button>
      <Link className="btnGhost" href="/">
        Back to dashboard
      </Link>
    </AdminMessage>
  );
}
