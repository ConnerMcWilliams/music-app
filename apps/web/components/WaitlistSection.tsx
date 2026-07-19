import { WaitlistForm } from "@/components/WaitlistForm";
import styles from "./WaitlistSection.module.css";

export function WaitlistSection() {
  return (
    <section id="waitlist" className={styles.section} aria-label="Join the waitlist">
      <div className={styles.panel}>
        <div className={styles.glow} />
        <div className={styles.headingWrap}>
          <div className={`kicker ${styles.kicker}`}>Early access</div>
          <h2 className={styles.title}>Get early access to Clarke Coach.</h2>
          <p className={styles.sub}>
            Join the waitlist for free early access and be among the first players to build a
            fundamentals habit that sticks. No spam — just a note when your spot opens.
          </p>
        </div>
        <WaitlistForm />
      </div>
    </section>
  );
}
