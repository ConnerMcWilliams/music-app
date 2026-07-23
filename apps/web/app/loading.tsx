import styles from "./loading.module.css";

// Route-transition fallback shown while a segment streams in. The marketing
// pages are static, so this is brief — it just avoids a blank flash on
// navigation. Announced politely for assistive tech.
export default function Loading() {
  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      <span className={styles.label}>Loading…</span>
    </div>
  );
}
