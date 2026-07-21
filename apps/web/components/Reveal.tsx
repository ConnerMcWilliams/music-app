"use client";

import type { ElementType, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

type RevealProps = {
  /** Element to render. Defaults to a layout-neutral <div>. */
  as?: ElementType;
  className?: string;
  children: ReactNode;
};

/**
 * Reveals its content the first time it scrolls into view by adding the global
 * `is-in` class, which the `.reveal` / `.reveal-stagger` rules in globals.css
 * transition from a small fade-up to the resting state.
 *
 * Intentionally applies no visual style itself — the caller adds `reveal`
 * (self fade-up) or `reveal-stagger` (staggered children). This keeps existing
 * server-rendered markup (e.g. card <article>s) as direct DOM children, so no
 * extra wrapper is introduced and layout is preserved.
 *
 * Animates once: the observer disconnects on first intersection, so nudging the
 * scroll up and down never replays it. Reduced-motion and no-JS visibility are
 * handled entirely in CSS, so this component only ever adds motion, never hides.
 */
export function Reveal({ as: Tag = "div", className = "", children }: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    // No IntersectionObserver → nothing to hide (the CSS reveal is gated behind
    // `@media (scripting: enabled)`, which no such browser matches), so leave
    // content at its already-visible resting state.
    if (!el || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const classes = `${className} ${shown ? "is-in" : ""}`.trim();

  return (
    <Tag ref={ref} className={classes}>
      {children}
    </Tag>
  );
}
