// Shared client-side submission helper for the marketing-site forms (waitlist,
// contact). Both POST JSON straight to the Django API. This wraps `fetch` with
// an offline check and a request timeout, and maps every failure mode to a
// calm, user-facing message — never a raw status code, exception, or server
// body. Client-side checks here are usability only; the server stays the
// validation and rate-limit boundary.

const TIMEOUT_MS = 15_000;

export type SubmitResult = { ok: true } | { ok: false; message: string };

// Per-form copy so the message fits what the user was doing. `invalid` is the
// server 400 (validation) case; `failure` covers timeout / network / 5xx.
export type SubmitMessages = {
  invalid: string;
  failure: string;
};

const OFFLINE_MESSAGE =
  "You appear to be offline. Check your connection and try again.";
const RATE_LIMITED_MESSAGE =
  "Too many attempts. Please wait a moment and try again.";

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export async function submitJson(
  url: string,
  body: unknown,
  messages: SubmitMessages,
): Promise<SubmitResult> {
  if (isOffline()) {
    return { ok: false, message: OFFLINE_MESSAGE };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (response.ok) {
      return { ok: true };
    }
    if (response.status === 400) {
      return { ok: false, message: messages.invalid };
    }
    if (response.status === 429) {
      return { ok: false, message: RATE_LIMITED_MESSAGE };
    }
    // 5xx or any other unexpected status → generic, calm retry message. We do
    // not read or surface the response body.
    return { ok: false, message: messages.failure };
  } catch {
    // Network error, DNS/CORS failure, or the timeout abort. If we dropped
    // offline mid-flight, say so; otherwise treat it as transient.
    return {
      ok: false,
      message: isOffline() ? OFFLINE_MESSAGE : messages.failure,
    };
  } finally {
    clearTimeout(timeout);
  }
}
