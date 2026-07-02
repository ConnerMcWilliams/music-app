import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState, ErrorState, ExerciseCard, Icon, LoadingState, Screen } from '@/components';
import { EXERCISES } from '@/data';
import { Colors, Fonts, Radius } from '@/theme';
import type { Exercise, ExerciseCategory } from '@/types';
import { useMockQuery } from '@/hooks/useMockQuery';

const FILTERS: (ExerciseCategory | 'All')[] = ['All', 'Articulation', 'Flexibility'];

export default function StudiesScreen() {
  const { data, loading, error, refetch } = useMockQuery(() => EXERCISES);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');

  const visible = (data ?? []).filter((e) => filter === 'All' || e.category === filter);

  const openExercise = (exercise: Exercise) => {
    // Locked studies are non-interactive (handled inside ExerciseCard too).
    if (exercise.status === 'locked') return;
    router.push({ pathname: '/practice', params: { exerciseId: exercise.id } });
  };

  return (
    <Screen>
      <View>
        <Text style={styles.eyebrow}>Clarke Technical Studies</Text>
        <Text style={styles.title}>Find a Study</Text>
      </View>

      {/* Visual-only search field. TODO(search): wire to real query/filtering. */}
      <View style={styles.search}>
        <Icon name="search" size={18} color={Colors.textMuted} />
        <Text style={styles.searchPlaceholder}>Search studies &amp; techniques…</Text>
      </View>

      <View style={styles.chips}>
        {FILTERS.map((f) => {
          const active = f === filter;
          return (
            <Pressable key={f} onPress={() => setFilter(f)}>
              <View style={[styles.chip, active ? styles.chipActive : styles.chipIdle]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>FOUNDATIONAL</Text>

      {loading ? (
        <LoadingState message="Loading studies…" />
      ) : error ? (
        <ErrorState onRetry={refetch} />
      ) : visible.length === 0 ? (
        <EmptyState
          title="No studies here"
          message="No studies match this filter yet. Try another category."
        />
      ) : (
        <View style={styles.list}>
          {visible.map((exercise) => (
            <ExerciseCard key={exercise.id} exercise={exercise} onPress={openExercise} />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontFamily: Fonts.sans, fontSize: 12.5, color: Colors.textMuted },
  title: { fontFamily: Fonts.serifBold, fontSize: 32, color: Colors.textCream, marginTop: 2 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#14243A',
    borderWidth: 1,
    borderColor: Colors.mutedBorderAlt,
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  searchPlaceholder: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.textMutedDim },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { borderRadius: 20, paddingVertical: 7, paddingHorizontal: 15 },
  chipActive: { backgroundColor: Colors.gold },
  chipIdle: { backgroundColor: 'rgba(126,147,172,.1)' },
  chipText: { fontFamily: Fonts.sansMedium, fontSize: 12.5, color: Colors.chipText },
  chipTextActive: { fontFamily: Fonts.sansSemibold, color: Colors.textOnCream },
  sectionLabel: {
    fontFamily: Fonts.sansBold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: Colors.textMuted,
  },
  list: { gap: 11 },
});
