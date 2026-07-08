import { FlameIcon } from "@/components/icons";
import styles from "./CredibilityStrip.module.css";

export function CredibilityStrip() {
  return (
    <section className={styles.strip} aria-label="Credibility">
      <div className={styles.inner}>
        <span className={styles.icon}>
          <FlameIcon size={30} strokeWidth={1.5} />
        </span>
        <p className={styles.quote}>
          Built by a trumpet player who used fundamentals-focused practice to reach top-level
          results.
        </p>
      </div>
    </section>
  );
}
