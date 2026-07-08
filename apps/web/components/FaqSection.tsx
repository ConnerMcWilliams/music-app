import { SectionHeading } from "@/components/SectionHeading";
import styles from "./FaqSection.module.css";

const FAQS = [
  {
    question: "Who is this for?",
    answer:
      "Serious students, high-school and college players, private teachers, band directors, and parents supporting a motivated musician.",
  },
  {
    question: "Is this only for trumpet players?",
    answer:
      "The beta is built around trumpet fundamentals and Clarke Studies. Other brass instruments are on the roadmap after launch.",
  },
  {
    question: "What will the app grade?",
    answer:
      "Your recordings are assessed on intonation, tone quality, rhythm, and tempo accuracy — with coaching notes on what to focus on next.",
  },
  {
    question: "When will beta access open?",
    answer:
      "We're onboarding waitlist members in small groups. Join now and we'll email you when your spot opens.",
  },
];

export function FaqSection() {
  return (
    <section id="faq" className={styles.section} aria-label="Frequently asked questions">
      <SectionHeading centered className={styles.heading} kicker="Questions" title="Good to know." />
      <div className={styles.list}>
        {FAQS.map((faq) => (
          <article key={faq.question} className={`card ${styles.item}`}>
            <h3 className={styles.question}>{faq.question}</h3>
            <p className={styles.answer}>{faq.answer}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
