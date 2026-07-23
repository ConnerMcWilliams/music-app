import Link from "next/link";
import type { ReactNode } from "react";

import { LogoMark } from "@/components/LogoMark";
import { InstagramIcon, LinkedInIcon } from "@/components/icons";
import styles from "./Footer.module.css";

const FOOTER_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/contact", label: "Contact" },
  { href: "/updates", label: "Updates" },
];

const SOCIAL_LINKS: { href: string; label: string; icon: ReactNode }[] = [
  {
    href: "https://www.linkedin.com/in/thomas-mcwilliams-035582315",
    label: "LinkedIn",
    icon: <LinkedInIcon size={18} />,
  },
  {
    href: "https://www.instagram.com/conner_mcwilliams",
    label: "Instagram",
    icon: <InstagramIcon size={19} />,
  },
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
          <div className={styles.social}>
            {SOCIAL_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={link.label}
                className={styles.socialLink}
              >
                {link.icon}
              </a>
            ))}
          </div>
        </div>
        <div className={styles.copy}>© 2026 Clarke Coach. All rights reserved.</div>
      </div>
    </footer>
  );
}
