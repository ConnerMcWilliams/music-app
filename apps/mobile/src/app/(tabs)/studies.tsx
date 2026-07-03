import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState, ErrorState, Icon, LoadingState, Screen, SectionCard } from '@/components';
import { STUDY_SECTIONS } from '@/data';
import { Colors, Fonts, Radius } from '@/theme';
import type { ExerciseCategory, StudySection } from '@/types';
import { useMockQuery } from '@/hooks/useMockQuery';

const FILTERS: (ExerciseCategory | 'All')[] = ['All', 'Foundational', 'Articulation', 'Flexibility'];

export default function StudiesScreen() {
  const { data, loading, error, refetch } = useMockQuery(() => STUDY_SECTIONS);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');

  const visible = (data ?? []).filter((s) => filter === 'All' || s.category === filter);

  const openSection = (section: StudySection) => {
    router.push({ pathname: '/section', params: { section: String(section.section) } });
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
          {visible.map((section) => (
            <SectionCard
              key={section.section}
              badge={section.section}
              title={section.label}
              subtitle={section.focus}
              meta={`${section.exercises.length} studies`}
              onPress={() => openSection(section)}
            />
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
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { borderRadius: 20, paddingVertical: 7, paddingHorizontal: 15 },
  chipActive: { backgroundColor: Colors.gold },
  chipIdle: { backgroundColor: 'rgba(126,147,172,.1)' },
  chipText: { fontFamily: Fonts.sansMedium, fontSize: 12.5, color: Colors.chipText },
  chipTextActive: { fontFamily: Fonts.sansSemibold, color: Colors.textOnCream },
  list: { gap: 11 },
});
