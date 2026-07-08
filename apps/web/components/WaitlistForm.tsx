"use client";

import { useState, type FormEvent } from "react";
import styles from "./WaitlistForm.module.css";

const ROLES = ["Student", "Teacher", "Parent"] as const;
type Role = (typeof ROLES)[number];

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [instrument, setInstrument] = useState("");
  const [skill, setSkill] = useState("");
  const [role, setRole] = useState<Role>("Student");
  const [status, setStatus] = useState<"idle" | "submitting" | "submitted" | "error">("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    try {
      // TODO: replace this placeholder with a real waitlist submission (e.g.
      // POST /api/waitlist/ on the Django backend). Integration plan: docs/web.md.
      await new Promise((resolve) => setTimeout(resolve, 600));
      setStatus("submitted");
    } catch {
      setStatus("error");
    }
  }

  if (status === "submitted") {
    return (
      <div className={styles.success} role="status">
        <p className={styles.successTitle}>You&apos;re on the list.</p>
        <p className={styles.successBody}>
          Thanks — we&apos;ll email <strong>{email}</strong> when your spot opens.
          <br />
          (Demo form — submissions aren&apos;t stored yet.)
        </p>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.full}>
        <label className={styles.label} htmlFor="waitlist-email">
          Email address
        </label>
        <input
          id="waitlist-email"
          className={styles.input}
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@email.com"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div>
        <label className={styles.label} htmlFor="waitlist-instrument">
          Instrument
        </label>
        <input
          id="waitlist-instrument"
          className={styles.input}
          type="text"
          name="instrument"
          placeholder="Trumpet"
          value={instrument}
          onChange={(event) => setInstrument(event.target.value)}
        />
      </div>
      <div>
        <label className={styles.label} htmlFor="waitlist-skill">
          Skill level
        </label>
        <input
          id="waitlist-skill"
          className={styles.input}
          type="text"
          name="skill"
          placeholder="Intermediate"
          value={skill}
          onChange={(event) => setSkill(event.target.value)}
        />
      </div>
      <fieldset className={`${styles.full} ${styles.fieldset}`}>
        <legend className={styles.label}>I am a…</legend>
        <div className={styles.chips}>
          {ROLES.map((option) => (
            <button
              key={option}
              type="button"
              className={option === role ? `${styles.chip} ${styles.chipActive}` : styles.chip}
              aria-pressed={option === role}
              onClick={() => setRole(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </fieldset>
      <div className={styles.actions}>
        <button className={styles.submit} type="submit" disabled={status === "submitting"}>
          {status === "submitting" ? "Joining…" : "Get Early Access"}
        </button>
        <span className={styles.note}>No spam. Just beta updates and practice resources.</span>
      </div>
      {status === "error" && (
        <p className={`${styles.full} ${styles.error}`} role="alert">
          Something went wrong — we couldn&apos;t save your spot. Please try again.
        </p>
      )}
    </form>
  );
}
