import styles from "./FounderStory.module.css";

export function FounderStory() {
  return (
    <section id="story" className="band" aria-label="Founder story">
      <div className={styles.inner}>
        <div className={styles.paper}>
          <div className={styles.rule} />
          <div className={`kicker ${styles.kicker}`}>The story</div>
          <figure className={styles.grid}>
            <div className={styles.monogram}>CM</div>
            <div>
              <blockquote className={styles.quote}>
                &ldquo;I didn&apos;t get better because I practiced more. Everything changed when I
                put the fundamentals first — one Clarke Study, every single day. That
                discipline is what earned me first chair in All-State, and it&apos;s the habit I
                want to make easy for everyone else.&rdquo;
              </blockquote>
              <p className={styles.body}>
                Clarke Coach is built on a fundamentals-first approach: the same daily Clarke
                Studies discipline that turned scattered practice into steady, measurable
                improvement. The app packages that method — a study a day, honest feedback, and a
                visible record of progress — so any motivated player can build the habit that
                actually moves the needle.
              </p>
              <figcaption>
                <div className={styles.name}>Conner McWilliams</div>
                <div className={styles.role}>
                  Founder, Clarke Coach · First-chair All-State trumpet
                </div>
              </figcaption>
            </div>
          </figure>
        </div>
      </div>
    </section>
  );
}
