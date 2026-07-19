import { CtaLink } from "@/components/CtaLink";
import { PhoneMockup } from "@/components/PhoneMockup";
import { PlayIcon } from "@/components/icons";
import styles from "./Hero.module.css";

export function Hero() {
  return (
    <section id="top" className={styles.hero} aria-label="Introduction">
      <div className={styles.grid}>
        <div>
          <div className={styles.badge}>
            <span className={styles.badgeDot} />
            <span className={styles.badgeText}>Private beta · Joining now</span>
          </div>
          <h1 className={styles.title}>
            The daily trumpet fundamentals app built around{" "}
            <span className={styles.titleAccent}>Clarke Studies.</span>
          </h1>
          <p className={styles.sub}>
            Record your daily study, get instant feedback on tone, rhythm, and intonation, and build
            a streak — improving your fundamentals one session at a time.
          </p>
          <div className={styles.ctaRow}>
            <CtaLink href="#waitlist">Join the Waitlist</CtaLink>
            <CtaLink href="#how" variant="dark">
              <PlayIcon size={18} className={styles.playIcon} />
              See How It Works
            </CtaLink>
          </div>
          <div className={styles.meta}>
            <span>Daily Clarke Studies</span>
            <span className={styles.metaDot}>·</span>
            <span>Automated feedback</span>
            <span className={styles.metaDot}>·</span>
            <span>Streak tracking</span>
          </div>
        </div>
        <div className={styles.phone}>
          <PhoneMockup />
        </div>
      </div>
    </section>
  );
}
