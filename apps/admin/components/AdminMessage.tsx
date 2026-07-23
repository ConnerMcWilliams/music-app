import type { ReactNode } from "react";

import styles from "./AdminMessage.module.css";

type AdminMessageProps = {
  kicker: string;
  title: string;
  body: string;
  // Recovery action(s): styled links/buttons in a centered row.
  children?: ReactNode;
};

// Centered panel shared by the dashboard's not-found and error pages, matching
// the admin design tokens. Self-contained so it renders in both server
// (not-found) and client ("use client" error boundary) trees.
export function AdminMessage({ kicker, title, body, children }: AdminMessageProps) {
  return (
    <div className={styles.wrap}>
      <p className={`kicker ${styles.kicker}`}>{kicker}</p>
      <h1 className={styles.title}>{title}</h1>
      <p className="muted">{body}</p>
      {children && <div className={styles.actions}>{children}</div>}
    </div>
  );
}
