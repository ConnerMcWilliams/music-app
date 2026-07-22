import type { ReactNode } from "react";

import styles from "./PageMessage.module.css";

type PageMessageProps = {
  kicker: string;
  title: string;
  body: string;
  // Recovery action(s): CtaLink / CtaButton, laid out in a centered row.
  children?: ReactNode;
};

// Centered message layout shared by the site's not-found and error pages. Keeps
// them consistent with the marketing pages (serif title, gold kicker, design
// tokens) while staying self-contained, so it renders in both server
// (not-found) and client ("use client" error boundary) trees.
export function PageMessage({ kicker, title, body, children }: PageMessageProps) {
  return (
    <div className={styles.wrap}>
      <div className={`kicker ${styles.kicker}`}>{kicker}</div>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.body}>{body}</p>
      {children && <div className={styles.actions}>{children}</div>}
    </div>
  );
}
