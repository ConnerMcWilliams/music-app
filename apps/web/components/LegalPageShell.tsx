import type { ReactNode } from "react";

import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import styles from "./LegalPageShell.module.css";

type LegalPageShellProps = {
  children: ReactNode;
};

// Chrome shared by the /privacy, /contact and /updates routes plus the error and
// not-found pages. These carry the same Nav as the home page — its section links
// are root-relative, so they navigate home and land on the section rather than
// dead-ending here — plus the shared Footer for cross-navigation.
export function LegalPageShell({ children }: LegalPageShellProps) {
  return (
    <>
      <Nav />
      <main className={styles.main}>{children}</main>
      <Footer />
    </>
  );
}
