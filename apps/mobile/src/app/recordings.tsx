import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  EmptyState,
  ErrorState,
  Icon,
  LoadingState,
  Screen,
  SubmissionCard,
} from '@/components';
import { useSubmissionsPage } from '@/hooks/useSubmissions';
import { setLastGradingResult } from '@/services/lastGradingResult';
import { Colors, Fonts, Radius } from '@/theme';
import type { Submission } from '@/types';

/**
 * All recordings — the destination of "See all" on the Profile tab.
 *
 * A full, paged history of the signed-in user's graded takes. Mirrors the Studies
 * browse screen (title, search field, filter chips, card list), but lists past
 * recordings and pages through the history with a Previous/Next pager. Chips are
 * derived from the studies represented on the current page; selecting one filters
 * that page (the endpoint has no per-exercise filter, so filtering is client-side
 * over the loaded page).
 */
export default function RecordingsScreen() {
  const [page, setPage] = useState(1);
  const { data, loading, error, hasNext, refetch } = useSubmissionsPage(page);
  const [filter, setFilter] = useState('All');

  // Chips: "All" plus each distinct study title present on this page. Dedup by
  // title (what the chips label and filter by) so two exercises sharing a title —
  // e.g. both falling back to "Clarke Study" — collapse into one chip with a
  // unique React key.
  const filters = useMemo(() => {
    const titles = new Set<string>();
    for (const s of data) titles.add(s.title);
    return ['All', ...titles];
  }, [data]);

  const visible = data.filter((s) => filter === 'All' || s.title === filter);
  const hasPrev = page > 1;

  const selectFilter = (f: string) => {
    setFilter(f);
    setPage(1);
  };

  const openSubmission = (s: Submission) => {
    // Same hand-off as the Profile list: stash the tapped take's grade, then open
    // the Results tab (which re-reads the store on focus).
    setLastGradingResult(s.grade);
    router.push('/results');
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.push('/profile'))}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <Icon name="chevron-left" size={20} color={Colors.iconLight} strokeWidth={1.8} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>PAST RECORDINGS</Text>
          <Text style={styles.headerTitle}>Your Recordings</Text>
        </View>
      </View>

      {/* Visual-only search field. TODO(search): wire to real query/filtering. */}
      <View style={styles.search}>
        <Icon name="search" size={18} color={Colors.textMuted} />
        <Text style={styles.searchPlaceholder}>Search recordings…</Text>
      </View>

      {filters.length > 1 ? (
        <View style={styles.chips} testID="recording-filters">
          {filters.map((f) => {
            const active = f === filter;
            return (
              <Pressable key={f} onPress={() => selectFilter(f)}>
                <View style={[styles.chip, active ? styles.chipActive : styles.chipIdle]}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{f}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {loading ? (
        <LoadingState message="Loading your recordings…" />
      ) : error ? (
        <ErrorState message="We couldn’t load your recordings." onRetry={refetch} />
      ) : (
        <>
          {data.length === 0 ? (
            <EmptyState
              title="No recordings yet"
              message="Record a study and your graded takes show up here."
            />
          ) : visible.length === 0 ? (
            <EmptyState
              title="No recordings for this study"
              message="Nothing from this study on this page. Try another page or clear the filter."
            />
          ) : (
            <View style={styles.list}>
              {visible.map((s) => (
                <SubmissionCard
                  key={s.id}
                  submission={s}
                  onPress={s.grade ? openSubmission : undefined}
                />
              ))}
            </View>
          )}

          {hasPrev || hasNext ? (
            <View style={styles.pager}>
              <Pressable
                onPress={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!hasPrev}
                accessibilityRole="button"
                accessibilityLabel="Previous page"
                style={({ pressed }) => [
                  styles.pagerBtn,
                  !hasPrev && styles.pagerBtnDisabled,
                  pressed && hasPrev && styles.pressed,
                ]}>
                <Text style={styles.pagerBtnText}>Previous</Text>
              </Pressable>
              <Text style={styles.pagerLabel}>Page {page}</Text>
              <Pressable
                onPress={() => setPage((p) => p + 1)}
                disabled={!hasNext}
                accessibilityRole="button"
                accessibilityLabel="Next page"
                style={({ pressed }) => [
                  styles.pagerBtn,
                  !hasNext && styles.pagerBtnDisabled,
                  pressed && hasNext && styles.pressed,
                ]}>
                <Text style={styles.pagerBtnText}>Next</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(126,147,172,.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.8 },
  eyebrow: {
    fontFamily: Fonts.sansSemibold,
    fontSize: 11,
    letterSpacing: 1.6,
    color: Colors.textMuted,
  },
  headerTitle: {
    fontFamily: Fonts.serifBold,
    fontSize: 26,
    color: Colors.textCream,
    marginTop: 1,
  },

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

  list: { gap: 9 },

  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 11,
    marginTop: 4,
  },
  pagerBtn: {
    minWidth: 96,
    height: 44,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(126,147,172,.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pagerBtnDisabled: { opacity: 0.4 },
  pagerBtnText: { fontFamily: Fonts.sansSemibold, fontSize: 13.5, color: Colors.iconLight },
  pagerLabel: { fontFamily: Fonts.sansMedium, fontSize: 12.5, color: Colors.textMuted },
});
