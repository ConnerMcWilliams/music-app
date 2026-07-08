import { FlameIcon, PlayIcon } from "@/components/icons";
import styles from "./PhoneMockup.module.css";

/* Decorative recreation of the mobile app's Today screen, per the landing design. */
export function PhoneMockup() {
  return (
    <div className={styles.wrap} aria-hidden="true">
      <div className={styles.glow} />
      <div className={styles.bezel}>
        <div className={styles.screen}>
          <div className={styles.notch} />
          <div className={styles.screenBody}>
            <div className={styles.topRow}>
              <div>
                <div className={styles.date}>Tuesday, June 11</div>
                <div className={styles.greeting}>Good morning, Marcus</div>
              </div>
              <div className={styles.avatar}>MB</div>
            </div>
            <div className={styles.streakCard}>
              <div className={styles.streakRing}>
                <div className={styles.streakCount}>47</div>
              </div>
              <div className={styles.streakText}>
                <div className={styles.streakLabel}>Day streak</div>
                <div className={styles.streakSub}>Personal best · 52 days</div>
              </div>
              <span className={styles.flame}>
                <FlameIcon size={19} strokeWidth={1.6} />
              </span>
            </div>
            <div className={styles.studyCard}>
              <div className={styles.studyRule} />
              <div className={styles.studyMeta}>
                <span className={styles.studyKicker}>TODAY&apos;S STUDY</span>
                <span className={styles.studyTime}>≈ 8 min</span>
              </div>
              <div className={styles.studyTitle}>Clarke Study No. 2</div>
              <div className={styles.studySub}>First Studies · Legato slurs</div>
              <div className={styles.beginBtn}>
                <PlayIcon size={16} />
                <span className={styles.beginText}>Begin Practice</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
