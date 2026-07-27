"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { clearSession } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import styles from "./AdminNav.module.css";

const NAV_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/newsletter", label: "Newsletter" },
  { href: "/updates", label: "Updates" },
  { href: "/config", label: "Config" },
];

// Config has nested routes (the variant editor), so the tab has to stay lit on
// those too. Dashboard is excluded from the prefix rule — "/" prefixes
// everything, which would light it up on every page.
function isActive(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const loggedIn = useSession();

  return (
    <header className={styles.nav}>
      <div className={styles.inner}>
        <span className={styles.wordmark}>
          CLARKE&nbsp;COACH <span className={styles.adminTag}>ADMIN</span>
        </span>
        {loggedIn && (
          <>
            <nav className={styles.links}>
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={
                    isActive(link.href, pathname) ? styles.linkActive : styles.link
                  }
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <button
              type="button"
              className={styles.logout}
              onClick={() => {
                clearSession();
                router.replace("/login");
              }}
            >
              Log out
            </button>
          </>
        )}
      </div>
    </header>
  );
}
