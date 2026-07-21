import { IconTile } from "@/components/IconTile";
import { Reveal } from "@/components/Reveal";
import { SectionHeading } from "@/components/SectionHeading";
import { ClockIcon, NotesIcon, TrendIcon } from "@/components/icons";
import styles from "./ProblemSection.module.css";

const PROBLEMS = [
  {
    icon: <ClockIcon size={24} />,
    title: "Practice is inconsistent",
    body: "Good intentions fade by Wednesday. Without a daily anchor, the routine slips away.",
  },
  {
    icon: <TrendIcon size={24} />,
    title: "Progress is hard to measure",
    body: "Am I actually improving? Without feedback and history, it's impossible to know.",
  },
  {
    icon: <NotesIcon size={24} />,
    title: "Fundamentals feel boring",
    body: "Repetition without structure or reward drains motivation before the payoff arrives.",
  },
];

export function ProblemSection() {
  return (
    <section className={styles.section} aria-label="The problem">
      <Reveal className="reveal">
        <SectionHeading
          centered
          className={styles.heading}
          kicker="The gap"
          title="Talent isn't the problem. Structure is."
          sub="Most players know fundamentals matter. Staying consistent and measuring real progress is the hard part."
        />
      </Reveal>
      <Reveal as="div" className={`${styles.grid} reveal-stagger`}>
        {PROBLEMS.map((problem) => (
          <article key={problem.title} className={`card ${styles.card}`}>
            <IconTile size={48} className={styles.tile}>
              {problem.icon}
            </IconTile>
            <h3 className={styles.cardTitle}>{problem.title}</h3>
            <p className={styles.cardBody}>{problem.body}</p>
          </article>
        ))}
      </Reveal>
    </section>
  );
}
