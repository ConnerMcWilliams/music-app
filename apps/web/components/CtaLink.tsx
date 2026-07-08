import type { ReactNode } from "react";
import styles from "./CtaLink.module.css";

type CtaLinkProps = {
  href: string;
  children: ReactNode;
  variant?: "gold" | "dark";
  size?: "md" | "lg";
};

export function CtaLink({ href, children, variant = "gold", size = "lg" }: CtaLinkProps) {
  return (
    <a href={href} className={`${styles.base} ${styles[variant]} ${styles[size]}`}>
      {children}
    </a>
  );
}
