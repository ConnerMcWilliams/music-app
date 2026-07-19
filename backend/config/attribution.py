"""
Traffic-source attribution shared by the public marketing-site endpoints.

Both the analytics visit ping and the waitlist signup derive a normalized
``source`` channel from the same first-touch signals — a UTM tag or the
referring host — so a visit and the signup it produces bucket into the same
channel and the dashboard's per-source conversion rate lines up.
"""
from __future__ import annotations

from urllib.parse import urlparse

# Known referring hosts → the channel label we report. Matched against the host
# with a leading "www." stripped; anything unrecognized falls back to the bare
# host so a new referrer still shows up instead of silently vanishing. Search
# engines are handled separately (see ``derive_source``) to catch country TLDs.
_HOST_SOURCES = {
    "instagram.com": "instagram",
    "l.instagram.com": "instagram",
    "linkedin.com": "linkedin",
    "lnkd.in": "linkedin",
    "youtube.com": "youtube",
    "m.youtube.com": "youtube",
    "youtu.be": "youtube",
    "facebook.com": "facebook",
    "m.facebook.com": "facebook",
    "l.facebook.com": "facebook",
    "twitter.com": "twitter",
    "x.com": "twitter",
    "t.co": "twitter",
    "reddit.com": "reddit",
    "out.reddit.com": "reddit",
    "tiktok.com": "tiktok",
}

# Search-engine host prefixes that read as organic traffic regardless of TLD
# (google.com, google.co.uk, …).
_SEARCH_ENGINES = ("google.", "bing.", "duckduckgo.", "yahoo.", "ecosia.", "search.brave.")


def referrer_host(referrer_url: str) -> str:
    """Lower-cased host of ``referrer_url`` with any port and leading www. removed."""
    if not referrer_url:
        return ""
    host = urlparse(referrer_url).netloc.lower().split(":", 1)[0]
    if host.startswith("www."):
        host = host[4:]
    return host[:255]


def derive_source(*, referrer_url: str = "", utm_source: str = "") -> str:
    """Normalize a traffic source from a UTM tag or the referring host.

    Precedence: an explicit ``utm_source`` wins (that's the campaign the owner
    tagged), then the referring host (search engines → ``"organic"``, known
    social hosts → their label, anything else → the bare host), and finally
    ``"direct"`` when the visitor arrived with no referrer at all.
    """
    utm = utm_source.strip().lower()
    if utm:
        return utm[:64]
    host = referrer_host(referrer_url)
    if not host:
        return "direct"
    if any(host == e[:-1] or host.startswith(e) for e in _SEARCH_ENGINES):
        return "organic"
    return _HOST_SOURCES.get(host, host)[:64]
