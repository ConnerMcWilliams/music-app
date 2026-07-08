import { CtaLink } from "@/components/CtaLink";
import { LogoMark } from "@/components/LogoMark";
import styles from "./Nav.module.css";

const NAV_LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#story", label: "Story" },
  { href: "#faq", label: "FAQ" },
];

export function Nav() {
  return (
    <header>
      <nav className={styles.nav} aria-label="Main">
        <a href="#top" className={styles.brand}>
          <LogoMark size={36} glow />
          <span className={styles.wordmark}>CLARKE&nbsp;COACH</span>
        </a>
        <div className={styles.links}>
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className={styles.link}>
              {link.label}
            </a>
          ))}
        </div>
        <CtaLink href="#waitlist" size="md">
          Join the Waitlist
        </CtaLink>
      </nav>
    </header>
  );
}
