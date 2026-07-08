import { WaveformIcon } from "@/components/icons";
import styles from "./LogoMark.module.css";

type LogoMarkProps = {
  size?: number;
  glow?: boolean;
};

export function LogoMark({ size = 36, glow = false }: LogoMarkProps) {
  return (
    <span
      className={`${styles.mark} ${glow ? styles.glow : ""}`}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }}
      aria-hidden="true"
    >
      <WaveformIcon size={Math.round(size * 0.55)} strokeWidth={1.8} withDot />
    </span>
  );
}
