"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

import { hasSession } from "@/lib/api";

// localStorage never exists during prerender, so session presence is an
// external store: false on the server, re-read on every client render. The
// no-op subscribe is enough for a single-tab internal tool — navigation
// re-renders re-read the snapshot.
const subscribe = () => () => {};

export function useSession(): boolean {
  return useSyncExternalStore(subscribe, hasSession, () => false);
}

// Session guard for pages: renders false (callers return null) until the
// client knows a session exists, and bounces to /login when it doesn't.
export function useRequireSession(): boolean {
  const router = useRouter();
  const loggedIn = useSession();

  useEffect(() => {
    if (!loggedIn) router.replace("/login");
  }, [loggedIn, router]);

  return loggedIn;
}
