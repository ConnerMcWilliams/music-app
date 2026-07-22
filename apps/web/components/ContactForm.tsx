"use client";

import { useRef, useState, type FormEvent } from "react";

import { submitJson } from "@/lib/formSubmit";
import styles from "./ContactForm.module.css";

// Inlined at build time (static property access required), so production builds
// must set NEXT_PUBLIC_API_URL; unset, we target the local dev API. Reuses the
// same variable as the waitlist form.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const MESSAGES = {
  invalid: "Please check the form and try again.",
  failure: "We couldn't send your message right now. Please try again.",
};

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "submitted" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);
  const honeypotRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setErrorMessage("");

    // Trailing slash matters: Django redirects slash-less paths, dropping the POST.
    const result = await submitJson(
      `${API_URL}/api/contact/`,
      {
        name,
        email: email.trim(),
        message,
        // Honeypot — read from the DOM; the server drops filled submissions.
        company: honeypotRef.current?.value ?? "",
      },
      MESSAGES,
    );

    if (result.ok) {
      setStatus("submitted");
      return;
    }
    setStatus("error");
    setErrorMessage(result.message);
    emailRef.current?.focus();
  }

  if (status === "submitted") {
    return (
      <div className={styles.success} role="status">
        <p className={styles.successTitle}>Message sent.</p>
        <p className={styles.successBody}>
          Thanks for reaching out — we&apos;ll reply to <strong>{email}</strong> soon.
        </p>
      </div>
    );
  }

  const hasError = status === "error";

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.full}>
        <label className={styles.label} htmlFor="contact-name">
          Name
        </label>
        <input
          id="contact-name"
          className={styles.input}
          type="text"
          name="name"
          autoComplete="name"
          maxLength={120}
          placeholder="Your name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className={styles.full}>
        <label className={styles.label} htmlFor="contact-email">
          Email address
        </label>
        <input
          ref={emailRef}
          id="contact-email"
          className={styles.input}
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@email.com"
          required
          aria-invalid={hasError}
          aria-describedby={hasError ? "contact-error" : undefined}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className={styles.full}>
        <label className={styles.label} htmlFor="contact-message">
          Message
        </label>
        <textarea
          id="contact-message"
          className={styles.textarea}
          name="message"
          rows={6}
          maxLength={5000}
          placeholder="How can we help?"
          required
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
      </div>
      {/* Honeypot: hidden from humans, catnip for bots. Positioned off-screen
          (not display:none, which some bots skip) and out of the tab order. */}
      <div className={styles.honeypot} aria-hidden="true">
        <label htmlFor="contact-company">Company</label>
        <input
          ref={honeypotRef}
          id="contact-company"
          type="text"
          name="company"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      <div className={styles.actions}>
        <button className={styles.submit} type="submit" disabled={status === "submitting"}>
          {status === "submitting" ? "Sending…" : "Send Message"}
        </button>
        <span className={styles.note}>We usually reply within a couple of days.</span>
      </div>
      {hasError && (
        <p className={`${styles.full} ${styles.error}`} id="contact-error" role="alert">
          {errorMessage}
        </p>
      )}
    </form>
  );
}
