import { IconTile } from "@/components/IconTile";
import { SectionHeading } from "@/components/SectionHeading";
import { MedalIcon, MicIcon, SearchIcon } from "@/components/icons";
import styles from "./HowItWorks.module.css";

const STEPS = [
  {
    icon: <SearchIcon size={26} strokeWidth={1.8} />,
    title: "Choose a Clarke Study",
    body: "Open today's assigned study or pick from the graded technical series — each with key, tempo, and range.",
  },
  {
    icon: <MicIcon size={26} strokeWidth={1.8} />,
    title: "Record your practice",
    body: "Play along with the metronome and record live, or upload audio you captured elsewhere.",
  },
  {
    icon: <MedalIcon size={26} strokeWidth={1.8} />,
    title: "Get feedback & track progress",
    body: "Receive a score breakdown and coaching notes, then watch your streak and trend line grow.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="band" aria-label="How it works">
      <div className={styles.inner}>
        <SectionHeading
          centered
          className={styles.heading}
          kicker="How it works"
          title="Three steps, every day."
        />
        <div className={styles.grid}>
          {STEPS.map((step, index) => (
            <article key={step.title} className={styles.step}>
              <div className={styles.stepNum}>{index + 1}</div>
              <IconTile size={52} variant="gold" className={styles.tile}>
                {step.icon}
              </IconTile>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepBody}>{step.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
