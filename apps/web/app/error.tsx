"use client";

import { useEffect } from "react";

import { CtaButton, CtaLink } from "@/components/CtaLink";
import { LegalPageShell } from "@/components/LegalPageShell";
import { PageMessage } from "@/components/PageMessage";

// Route-level error boundary. Renders inside the root layout, so the site chrome
// stays intact while the failed segment is replaced with a calm recovery UI.
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Surface the failure to the browser console (and any monitoring wired up
    // later). For server errors, `error.digest` matches the server-side log
    // entry; we never render the raw message to the user.
    console.error(error);
  }, [error]);

  return (
    <LegalPageShell>
      <PageMessage
        kicker="Something went wrong"
        title="That didn't go as planned"
        body="An unexpected error interrupted the page. You can try again, or head back home — nothing you entered was lost."
      >
        <CtaButton onClick={() => unstable_retry()} variant="gold" size="lg">
          Try again
        </CtaButton>
        <CtaLink href="/" variant="dark" size="lg">
          Back to home
        </CtaLink>
      </PageMessage>
    </LegalPageShell>
  );
}
