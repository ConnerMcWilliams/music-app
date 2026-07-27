import { useMemo, useState } from 'react';

import type { PageLayout } from '@/lib/musicxml';

interface ScorePagingOptions {
  /** Resets to page 0 whenever this changes — the identity of the shown study. */
  resetKey?: string;
  /** `ParsedNote.index` the live playhead is inside. */
  activeNoteIndex?: number;
  /** Auto-flip pages to keep {@link activeNoteIndex} on screen. */
  followActiveNote?: boolean;
}

interface ScorePaging {
  /** Page currently shown, already clamped to `pages`. */
  page: number;
  next: () => void;
  prev: () => void;
}

/**
 * Page cursor for a paginated score.
 *
 * Shared by the embedded `MusicXmlView` card and the fullscreen
 * `ExpandedScoreModal`. Each caller gets its own independent cursor, which is
 * what we want: the two views paginate differently (fixed chunks vs. measured
 * height), so their page *numbers* mean different things.
 *
 * Both resets adjust state **during render** rather than in an effect, so the
 * new page lands in the same commit as the content that caused it — an effect
 * would paint one frame of the stale page first.
 */
export function useScorePaging(
  pages: PageLayout[],
  { resetKey, activeNoteIndex, followActiveNote = false }: ScorePagingOptions = {},
): ScorePaging {
  // Which page each note landed on, so `followActiveNote` can flip to it
  // without re-deriving layout. One O(n) walk, memoized with the layout.
  const pageOfNote = useMemo(() => {
    const map = new Map<number, number>();
    pages.forEach((systems, pageIndex) => {
      for (const system of systems) {
        for (const placed of system.notes) map.set(placed.note.index, pageIndex);
      }
    });
    return map;
  }, [pages]);

  const [page, setPage] = useState(0);

  const [shownKey, setShownKey] = useState(resetKey);
  if (resetKey !== shownKey) {
    setShownKey(resetKey);
    setPage(0);
  }

  // Follow the playhead across page breaks, using the same during-render
  // adjustment as the study reset above so the flip lands in one commit.
  const followPage =
    followActiveNote && activeNoteIndex != null ? pageOfNote.get(activeNoteIndex) : undefined;
  // What the last auto-flip was derived from. Starts empty (not at
  // `activeNoteIndex`) so a view mounted with the playhead already part-way
  // through the study still opens on the right page. The resolved *page* is
  // tracked alongside the note because a repagination moves the same note to a
  // different page number: the fullscreen view pages under the fixed fallback
  // while it is closed and repacks against the measured stage on open, so
  // watching the note alone would leave it on a page the playhead has left.
  const [followed, setFollowed] = useState<{ note?: number; page?: number }>({});
  if (followActiveNote && (activeNoteIndex !== followed.note || followPage !== followed.page)) {
    setFollowed({ note: activeNoteIndex, page: followPage });
    if (followPage != null && followPage !== page) setPage(followPage);
  }

  // Repagination (a rotation, a resize) can strand the cursor past the end.
  const current = pages.length === 0 ? 0 : Math.min(page, pages.length - 1);

  return {
    page: current,
    prev: () => setPage(Math.max(0, current - 1)),
    next: () => setPage(Math.min(pages.length - 1, current + 1)),
  };
}
