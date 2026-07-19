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
];

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
                    pathname === link.href ? styles.linkActive : styles.link
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
