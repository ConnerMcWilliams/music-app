import {
  FlameIcon,
  HomeIcon,
  MedalIcon,
  MicIcon,
  PlayIcon,
  SearchIcon,
  UserIcon,
} from "@/components/icons";
import styles from "./PhoneMockup.module.css";

/* The bottom tab bar mirrors the mobile app's (tabs)/_layout.tsx, Today active. */
const TABS = [
  { label: "Today", Icon: HomeIcon, active: true },
  { label: "Studies", Icon: SearchIcon, active: false },
  { label: "Practice", Icon: MicIcon, active: false },
  { label: "Results", Icon: MedalIcon, active: false },
  { label: "Profile", Icon: UserIcon, active: false },
];

/* Monday-first week strip, matching the Today screen's getWeekStrip states. */
const WEEK = [
  { day: "M", state: "done" },
  { day: "T", state: "done" },
  { day: "W", state: "done" },
  { day: "T", state: "done" },
  { day: "F", state: "current" },
  { day: "S", state: "todo" },
  { day: "S", state: "todo" },
] as const;

const dayClass = {
  done: styles.dayDone,
  current: styles.dayCurrent,
  todo: styles.dayTodo,
} as const;

/* Decorative recreation of the mobile app's Today screen, per the landing design. */
export function PhoneMockup() {
  return (
    <div className={styles.wrap} aria-hidden="true">
      <div className={styles.glow} />
      <div className={styles.bezel}>
        <div className={styles.screen}>
          <div className={styles.notch} />
          <div className={styles.screenBody}>
            <div className={styles.topRow}>
              <div>
                <div className={styles.date}>Friday, June 13</div>
                <div className={styles.greeting}>Good morning, Marcus</div>
              </div>
              <div className={styles.avatar}>MB</div>
            </div>

            <div className={styles.streakCard}>
              <div className={styles.streakRing}>
                <svg
                  className={styles.ringSvg}
                  viewBox="0 0 54 54"
                  width="54"
                  height="54"
                >
                  <defs>
                    <linearGradient id="streakRingGrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor="#e4c57e" />
                      <stop offset="1" stopColor="#c9a24a" />
                    </linearGradient>
                  </defs>
                  <circle
                    cx="27"
                    cy="27"
                    r="24"
                    fill="none"
                    stroke="rgba(255,255,255,.08)"
                    strokeWidth="6"
                  />
                  <circle
                    cx="27"
                    cy="27"
                    r="24"
                    fill="none"
                    stroke="url(#streakRingGrad)"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray="150.8"
                    strokeDashoffset="14.5"
                    transform="rotate(-90 27 27)"
                  />
                </svg>
                <div className={styles.streakCount}>47</div>
              </div>
              <div className={styles.streakText}>
                <div className={styles.streakLabel}>Day streak</div>
                <div className={styles.streakSub}>Personal best · 52 days</div>
              </div>
              <span className={styles.flame}>
                <FlameIcon size={19} strokeWidth={1.6} />
              </span>
            </div>

            <div className={styles.studyCard}>
              <div className={styles.studyRule} />
              <div className={styles.studyMeta}>
                <span className={styles.studyKicker}>TODAY&apos;S STUDY</span>
                <span className={styles.studyTime}>≈ 8 min</span>
              </div>
              <div className={styles.studyTitle}>Clarke Study No. 2</div>
              <div className={styles.studySub}>First Studies · Legato slurs</div>

              <div className={styles.studyDivider} />
              <div className={styles.statRow}>
                <div className={styles.stat}>
                  <div className={styles.statLabel}>KEY</div>
                  <div className={styles.statValue}>C</div>
                </div>
                <div className={styles.statDivider} />
                <div className={styles.stat}>
                  <div className={styles.statLabel}>TEMPO</div>
                  <div className={styles.statValue}>♩ = 96</div>
                </div>
                <div className={styles.statDivider} />
                <div className={styles.stat}>
                  <div className={styles.statLabel}>RANGE</div>
                  <div className={styles.statValue}>G3–C5</div>
                </div>
              </div>

              <div className={styles.beginBtn}>
                <PlayIcon size={16} />
                <span className={styles.beginText}>Begin Practice</span>
              </div>
            </div>

            <div>
              <div className={styles.weekLabel}>THIS WEEK</div>
              <div className={styles.weekRow}>
                {WEEK.map((d, i) => (
                  <div key={i} className={`${styles.dayPill} ${dayClass[d.state]}`}>
                    {d.day}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.tabBar}>
            {TABS.map(({ label, Icon, active }) => (
              <div
                key={label}
                className={active ? styles.tabItemActive : styles.tabItem}
              >
                <Icon size={19} strokeWidth={1.7} />
                <span className={styles.tabLabel}>{label}</span>
              </div>
            ))}
          </div>

          <div className={styles.homeIndicator} />
        </div>
      </div>
    </div>
  );
}
