// Centralized API client for the admin dashboard. Every request goes through
// here: one base URL, one token store, one refresh path.
//
// Inlined at build time (static property access required), so production
// builds must set NEXT_PUBLIC_API_URL in the BUILD environment.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Tokens live in localStorage. That trades XSS hardening for simplicity,
// which is acceptable for a single-owner internal tool that only the staff
// account can do anything with.
const ACCESS_KEY = "admin_access";
const REFRESH_KEY = "admin_refresh";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`API error ${status}`);
    this.status = status;
    this.body = body;
  }
}

export function hasSession(): boolean {
  return typeof window !== "undefined" && !!localStorage.getItem(ACCESS_KEY);
}

export function clearSession(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export async function login(email: string, password: string): Promise<void> {
  // Trailing slash matters on every path here: Django redirects slash-less
  // paths, dropping the POST body.
  const response = await fetch(`${API_URL}/api/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, body);
  }
  const { access, refresh } = body as { access: string; refresh: string };
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

async function tryRefresh(): Promise<boolean> {
  const refresh = localStorage.getItem(REFRESH_KEY);
  if (!refresh) return false;
  const response = await fetch(`${API_URL}/api/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  if (!response.ok) return false;
  const body = (await response.json()) as { access: string; refresh?: string };
  localStorage.setItem(ACCESS_KEY, body.access);
  // Rotation blacklists the old refresh token — always persist the new one.
  if (body.refresh) localStorage.setItem(REFRESH_KEY, body.refresh);
  return true;
}

// Authenticated fetch: attaches the bearer token; on a 401 tries one refresh
// and retries once. A failed refresh clears the session and sends the caller
// to /login — losing a composed newsletter to a silent 401 is the worst
// failure this app has, so the retry is worth its weight.
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const doFetch = () =>
    fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
        Authorization: `Bearer ${localStorage.getItem(ACCESS_KEY) ?? ""}`,
      },
    });

  let response = await doFetch();
  if (response.status === 401) {
    if (await tryRefresh()) {
      response = await doFetch();
    } else {
      clearSession();
      window.location.href = "/login";
      throw new ApiError(401, null);
    }
  }
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, body);
  }
  return body as T;
}

// --- Typed endpoint wrappers -------------------------------------------------

export interface BreakdownRow {
  value: string;
  count: number;
}

export interface Analytics {
  members: { total: number };
  waitlist: {
    total: number;
    subscribed: number;
    by_role: BreakdownRow[];
    by_instrument: BreakdownRow[];
    by_skill: BreakdownRow[];
    signups_by_day: { date: string; count: number }[];
  };
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface WaitlistEntry {
  email: string;
  instrument: string;
  skill: string;
  role: string;
  subscribed: boolean;
  created_at: string;
}

export interface Newsletter {
  id: number;
  subject: string;
  body: string;
  created_at: string;
  sent_at: string | null;
  recipient_count: number;
  failed_count: number;
}

export interface UpdatePost {
  id: number;
  title: string;
  body: string;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export const getAnalytics = () => apiFetch<Analytics>("/api/dashboard/analytics/");

export function getWaitlist(filters: {
  role?: string;
  instrument?: string;
  skill?: string;
  q?: string;
  subscribed?: string;
  page?: number;
}): Promise<Paginated<WaitlistEntry>> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const query = params.toString();
  return apiFetch(`/api/dashboard/waitlist/${query ? `?${query}` : ""}`);
}

export const getNewsletters = () =>
  apiFetch<Paginated<Newsletter>>("/api/dashboard/newsletters/");

export const sendNewsletter = (subject: string, body: string) =>
  apiFetch<Newsletter>("/api/dashboard/newsletters/", {
    method: "POST",
    body: JSON.stringify({ subject, body }),
  });

export const getUpdates = () =>
  apiFetch<Paginated<UpdatePost>>("/api/updates/manage/");

export const createUpdate = (post: {
  title: string;
  body: string;
  published: boolean;
}) =>
  apiFetch<UpdatePost>("/api/updates/manage/", {
    method: "POST",
    body: JSON.stringify(post),
  });

export const patchUpdate = (id: number, patch: Partial<UpdatePost>) =>
  apiFetch<UpdatePost>(`/api/updates/manage/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

export const deleteUpdate = (id: number) =>
  apiFetch<void>(`/api/updates/manage/${id}/`, { method: "DELETE" });
