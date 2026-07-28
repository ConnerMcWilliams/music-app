import Link from "next/link";

import { CtaLink } from "@/components/CtaLink";
import { LogoMark } from "@/components/LogoMark";
import styles from "./Nav.module.css";

// The section ids these point at only exist on the home page, but this Nav now
// renders on every route, so the hrefs are root-relative rather than bare
// fragments: from `/` the browser treats them as same-document fragment
// navigation (native scroll, honours `scroll-padding-top`), and from `/privacy`
// or `/updates` they navigate home and land on the section. Plain <a> rather
// than <Link> precisely to keep that native same-document behaviour on home.
// The trailing "Updates" entry is a real route, so it renders as a <Link>.
const NAV_LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/#story", label: "Story" },
  { href: "/#faq", label: "FAQ" },
];

export function Nav() {
  return (
    <header className={styles.header}>
      <nav className={styles.nav} aria-label="Main">
        <Link href="/" className={styles.brand} aria-label="Clarke Coach home">
          <LogoMark size={36} glow />
          <span className={styles.wordmark}>CLARKE&nbsp;COACH</span>
        </Link>
        <div className={styles.links}>
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className={styles.link}>
              {link.label}
            </a>
          ))}
          <Link href="/updates" className={styles.link}>
            Updates
          </Link>
        </div>
        <CtaLink href="/#waitlist" size="md">
          Join the Waitlist
        </CtaLink>
      </nav>
    </header>
  );
}
