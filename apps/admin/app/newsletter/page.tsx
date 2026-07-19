"use client";

import { useEffect, useState } from "react";

import {
  ApiError,
  Newsletter,
  getAnalytics,
  getNewsletters,
  sendNewsletter,
} from "@/lib/api";
import { useRequireSession } from "@/lib/useSession";
import styles from "./newsletter.module.css";

export default function NewsletterPage() {
  const ready = useRequireSession();
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null);
  const [history, setHistory] = useState<Newsletter[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Newsletter | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    getAnalytics()
      .then((analytics) => setSubscriberCount(analytics.waitlist.subscribed))
      .catch(() => setSubscriberCount(null));
    getNewsletters()
      .then((page) => setHistory(page.results))
      .catch(() => setHistory([]));
  }, [ready]);

  if (!ready) return null;

  const canCompose = subject.trim() !== "" && body.trim() !== "";

  async function handleSend() {
    setSending(true);
    setError(null);
    try {
      const sent = await sendNewsletter(subject, body);
      setResult(sent);
      setHistory((prev) => [sent, ...prev]);
      setSubject("");
      setBody("");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 403
          ? "This account has no admin access."
          : "Sending failed — the newsletter may not have gone out. Check the send history below and the backend logs before retrying."
      );
    } finally {
      setSending(false);
      setConfirming(false);
    }
  }

  return (
    <div className={styles.page}>
      <section className={`card ${styles.compose}`}>
        <span className="kicker">Newsletter</span>
        <h1 className={styles.title}>Compose</h1>
        <p className="muted">
          Plain text. An unsubscribe link is added to the bottom of every email
          automatically.
        </p>
        <input
          placeholder="Subject"
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            setConfirming(false);
          }}
        />
        <textarea
          placeholder="Write your update…"
          rows={12}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setConfirming(false);
          }}
        />
        {error && <p className="error">{error}</p>}
        {result && (
          <p className={styles.result}>
            Sent “{result.subject}” to {result.recipient_count} subscriber
            {result.recipient_count === 1 ? "" : "s"}
            {result.failed_count > 0 && (
              <span className="error"> · {result.failed_count} failed</span>
            )}
            .
          </p>
        )}
        {confirming ? (
          <div className={styles.confirmRow}>
            <span>
              Really send to{" "}
              {subscriberCount !== null
                ? `${subscriberCount} subscriber${subscriberCount === 1 ? "" : "s"}`
                : "all subscribers"}
              ? This cannot be undone.
            </span>
            <button
              type="button"
              className="btnPrimary"
              disabled={sending}
              onClick={handleSend}
            >
              {sending ? "Sending…" : "Send now"}
            </button>
            <button
              type="button"
              className="btnGhost"
              disabled={sending}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div>
            <button
              type="button"
              className="btnPrimary"
              disabled={!canCompose}
              onClick={() => {
                setResult(null);
                setConfirming(true);
              }}
            >
              Send to{" "}
              {subscriberCount !== null ? subscriberCount : "all"} subscriber
              {subscriberCount === 1 ? "" : "s"}
            </button>
          </div>
        )}
      </section>

      <section className={`card ${styles.history}`}>
        <h2 className={styles.historyTitle}>Send history</h2>
        {history.length === 0 ? (
          <p className="muted">Nothing sent yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Subject</th>
                <th>Sent</th>
                <th>Delivered</th>
                <th>Failed</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id}>
                  <td>{item.subject}</td>
                  <td>
                    {item.sent_at
                      ? new Date(item.sent_at).toLocaleString()
                      : "—"}
                  </td>
                  <td>{item.recipient_count}</td>
                  <td>{item.failed_count > 0 ? item.failed_count : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
