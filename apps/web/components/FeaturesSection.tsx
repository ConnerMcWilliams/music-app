import { IconTile } from "@/components/IconTile";
import { Reveal } from "@/components/Reveal";
import {
  BoltIcon,
  CalendarIcon,
  FlameIcon,
  PeopleIcon,
  UploadIcon,
  WaveformIcon,
} from "@/components/icons";
import styles from "./FeaturesSection.module.css";

const FEATURES = [
  {
    icon: <CalendarIcon size={22} />,
    title: "Daily Clarke Study challenges",
    body: "A fresh, structured study every day to anchor your routine.",
  },
  {
    icon: <UploadIcon size={22} />,
    title: "Recording & uploads",
    body: "Capture live with a metronome or upload audio from any session.",
  },
  {
    icon: <WaveformIcon size={22} />,
    title: "Pitch, rhythm & tempo feedback",
    body: "A clear score breakdown across the fundamentals that matter.",
  },
  {
    icon: <FlameIcon size={22} />,
    title: "Streaks & progress tracking",
    body: "Build a streak and watch your score trend climb over weeks.",
  },
  {
    icon: <PeopleIcon size={22} />,
    title: "Teacher-friendly accountability",
    body: "Shareable progress so teachers and directors can follow along.",
  },
  {
    icon: <BoltIcon size={22} strokeWidth={1.8} />,
    title: "Early beta access",
    body: "Join now to shape the app and lock in founding-member perks.",
    highlight: true,
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className={styles.section} aria-label="Features">
      <div className={styles.grid}>
        <div className={styles.intro}>
          <div className={`kicker ${styles.kicker}`}>What&apos;s inside</div>
          <h2 className={styles.introTitle}>Everything a serious practice habit needs.</h2>
          <p className={styles.introBody}>
            The discipline of a conservatory studio, distilled into a daily ritual you&apos;ll
            actually keep.
          </p>
        </div>
        <Reveal as="div" className={`${styles.cards} reveal-stagger`}>
          {FEATURES.map((feature) => (
            <article
              key={feature.title}
              className={
                feature.highlight
                  ? `${styles.card} ${styles.highlight}`
                  : `card ${styles.card}`
              }
            >
              <IconTile
                size={44}
                variant={feature.highlight ? "gold" : "ghost"}
                className={styles.tile}
              >
                {feature.icon}
              </IconTile>
              <h3 className={styles.cardTitle}>{feature.title}</h3>
              <p className={styles.cardBody}>{feature.body}</p>
            </article>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
