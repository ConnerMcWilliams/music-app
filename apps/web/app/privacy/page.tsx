import type { Metadata } from "next";
import Link from "next/link";

import { LegalPageShell } from "@/components/LegalPageShell";
import { SectionHeading } from "@/components/SectionHeading";
import styles from "./privacy.module.css";

export const metadata: Metadata = {
  title: "Privacy — Clarke Coach",
  description:
    "How Clarke Coach collects, uses, and protects the information you share through the waitlist and contact form.",
};

const EFFECTIVE_DATE = "July 16, 2026";

export default function PrivacyPage() {
  return (
    <LegalPageShell>
      <article className={styles.doc}>
        <SectionHeading kicker="Legal" title="Privacy Policy" titleAs="h1" />
        <p className={styles.effective}>Effective {EFFECTIVE_DATE}</p>

        <section className={styles.section}>
          <h2 className={styles.h}>Overview</h2>
          <p className={styles.p}>
            Clarke Coach is a pre-launch trumpet-practice app. This policy explains what we collect
            through this marketing site, how we use it, and the choices you have. We only collect
            what we need to run the waitlist and respond to you.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h}>Information we collect</h2>
          <ul className={styles.list}>
            <li>
              <strong>Waitlist signups.</strong> Your email address, plus any optional context you
              choose to share (instrument, skill level, and whether you are a student, teacher, or
              parent).
            </li>
            <li>
              <strong>Contact messages.</strong> Your name, email address, and the message you send
              us.
            </li>
            <li>
              <strong>Basic technical data.</strong> We use limited request information, such as your
              IP address, only to rate-limit our forms and prevent spam and abuse.
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h}>How we use your information</h2>
          <ul className={styles.list}>
            <li>To email you about beta access and product updates you signed up for.</li>
            <li>To respond to questions and feedback you send through the contact form.</li>
            <li>To protect our forms from spam and abuse.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h}>We do not sell your data</h2>
          <p className={styles.p}>
            We do not sell or rent your personal information, and we do not share it for advertising.
            We share data only with the service providers that help us operate the site — for
            example, our hosting and email-delivery providers — and only so they can perform those
            services for us.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h}>Data retention</h2>
          <p className={styles.p}>
            We keep waitlist signups until the beta launches or you ask us to remove you, and we keep
            contact messages for as long as we need them to respond and keep a record of the
            conversation. You can ask us to delete your information at any time.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h}>Your choices</h2>
          <p className={styles.p}>
            You can ask us to access or delete the information we hold about you, or to remove you
            from the waitlist, by reaching out through our{" "}
            <Link className={styles.link} href="/contact">
              contact page
            </Link>
            . Every email we send will also include a way to unsubscribe.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h}>Changes to this policy</h2>
          <p className={styles.p}>
            We may update this policy as the product evolves. When we do, we will revise the
            effective date above.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h}>Contact</h2>
          <p className={styles.p}>
            Questions about this policy? Get in touch through our{" "}
            <Link className={styles.link} href="/contact">
              contact page
            </Link>
            .
          </p>
        </section>
      </article>
    </LegalPageShell>
  );
}
