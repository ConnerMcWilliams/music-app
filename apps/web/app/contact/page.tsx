import type { Metadata } from "next";

import { ContactForm } from "@/components/ContactForm";
import { LegalPageShell } from "@/components/LegalPageShell";
import { SectionHeading } from "@/components/SectionHeading";
import styles from "./contact.module.css";

export const metadata: Metadata = {
  title: "Contact — Clarke Coach",
  description: "Get in touch with the Clarke Coach team about the beta, feedback, or anything else.",
};

export default function ContactPage() {
  return (
    <LegalPageShell>
      <div className={styles.wrap}>
        <SectionHeading
          kicker="Contact"
          title="Get in touch."
          sub="Questions about the beta, feedback, or anything else? Send us a note and we'll get back to you."
        />
        <div className={styles.formWrap}>
          <ContactForm />
        </div>
      </div>
    </LegalPageShell>
  );
}
