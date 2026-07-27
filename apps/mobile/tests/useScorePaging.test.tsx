import { act, renderHook } from '@testing-library/react-native';

import { useScorePaging } from '@/hooks/useScorePaging';
import type { PageLayout } from '@/lib/musicxml';

/**
 * The cursor only ever reads `notes[].note.index`, so a page here is just the
 * note indices it holds — the engraving fields would be noise.
 */
const pagesOf = (...pages: number[][]): PageLayout[] =>
  pages.map((indices) => [
    { notes: indices.map((index) => ({ note: { index } })) },
  ]) as unknown as PageLayout[];

/** The same ten notes chunked the two ways the two views chunk them. */
const FIXED = pagesOf([0, 1], [2, 3], [4, 5], [6, 7], [8, 9]);
const PACKED = pagesOf([0, 1, 2, 3, 4], [5, 6, 7, 8, 9]);

/** RNTL v14 needs the cursor moved inside an awaited act. */
const flip = async (turn: () => void) => {
  await act(async () => {
    turn();
  });
};

describe('useScorePaging', () => {
  it('rewinds to the first page when the study changes', async () => {
    const { result, rerender } = await renderHook(
      (props: { study: string }) => useScorePaging(FIXED, { resetKey: props.study }),
      { initialProps: { study: 'first' } },
    );
    await flip(result.current.next);
    expect(result.current.page).toBe(1);

    await rerender({ study: 'second' });
    expect(result.current.page).toBe(0);
  });

  it('follows the playhead across page breaks', async () => {
    const { result, rerender } = await renderHook(
      (props: { note: number }) =>
        useScorePaging(FIXED, { activeNoteIndex: props.note, followActiveNote: true }),
      { initialProps: { note: 0 } },
    );
    expect(result.current.page).toBe(0);

    await rerender({ note: 5 });
    expect(result.current.page).toBe(2);
  });

  it('re-derives the page when the same note repaginates onto another one', async () => {
    // The fullscreen view pages under the fixed fallback while it is closed and
    // repacks against the measured stage on open, so opening it mid-take must
    // not leave the cursor on a page the playhead has already left.
    const { result, rerender } = await renderHook(
      (props: { pages: PageLayout[] }) =>
        useScorePaging(props.pages, { activeNoteIndex: 2, followActiveNote: true }),
      { initialProps: { pages: FIXED } },
    );
    expect(result.current.page).toBe(1);

    await rerender({ pages: PACKED });
    expect(result.current.page).toBe(0);
  });

  it('leaves the cursor alone across a repagination when not following', async () => {
    const { result, rerender } = await renderHook(
      (props: { pages: PageLayout[] }) => useScorePaging(props.pages, { activeNoteIndex: 2 }),
      { initialProps: { pages: FIXED } },
    );
    await flip(result.current.next);
    expect(result.current.page).toBe(1);

    await rerender({ pages: PACKED });
    expect(result.current.page).toBe(1);
  });

  it('clamps a cursor stranded past the end of a shorter layout', async () => {
    const { result, rerender } = await renderHook(
      (props: { pages: PageLayout[] }) => useScorePaging(props.pages),
      { initialProps: { pages: FIXED } },
    );
    await flip(result.current.next);
    await flip(result.current.next);
    await flip(result.current.next);
    expect(result.current.page).toBe(3);

    await rerender({ pages: PACKED });
    expect(result.current.page).toBe(1);
  });
});
