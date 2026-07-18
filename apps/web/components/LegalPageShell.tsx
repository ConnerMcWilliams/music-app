import Link from "next/link";
import type { ReactNode } from "react";

import { Footer } from "@/components/Footer";
import { LogoMark } from "@/components/LogoMark";
import styles from "./LegalPageShell.module.css";

type LegalPageShellProps = {
  children: ReactNode;
};

// Chrome shared by the /privacy and /contact routes. The home-page Nav links to
// on-page hash anchors (#faq, #how, …) that don't resolve off the home page, so
// these secondary pages get a minimal header whose only nav is the logo back to
// home, plus the shared Footer for cross-navigation.
export function LegalPageShell({ children }: LegalPageShellProps) {
  return (
    <>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="Clarke Coach home">
          <LogoMark size={36} glow />
          <span className={styles.wordmark}>CLARKE&nbsp;COACH</span>
        </Link>
      </header>
      <main className={styles.main}>{children}</main>
      <Footer />
    </>
  );
}
