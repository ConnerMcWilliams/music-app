"use client";

import { useCallback, useEffect, useState } from "react";

import { StatCard } from "@/components/StatCard";
import {
  Analytics,
  ApiError,
  BreakdownRow,
  Paginated,
  WaitlistEntry,
  getAnalytics,
  getWaitlist,
} from "@/lib/api";
import { useRequireSession } from "@/lib/useSession";
import styles from "./dashboard.module.css";

const CHART_DAYS = 30;

function labelOf(value: string): string {
  return value === "" ? "(blank)" : value;
}

function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function Breakdown({ title, rows }: { title: string; rows: BreakdownRow[] }) {
  return (
    <div className={`card ${styles.breakdown}`}>
      <h3 className={styles.breakdownTitle}>{title}</h3>
      {rows.length === 0 ? (
        <p className="muted">No signups yet.</p>
      ) : (
        <table>
          <tbody>
            {rows.map((row) => (
              <tr key={row.value}>
                <td>{labelOf(row.value)}</td>
                <td className={styles.countCell}>{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SignupsChart({ series }: { series: { date: string; count: number }[] }) {
  // The API omits zero-signup days; rebuild a continuous day axis so gaps
  // read as quiet days instead of silently vanishing.
  const byDate = new Map(series.map((row) => [row.date, row.count]));
  const days: { date: string; count: number }[] = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - (CHART_DAYS - 1));
  for (let i = 0; i < CHART_DAYS; i++) {
    const iso = cursor.toISOString().slice(0, 10);
    days.push({ date: iso, count: byDate.get(iso) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <div className={`card ${styles.chartCard}`}>
      <h3 className={styles.breakdownTitle}>
        Waitlist signups — last {CHART_DAYS} days
      </h3>
      <div className={styles.chart} role="img" aria-label="Signups per day">
        {days.map((day) => (
          <div
            key={day.date}
            className={styles.barSlot}
            title={`${formatDay(day.date)} · ${day.count} signup${day.count === 1 ? "" : "s"}`}
          >
            <div
              className={styles.bar}
              style={{ height: `${(day.count / max) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <div className={styles.chartAxis}>
        <span>{formatDay(days[0].date)}</span>
        <span>peak {max}/day</span>
        <span>{formatDay(days[days.length - 1].date)}</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const ready = useRequireSession();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Waitlist browser: draft filters edit freely; only Apply triggers a fetch.
  const [draft, setDraft] = useState({
    role: "",
    instrument: "",
    skill: "",
    q: "",
    subscribed: "",
  });
  const [applied, setApplied] = useState(draft);
  const [page, setPage] = useState(1);
  const [entries, setEntries] = useState<Paginated<WaitlistEntry> | null>(null);

  const handleError = useCallback((err: unknown) => {
    if (err instanceof ApiError && err.status === 403) {
      setFatal("This account has no admin access.");
    } else {
      setError("Could not load data. Is the backend running?");
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    getAnalytics()
      .then((data) => {
        setAnalytics(data);
        setError(null);
      })
      .catch(handleError);
  }, [ready, handleError]);

  useEffect(() => {
    if (!ready) return;
    getWaitlist({ ...applied, page })
      .then((data) => {
        setEntries(data);
        setError(null);
      })
      .catch(handleError);
  }, [ready, applied, page, handleError]);

  if (!ready) return null;
  if (fatal) return <p className="error">{fatal}</p>;

  const totalPages = entries ? Math.max(1, Math.ceil(entries.count / 50)) : 1;

  return (
    <div className={styles.page}>
      <div className={styles.statRow}>
        <StatCard
          label="Registered members"
          value={analytics ? analytics.members.total : "…"}
        />
        <StatCard
          label="Waitlist signups"
          value={analytics ? analytics.waitlist.total : "…"}
        />
        <StatCard
          label="Subscribed"
          value={analytics ? analytics.waitlist.subscribed : "…"}
          note="newsletter recipients"
        />
        <StatCard label="Premium members" value="—" note="coming soon" />
        <StatCard label="Ad revenue" value="—" note="coming soon" />
      </div>

      {analytics && <SignupsChart series={analytics.waitlist.signups_by_day} />}

      {analytics && (
        <div className={styles.breakdownRow}>
          <Breakdown title="By role" rows={analytics.waitlist.by_role} />
          <Breakdown
            title="By instrument"
            rows={analytics.waitlist.by_instrument}
          />
          <Breakdown title="By skill" rows={analytics.waitlist.by_skill} />
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <section className={`card ${styles.browser}`}>
        <h3 className={styles.breakdownTitle}>Waitlist browser</h3>
        <form
          className={styles.filters}
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setApplied(draft);
          }}
        >
          <input
            placeholder="Email contains…"
            value={draft.q}
            onChange={(e) => setDraft({ ...draft, q: e.target.value })}
          />
          <input
            placeholder="Role (e.g. teacher)"
            value={draft.role}
            onChange={(e) => setDraft({ ...draft, role: e.target.value })}
          />
          <input
            placeholder="Instrument"
            value={draft.instrument}
            onChange={(e) => setDraft({ ...draft, instrument: e.target.value })}
          />
          <input
            placeholder="Skill"
            value={draft.skill}
            onChange={(e) => setDraft({ ...draft, skill: e.target.value })}
          />
          <select
            value={draft.subscribed}
            onChange={(e) => setDraft({ ...draft, subscribed: e.target.value })}
          >
            <option value="">Subscribed + not</option>
            <option value="true">Subscribed</option>
            <option value="false">Unsubscribed</option>
          </select>
          <button type="submit" className="btnGhost">
            Apply
          </button>
        </form>

        {entries && (
          <>
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Instrument</th>
                  <th>Skill</th>
                  <th>Role</th>
                  <th>Subscribed</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {entries.results.map((entry) => (
                  <tr key={entry.email}>
                    <td>{entry.email}</td>
                    <td>{labelOf(entry.instrument)}</td>
                    <td>{labelOf(entry.skill)}</td>
                    <td>{labelOf(entry.role)}</td>
                    <td>{entry.subscribed ? "yes" : "no"}</td>
                    <td>{new Date(entry.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {entries.results.length === 0 && (
              <p className="muted">No signups match these filters.</p>
            )}
            <div className={styles.pager}>
              <button
                type="button"
                className="btnGhost"
                disabled={!entries.previous}
                onClick={() => setPage(page - 1)}
              >
                ← Prev
              </button>
              <span className="muted">
                {entries.count} signup{entries.count === 1 ? "" : "s"} · page{" "}
                {page} of {totalPages}
              </span>
              <button
                type="button"
                className="btnGhost"
                disabled={!entries.next}
                onClick={() => setPage(page + 1)}
              >
                Next →
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
