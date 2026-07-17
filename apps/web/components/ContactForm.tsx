"use client";

import { useState, type FormEvent } from "react";
import styles from "./ContactForm.module.css";

// Inlined at build time (static property access required), so production builds
// must set NEXT_PUBLIC_API_URL; unset, we target the local dev API. Reuses the
// same variable as the waitlist form.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "submitted" | "error">("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    try {
      // Trailing slash matters: Django redirects slash-less paths, dropping the POST.
      const response = await fetch(`${API_URL}/api/contact/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });
      if (!response.ok) {
        throw new Error(`Contact submission failed: ${response.status}`);
      }
      setStatus("submitted");
    } catch {
      setStatus("error");
    }
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
          id="contact-email"
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
      <div className={styles.actions}>
        <button className={styles.submit} type="submit" disabled={status === "submitting"}>
          {status === "submitting" ? "Sending…" : "Send Message"}
        </button>
        <span className={styles.note}>We usually reply within a couple of days.</span>
      </div>
      {status === "error" && (
        <p className={`${styles.full} ${styles.error}`} role="alert">
          Something went wrong — we couldn&apos;t send your message. Please try again.
        </p>
      )}
    </form>
  );
}
