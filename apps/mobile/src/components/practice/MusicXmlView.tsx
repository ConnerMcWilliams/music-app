import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { ExpandedScoreModal } from '@/components/practice/ExpandedScoreModal';
import { PageControls, SystemStaff } from '@/components/practice/ScoreSheet';
import { useScorePaging } from '@/hooks/useScorePaging';
import { SYSTEM_GAP, layoutScore, parseMusicXML } from '@/lib/musicxml';
import { Colors, Fonts, Radius } from '@/theme';
import type { Exercise, NoteState } from '@/types';

export { NOTE_STATE_COLORS } from '@/components/practice/ScoreSheet';

/**
 * MusicXmlView — the study's music view, rendered from **MusicXML**.
 *
 * This is the notation surface for Practice and Record: it parses the study's
 * `StudyContent.musicxml` (bundled today as `@/data` → `MUSICXML_BY_ID`) and
 * draws it on a cream "paper" Surface with a header row.
 *
 * Layout is computed by `@/lib/musicxml`'s `layoutScore` (pure and
 * unit-tested): measures pack onto staff lines by their engraved width (dense
 * bars get a line to themselves), systems chunk into pages behind the
 * page-flip controls, and every system carries its own vertical bounds so
 * ledger-line notes are never clipped — the SVG viewBox tracks the content.
 *
 * Tapping the card opens {@link ExpandedScoreModal}, a fullscreen view of the
 * same systems repacked to the measured screen height and free to rotate to
 * landscape. It renders in this component's tree, so live props (verdicts, the
 * playhead) keep flowing while it's open.
 *
 * Rendering is intentionally a faithful subset (note-heads, stems, flags,
 * beams, accidentals, ledger lines, bar lines, slurs, tuplet brackets). It uses
 * `react-native-svg` only — no WebView, no native module, works on web too.
 * See `docs/architecture.md` → "Notation rendering (MusicXML)".
 */
interface MusicXmlViewProps {
  exercise?: Exercise;
  /** Canonical MusicXML for the study (from `StudyContent.musicxml`). */
  musicXml?: string;
  loading?: boolean;
  /**
   * Per-note feedback, keyed by **`ParsedNote.index`** — the position in
   * `score.notes`, *not* the sounding-note ordinal the backend grades by.
   * Callers holding backend results must map through `ExpectedNote.noteIndex`
   * (see `lib/musicxml/timeline.ts`); the two diverge at every rest.
   *
   * Omit for plain notation — the default rendering is unchanged.
   */
  noteStates?: ReadonlyMap<number, NoteState>;
  /** `ParsedNote.index` the live playhead is inside; draws a halo behind it. */
  activeNoteIndex?: number;
  /** Auto-flip pages to keep {@link activeNoteIndex} on screen. */
  followActiveNote?: boolean;
  /** Tap the card to open it fullscreen. On by default. */
  expandable?: boolean;
}

/** Fixed notation-area height for the loading/unavailable states (one system). */
const STAFF_HEIGHT = 84;

export function MusicXmlView({
  exercise,
  musicXml,
  loading = false,
  noteStates,
  activeNoteIndex,
  followActiveNote = false,
  expandable = true,
}: MusicXmlViewProps) {
  const score = useMemo(() => (musicXml ? parseMusicXML(musicXml) : undefined), [musicXml]);
  const pages = useMemo(() => layoutScore(score), [score]);
  const { page, prev, next } = useScorePaging(pages, {
    resetKey: musicXml,
    activeNoteIndex,
    followActiveNote,
  });

  // The fullscreen view repacks the same systems against the measured screen,
  // so it wants them flat rather than pre-chunked into this card's pages.
  const allSystems = useMemo(() => pages.flat(), [pages]);
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <Surface>
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Loading study…</Text>
        </View>
      </Surface>
    );
  }

  if (!exercise || !score || pages.length === 0) {
    return (
      <Surface>
        <View style={styles.placeholder}>
          <Text style={styles.placeholderTitle}>Notation unavailable</Text>
          <Text style={styles.placeholderText}>
            This study doesn’t have MusicXML notation yet.
          </Text>
        </View>
      </Surface>
    );
  }

  const systems = pages[page];

  return (
    <Surface>
      {/* The pager's buttons are nested Pressables, so flipping pages is
          captured there and never bubbles up as an expand. */}
      <ExpandTarget
        enabled={expandable}
        label={`Expand music view, First Studies No. ${exercise.number}, ${exercise.key}`}
        onPress={() => setExpanded(true)}>
        <View style={styles.sheetTop}>
          <Text style={styles.sheetLabel}>FIRST STUDIES · No. {exercise.number}</Text>
          <View style={styles.sheetTopRight}>
            <Text style={styles.sheetKey}>{exercise.key}</Text>
            {expandable && <Icon name="maximize" size={15} color={Colors.goldLabel} />}
          </View>
        </View>

        <View style={styles.systems}>
          {systems.map((system, i) => (
            <SystemStaff
              key={i}
              system={system}
              noteStates={noteStates}
              activeNoteIndex={activeNoteIndex}
            />
          ))}
        </View>
      </ExpandTarget>

      {pages.length > 1 && (
        <PageControls page={page} total={pages.length} onPrev={prev} onNext={next} />
      )}

      {expandable && (
        <ExpandedScoreModal
          visible={expanded}
          onClose={() => setExpanded(false)}
          exercise={exercise}
          systems={allSystems}
          resetKey={musicXml}
          noteStates={noteStates}
          activeNoteIndex={activeNoteIndex}
          followActiveNote={followActiveNote}
        />
      )}
    </Surface>
  );
}

/**
 * Makes the notation itself the tap target, or passes straight through.
 *
 * A `Pressable` is one accessibility element, so its label *replaces* the
 * header it wraps — `label` therefore has to carry the study's identity, which
 * appears nowhere else on the Results and Record screens.
 */
function ExpandTarget({
  enabled,
  label,
  onPress,
  children,
}: {
  enabled: boolean;
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens the notation fullscreen"
      style={({ pressed }) => pressed && styles.pressed}>
      {children}
    </Pressable>
  );
}

/** Cream card that wraps the notation in every state (mirrors MusicView). */
function Surface({ children }: { children: React.ReactNode }) {
  return <View style={styles.sheet}>{children}</View>;
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: Colors.creamGradient[0],
    borderRadius: Radius.xl,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    shadowColor: '#080F1C',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 16 },
    elevation: 5,
  },
  pressed: { opacity: 0.75 },
  sheetTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTopRight: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sheetLabel: {
    fontFamily: Fonts.sansBold,
    fontSize: 10.5,
    letterSpacing: 1.6,
    color: Colors.goldLabel,
  },
  sheetKey: { fontFamily: Fonts.sansSemibold, fontSize: 11, color: '#5A6472' },

  systems: { gap: SYSTEM_GAP },

  placeholder: {
    height: STAFF_HEIGHT + 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  placeholderTitle: {
    fontFamily: Fonts.sansSemibold,
    fontSize: 14,
    color: Colors.textOnCream,
  },
  placeholderText: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    color: Colors.textOnCreamMuted,
    textAlign: 'center',
  },
});
