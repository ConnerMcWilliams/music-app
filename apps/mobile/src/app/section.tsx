import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState, Icon, Screen, SectionCard } from '@/components';
import { getSectionById } from '@/data';
import { Colors, Fonts } from '@/theme';
import type { Exercise } from '@/types';

/**
 * Section detail — the destination of tapping a Study on the Studies tab.
 *
 * Lists every exercise (study) in the selected Clarke Study, using the same
 * {@link SectionCard} row as the browse screen — the difference is these rows
 * show each study's key. Tapping a study opens the Practice screen for it.
 */
export default function SectionScreen() {
  const params = useLocalSearchParams<{ section?: string }>();
  const sectionNumber =
    typeof params.section === 'string' && params.section.trim() !== ''
      ? Number(params.section)
      : NaN;
  const section = Number.isInteger(sectionNumber) ? getSectionById(sectionNumber) : undefined;

  const openStudy = (study: Exercise) => {
    router.push({ pathname: '/practice', params: { exerciseId: study.id } });
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.push('/studies'))}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <Icon name="chevron-left" size={20} color={Colors.iconLight} strokeWidth={1.8} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>CLARKE STUDIES</Text>
          <Text style={styles.headerTitle}>{section ? section.label : 'Study unavailable'}</Text>
        </View>
      </View>

      {section ? (
        <>
          <Text style={styles.focus}>{section.focus}</Text>
          <View style={styles.list}>
            {section.exercises.map((study) => (
              <SectionCard
                key={study.id}
                badge={study.number}
                title={study.title}
                subtitle={study.subtitle || undefined}
                meta={study.key || undefined}
                onPress={() => openStudy(study)}
              />
            ))}
          </View>
        </>
      ) : (
        <EmptyState
          title="Study unavailable"
          message="Pick a study from the Studies tab to see its exercises."
        />
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
  focus: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 19,
  },
  list: { gap: 11 },
});
