import type { Metadata } from "next";

import { CtaLink } from "@/components/CtaLink";
import { LegalPageShell } from "@/components/LegalPageShell";
import { PageMessage } from "@/components/PageMessage";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <LegalPageShell>
      <PageMessage
        kicker="404"
        title="We couldn't find that page"
        body="The page you're looking for may have moved, or the link might be out of date. Let's get you back on track."
      >
        <CtaLink href="/" variant="gold" size="lg">
          Back to home
        </CtaLink>
        <CtaLink href="/updates" variant="dark" size="lg">
          See the latest updates
        </CtaLink>
      </PageMessage>
    </LegalPageShell>
  );
}
