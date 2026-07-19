// Client-side, first-party attribution shared by the analytics beacon and the
// waitlist form. No tracking cookies: an anonymous visitor id lives in
// localStorage (so repeat visits dedupe to one visitor), and first-touch UTM
// tags are captured once into sessionStorage so a signup later in the visit is
// still credited to the campaign that brought the person in. Every access is
// guarded so it is safe to import from code that may run during SSR.

const VISITOR_KEY = "cc_visitor_id";
const UTM_KEY = "cc_utm";

const UTM_PARAMS = ["utm_source", "utm_medium", "utm_campaign"] as const;
type UtmParams = Record<(typeof UTM_PARAMS)[number], string>;

export interface Attribution extends UtmParams {
  visitor_id: string;
  referrer: string;
}

const EMPTY_UTM: UtmParams = { utm_source: "", utm_medium: "", utm_campaign: "" };

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `v-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// A stable anonymous id, created on the first visit and reused thereafter.
export function getVisitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    // Storage blocked (private mode / disabled): a per-load id still counts as
    // a visitor, it just won't dedupe across page loads.
    return randomId();
  }
}

// First-touch UTM capture: if this load carries utm_* params, remember them for
// the session; otherwise return whatever was captured earlier this session.
export function captureUtm(): UtmParams {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl: UtmParams = { ...EMPTY_UTM };
    let hasAny = false;
    for (const key of UTM_PARAMS) {
      const value = params.get(key);
      if (value) {
        fromUrl[key] = value.slice(0, 120);
        hasAny = true;
      }
    }
    if (hasAny) {
      sessionStorage.setItem(UTM_KEY, JSON.stringify(fromUrl));
      return fromUrl;
    }
    const stored = sessionStorage.getItem(UTM_KEY);
    return stored ? { ...EMPTY_UTM, ...JSON.parse(stored) } : { ...EMPTY_UTM };
  } catch {
    return { ...EMPTY_UTM };
  }
}

// The full attribution snapshot the beacon and the form send to the API.
export function getAttribution(): Attribution {
  return {
    visitor_id: getVisitorId(),
    referrer: typeof document !== "undefined" ? document.referrer : "",
    ...captureUtm(),
  };
}
