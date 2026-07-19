import Link from "next/link";

import { LogoMark } from "@/components/LogoMark";
import styles from "./Footer.module.css";

const FOOTER_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/contact", label: "Contact" },
  { href: "/updates", label: "Updates" },
];

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <LogoMark size={34} />
          <span className={styles.wordmark}>CLARKE&nbsp;COACH</span>
        </div>
        <div className={styles.links}>
          {FOOTER_LINKS.map((link) => (
            <Link key={link.label} href={link.href} className={styles.link}>
              {link.label}
            </Link>
          ))}
        </div>
        <div className={styles.copy}>© 2026 Clarke Coach. All rights reserved.</div>
      </div>
    </footer>
  );
}
