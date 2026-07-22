"use client";

import { useRef, useState, type FormEvent } from "react";

import { getAttribution } from "@/lib/attribution";
import { submitJson } from "@/lib/formSubmit";
import styles from "./WaitlistForm.module.css";

const ROLES = ["Student", "Teacher", "Parent"] as const;
type Role = (typeof ROLES)[number];

// Inlined at build time (static property access required), so production
// builds must set NEXT_PUBLIC_API_URL; unset, we target the local dev API.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const MESSAGES = {
  invalid: "Enter a valid email address.",
  failure: "We couldn't complete your signup right now. Please try again.",
};

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [instrument, setInstrument] = useState("");
  const [skill, setSkill] = useState("");
  const [role, setRole] = useState<Role>("Student");
  const [status, setStatus] = useState<"idle" | "submitting" | "submitted" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);
  const honeypotRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setErrorMessage("");

    // Forward first-touch attribution so the backend can credit the signup to
    // the channel that brought this visitor in (utm tags / referrer).
    const { referrer, utm_source, utm_medium, utm_campaign } = getAttribution();
    // Trailing slash matters: Django redirects slash-less paths, dropping the POST.
    const result = await submitJson(
      `${API_URL}/api/waitlist/`,
      {
        email: email.trim(),
        instrument,
        skill,
        role,
        referrer,
        utm_source,
        utm_medium,
        utm_campaign,
        // Honeypot — read from the DOM so a bot that fills it outside React is
        // still caught. The server drops any submission with this set.
        company: honeypotRef.current?.value ?? "",
      },
      MESSAGES,
    );

    if (result.ok) {
      // Success is set only after the server confirms the signup was stored.
      setStatus("submitted");
      return;
    }
    setStatus("error");
    setErrorMessage(result.message);
    // Move focus to the email so keyboard and screen-reader users land on the
    // field to correct; the entered email is preserved for the retry.
    emailRef.current?.focus();
  }

  if (status === "submitted") {
    return (
      <div className={styles.success} role="status">
        <p className={styles.successTitle}>You&apos;re on the list.</p>
        <p className={styles.successBody}>
          Thanks — we&apos;ll email <strong>{email}</strong> when your spot opens.
        </p>
      </div>
    );
  }

  const hasError = status === "error";

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.full}>
        <label className={styles.label} htmlFor="waitlist-email">
          Email address
        </label>
        <input
          ref={emailRef}
          id="waitlist-email"
          className={styles.input}
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@email.com"
          required
          aria-invalid={hasError}
          aria-describedby={hasError ? "waitlist-error" : undefined}
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
          maxLength={120}
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
          maxLength={120}
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
      {/* Honeypot: hidden from humans, catnip for bots. Positioned off-screen
          (not display:none, which some bots skip) and out of the tab order. */}
      <div className={styles.honeypot} aria-hidden="true">
        <label htmlFor="waitlist-company">Company</label>
        <input
          ref={honeypotRef}
          id="waitlist-company"
          type="text"
          name="company"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      <div className={styles.actions}>
        <button className={styles.submit} type="submit" disabled={status === "submitting"}>
          {status === "submitting" ? "Joining…" : "Get Early Access"}
        </button>
        <span className={styles.note}>No spam. Just beta updates and practice resources.</span>
      </div>
      {hasError && (
        <p className={`${styles.full} ${styles.error}`} id="waitlist-error" role="alert">
          {errorMessage}
        </p>
      )}
    </form>
  );
}
