import styles from "./SectionHeading.module.css";

type SectionHeadingProps = {
  kicker: string;
  title: string;
  sub?: string;
  centered?: boolean;
  className?: string;
  // Standalone routes (e.g. /privacy, /contact) render their title as the page
  // h1; in-page sections keep the default h2. Styling is identical either way.
  titleAs?: "h1" | "h2";
};

export function SectionHeading({
  kicker,
  title,
  sub,
  centered = false,
  className,
  titleAs: TitleTag = "h2",
}: SectionHeadingProps) {
  return (
    <div className={`${centered ? styles.centered : ""} ${className ?? ""}`}>
      <div className={`kicker ${styles.kicker}`}>{kicker}</div>
      <TitleTag className={styles.title}>{title}</TitleTag>
      {sub && <p className={styles.sub}>{sub}</p>}
    </div>
  );
}
