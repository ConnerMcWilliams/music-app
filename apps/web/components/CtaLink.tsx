import type { ReactNode } from "react";
import styles from "./CtaLink.module.css";

type CtaVariant = "gold" | "dark";
type CtaSize = "md" | "lg";

function ctaClass(variant: CtaVariant, size: CtaSize): string {
  return `${styles.base} ${styles[variant]} ${styles[size]}`;
}

type CtaLinkProps = {
  href: string;
  children: ReactNode;
  variant?: CtaVariant;
  size?: CtaSize;
};

export function CtaLink({ href, children, variant = "gold", size = "lg" }: CtaLinkProps) {
  return (
    <a href={href} className={ctaClass(variant, size)}>
      {children}
    </a>
  );
}

type CtaButtonProps = {
  onClick: () => void;
  children: ReactNode;
  variant?: CtaVariant;
  size?: CtaSize;
};

// Same look as CtaLink but a real <button> — used for in-page actions like the
// "Try again" recovery on the error pages, which run a callback rather than
// navigating.
export function CtaButton({ onClick, children, variant = "gold", size = "lg" }: CtaButtonProps) {
  return (
    <button type="button" onClick={onClick} className={ctaClass(variant, size)}>
      {children}
    </button>
  );
}
