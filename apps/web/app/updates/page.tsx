import type { Metadata } from "next";

import { LegalPageShell } from "@/components/LegalPageShell";
import { SectionHeading } from "@/components/SectionHeading";
import { UpdatesList } from "@/components/UpdatesList";
import styles from "./updates.module.css";

export const metadata: Metadata = {
  title: "Updates — Clarke Coach",
  description: "News and progress updates from Clarke Coach.",
};

export default function UpdatesPage() {
  return (
    <LegalPageShell>
      <div className={styles.wrap}>
        <SectionHeading
          kicker="Updates"
          title="What we're building."
          titleAs="h1"
          sub="Progress notes and announcements as Clarke Coach heads toward beta."
        />
        <div className={styles.listWrap}>
          <UpdatesList />
        </div>
      </div>
    </LegalPageShell>
  );
}
