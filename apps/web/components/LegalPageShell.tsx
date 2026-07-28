import type { ReactNode } from "react";

import { Footer } from "@/components/Footer";
import styles from "./LegalPageShell.module.css";

type LegalPageShellProps = {
  children: ReactNode;
};

// Body chrome shared by the /privacy, /contact and /updates routes plus the
// error and not-found pages: the measured content column and the shared Footer
// for cross-navigation. The Nav is not here — the root layout renders it for
// every route, so adding it would duplicate the landmark.
export function LegalPageShell({ children }: LegalPageShellProps) {
  return (
    <>
      <main className={styles.main}>{children}</main>
      <Footer />
    </>
  );
}
