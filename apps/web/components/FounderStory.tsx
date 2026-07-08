import styles from "./FounderStory.module.css";

export function FounderStory() {
  return (
    <section id="story" className="band" aria-label="Founder story">
      <div className={styles.inner}>
        <div className={styles.paper}>
          <div className={styles.rule} />
          <div className={`kicker ${styles.kicker}`}>The story</div>
          <figure className={styles.grid}>
            <div className={styles.monogram}>CC</div>
            <div>
              <blockquote className={styles.quote}>
                &ldquo;I didn&apos;t get better because I practiced more. I got better when I
                practiced the fundamentals deliberately, every single day — and could finally see
                it working.&rdquo;
              </blockquote>
              <p className={styles.body}>
                Clarke Coach is built on a fundamentals-first approach: the same daily Clarke
                Studies discipline that turned scattered practice into steady, measurable
                improvement. The app packages that method — a study a day, honest feedback, and a
                visible record of progress — so any motivated player can build the habit that
                actually moves the needle.
              </p>
              <figcaption>
                <div className={styles.name}>Founder, Clarke Coach</div>
                <div className={styles.role}>Trumpet player · fundamentals advocate</div>
              </figcaption>
            </div>
          </figure>
        </div>
      </div>
    </section>
  );
}
