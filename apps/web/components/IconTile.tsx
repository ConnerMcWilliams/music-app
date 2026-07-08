import type { ReactNode } from "react";
import styles from "./IconTile.module.css";

type IconTileProps = {
  children: ReactNode;
  size?: number;
  variant?: "ghost" | "gold";
  className?: string;
};

export function IconTile({ children, size = 44, variant = "ghost", className }: IconTileProps) {
  return (
    <span
      className={`${styles.tile} ${styles[variant]} ${className ?? ""}`}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.27) }}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}
