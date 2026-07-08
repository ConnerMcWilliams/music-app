import styles from "./SectionHeading.module.css";

type SectionHeadingProps = {
  kicker: string;
  title: string;
  sub?: string;
  centered?: boolean;
  className?: string;
};

export function SectionHeading({ kicker, title, sub, centered = false, className }: SectionHeadingProps) {
  return (
    <div className={`${centered ? styles.centered : ""} ${className ?? ""}`}>
      <div className={`kicker ${styles.kicker}`}>{kicker}</div>
      <h2 className={styles.title}>{title}</h2>
      {sub && <p className={styles.sub}>{sub}</p>}
    </div>
  );
}
