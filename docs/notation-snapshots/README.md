# Notation view — before / after snapshots

Visual record of wiring the real MusicXML notation component into the **Practice**
and **Record** screens. Both screens previously rendered `MusicView` (a fixed,
hand-drawn placeholder phrase); they now render `MusicXmlView`, which parses the
study's MusicXML from the backend (`backend/studies/seed/musicxml/*.musicxml`,
bundled for the app as `apps/mobile/src/data/musicxmlCatalog.ts`).

Rendered for **Clarke Study No. 1** (C major) — the actual SVG each component
emits, captured by rendering the real components (react-native-svg → SVG DOM).

| Before — `MusicView` | After — `MusicXmlView` |
| --- | --- |
| ![Before: MusicView placeholder](./before-musicview.svg) | ![After: MusicXmlView from MusicXML](./after-musicxmlview.svg) |

`notation-before-after.html` is a self-contained side-by-side comparison with the
full style-parity notes.

## Style parity

The card chrome is identical by construction: `MusicView` and `MusicXmlView` share
a byte-for-byte `StyleSheet` (cream fill, `Radius.xl`, padding, shadow), the same
header row, the same staff frame (`viewBox="0 0 300 84"`, five lines in `#3A4658`,
the decorative treble glyph, the right barline), and the same note-glyph vocabulary
(heads `rx 5.2 / ry 3.8` rotated −20°, ink `#1B2F49`, gold `#C9A24A` slurs). The
only intended difference is that the staff now draws the study's real pitches,
accidentals, flags, ledger lines, and bar lines. No style fixes were needed.

Studies without scored notation fall back to the card's "notation unavailable" state.
