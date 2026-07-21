import { SectionHeading } from "@/components/SectionHeading";
import { JsonLd } from "@/components/JsonLd";
import { faqPageSchema } from "@/lib/structured-data";
import styles from "./FaqSection.module.css";

// These double as on-page FAQ content and as FAQPage structured data (below).
// The first several answer real search-intent questions ("how do I get better
// at trumpet", "what are the Clarke Studies") so search and AI answer engines
// have concise, citable answers that tie back to the product.
const FAQS = [
  {
    question: "How do I get better at trumpet?",
    answer:
      "Consistent daily work on fundamentals — air, tone, flexibility, and clean articulation — improves you faster than occasional long sessions. A structured routine like the Clarke Studies, practiced a little every day with honest feedback, is what builds real control. Clarke Coach is designed to make exactly that a daily habit.",
  },
  {
    question: "What are the Clarke Studies?",
    answer:
      "The Clarke Studies are Herbert L. Clarke's Technical Studies for the Cornet (1912), a foundational set of finger, breath, and flexibility exercises that brass players have used for over a century to build evenness, range, and endurance. Clarke Coach turns them into a guided daily practice you can actually keep up with.",
  },
  {
    question: "How much should I practice trumpet each day?",
    answer:
      "Consistency matters more than length. Even 15–20 focused minutes of fundamentals every day builds more than an occasional two-hour session. The app is built around a short daily study so the habit stays realistic on busy days.",
  },
  {
    question: "How do I build a consistent practice habit?",
    answer:
      "Make it small, daily, and measurable: one set study each day, a quick record of what you played, and a streak worth protecting. That loop is exactly what Clarke Coach is built around — a clear thing to practice, feedback on how it went, and progress you can see.",
  },
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
      <JsonLd data={faqPageSchema(FAQS)} />
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
