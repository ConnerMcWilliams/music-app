import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { PageControls, SystemStaff } from '@/components/practice/ScoreSheet';
import { useScorePaging } from '@/hooks/useScorePaging';
import { SYSTEM_GAP, paginateToHeight, type SystemLayout } from '@/lib/musicxml';
import { allowRotation, lockPortrait } from '@/lib/orientation';
import { Colors, Fonts, Radius } from '@/theme';
import type { Exercise, NoteState } from '@/types';

/**
 * Fullscreen music view — what tapping the notation card opens.
 *
 * Deliberately a `Modal` rather than an expo-router route. Practice's live
 * analysis state (`noteStates`, `activeNoteIndex`) lives in the screen's own
 * component state; a pushed route would have to lift all of it into a store to
 * cross the navigation boundary, whereas a modal renders in the same React tree
 * and simply receives it as props. A take stays live while expanded.
 *
 * Paging is recomputed from the *measured* stage rather than the fixed
 * `SYSTEMS_PER_PAGE` the embedded card uses, so a page holds as much music as
 * the screen can actually show — around five systems in portrait, one or two in
 * landscape where each is roughly twice the size. Rotating simply re-measures
 * and re-packs.
 */
interface ExpandedScoreModalProps {
  visible: boolean;
  onClose: () => void;
  exercise: Exercise;
  /** Every system of the study, in order (i.e. `layoutScore(score).flat()`). */
  systems: SystemLayout[];
  /** Identity of the shown study — changing it rewinds to the first page. */
  resetKey?: string;
  noteStates?: ReadonlyMap<number, NoteState>;
  activeNoteIndex?: number;
  followActiveNote?: boolean;
}

/**
 * Widest the staff is ever drawn. Without a cap, a tablet in landscape stretches
 * one system across ~1300pt and the glyphs turn cartoonish.
 */
const MAX_STAFF_WIDTH = 900;

export function ExpandedScoreModal({
  visible,
  onClose,
  exercise,
  systems,
  resetKey,
  noteStates,
  activeNoteIndex,
  followActiveNote = false,
}: ExpandedScoreModalProps) {
  // The stage is `flex: 1`, so measuring it can't feed back into its own size —
  // no layout loop. Zero until the first pass, which `paginateToHeight` treats
  // as "not measured yet" and falls back to fixed chunking for.
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const onStageLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setStage((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  };

  const staffWidth = Math.min(stage.width, MAX_STAFF_WIDTH);
  const pages = useMemo(
    () => paginateToHeight(systems, stage.height, staffWidth),
    [systems, stage.height, staffWidth],
  );
  const { page, prev, next } = useScorePaging(pages, {
    resetKey,
    activeNoteIndex,
    followActiveNote,
  });

  // Landscape is the whole point of expanding — it roughly doubles note size.
  // Restore the portrait lock on close *and* on unmount, so a hot reload or an
  // unmount mid-rotation can't strand the rest of the app sideways.
  useEffect(() => {
    if (!visible) return;
    void allowRotation();
    return () => {
      void lockPortrait();
    };
  }, [visible]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      supportedOrientations={['portrait', 'landscape']}
      onRequestClose={onClose}
      statusBarTranslucent>
      {/* A Modal is its own native view hierarchy, so the root provider's insets
          don't describe it — and after a rotation they'd be the portrait ones.
          A nested provider seeds from the parent (no flash) then re-measures. */}
      <SafeAreaProvider>
        <LinearGradient
          colors={Colors.bgGradient}
          locations={[0, 0.62, 1]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.fill}>
          <SafeAreaView style={styles.fill}>
            <View style={styles.header}>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close expanded music view"
                hitSlop={12}
                style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}>
                <Icon name="x" size={20} color={Colors.textCream} />
              </Pressable>
              <View style={styles.headerText}>
                <Text style={styles.headerLabel}>FIRST STUDIES · No. {exercise.number}</Text>
                <Text style={styles.headerKey}>{exercise.key}</Text>
              </View>
            </View>

            <View style={styles.sheet}>
              <View style={styles.stage} onLayout={onStageLayout}>
                {/* Nothing to draw until the first layout pass gives us a width. */}
                {staffWidth > 0 && (
                  <View style={[styles.systems, { width: staffWidth }]}>
                    {(pages[page] ?? []).map((system, i) => (
                      <SystemStaff
                        key={i}
                        system={system}
                        noteStates={noteStates}
                        activeNoteIndex={activeNoteIndex}
                      />
                    ))}
                  </View>
                )}
              </View>

              {pages.length > 1 && (
                <PageControls page={page} total={pages.length} onPrev={prev} onNext={next} />
              )}
            </View>
          </SafeAreaView>
        </LinearGradient>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.goldBorder,
  },
  closeBtnPressed: { opacity: 0.7 },
  headerText: { flex: 1, alignItems: 'flex-end' },
  headerLabel: {
    fontFamily: Fonts.sansBold,
    fontSize: 10.5,
    letterSpacing: 1.6,
    color: Colors.gold,
  },
  headerKey: { fontFamily: Fonts.sansSemibold, fontSize: 11, color: Colors.textMuted },

  sheet: {
    flex: 1,
    backgroundColor: Colors.creamGradient[0],
    borderRadius: Radius.xl,
    marginHorizontal: 12,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
  },
  // Fixed box the pagination is measured against; systems are centred inside it
  // and clipped as a backstop for a single system taller than the whole screen.
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  systems: { gap: SYSTEM_GAP },
});
