import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components';
import { PrimaryButton } from '@/components/auth';
import { Colors, Fonts, Layout, Radius } from '@/theme';

interface OnboardingStepProps {
  /** 1-based position in the flow. Ignored in edit mode. */
  step: number;
  /**
   * Steps in this flow. A prop rather than a constant because the flow is
   * configurable — the dashboard can shorten or reorder it.
   */
  totalSteps: number;
  title: string;
  subtitle: string;
  children: ReactNode;
  /** Save-and-advance. Disabled until the step has an answer. */
  onContinue: () => void;
  canContinue?: boolean;
  /**
   * Overrides "Continue" when the variant supplies one. Edit mode always reads
   * "Save": a variant's "Let's go" would be wrong on an account-screen edit.
   */
  ctaLabel?: string;
  saving?: boolean;
  /** Back affordance; omitted on the first step. */
  onBack?: () => void;
  /**
   * Reached from the account screen to change one answer, rather than as part of
   * the initial run: the CTA reads "Save" and the progress dots are hidden,
   * because there is no flow to be partway through.
   */
  editing?: boolean;
  /** Save failure, shown above the step's content. */
  error?: string | null;
}

/**
 * Shared chrome for every onboarding step: the app's gradient background, a
 * progress indicator, heading, keyboard-safe body, and the Back/Continue pair.
 *
 * Deliberately mirrors `components/auth/AuthScreen` so signup and onboarding read
 * as one continuous flow, and reuses `PrimaryButton` for the CTA.
 */
export function OnboardingStep({
  step,
  totalSteps,
  title,
  subtitle,
  children,
  onContinue,
  canContinue = true,
  ctaLabel,
  saving = false,
  onBack,
  editing = false,
  error,
}: OnboardingStepProps) {
  return (
    <LinearGradient
      colors={Colors.bgGradient}
      locations={[0, 0.62, 1]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={styles.fill}>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.fill}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View style={styles.topBar}>
              {onBack ? (
                <Pressable
                  onPress={onBack}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Go back">
                  <Icon name="chevron-left" size={26} color={Colors.textCream} />
                </Pressable>
              ) : (
                <View style={styles.backSpacer} />
              )}
              {!editing && <ProgressDots step={step} total={totalSteps} />}
            </View>

            <View style={styles.heading}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>

            {error ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.body}>{children}</View>

            <View style={styles.footer}>
              <PrimaryButton
                label={editing ? 'Save' : ctaLabel || 'Continue'}
                onPress={onContinue}
                loading={saving}
                disabled={!canContinue}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

function ProgressDots({ step, total }: { step: number; total: number }) {
  return (
    <View
      style={styles.dots}
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.dot, i < step ? styles.dotOn : styles.dotOff]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    paddingHorizontal: Layout.screenPaddingH,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 20,
    flexGrow: 1,
  },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 26 },
  backSpacer: { width: 26 },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { height: 5, borderRadius: Radius.pill },
  dotOn: { width: 22, backgroundColor: Colors.gold },
  dotOff: { width: 10, backgroundColor: Colors.trackBar },
  heading: { gap: 7, marginTop: 4 },
  title: { fontFamily: Fonts.serifBold, fontSize: 30, color: Colors.textCream, lineHeight: 36 },
  subtitle: { fontFamily: Fonts.sans, fontSize: 14.5, color: Colors.textMuted, lineHeight: 20 },
  errorBanner: {
    backgroundColor: 'rgba(214,120,120,.12)',
    borderWidth: 1,
    borderColor: 'rgba(214,120,120,.4)',
    borderRadius: 12,
    padding: 13,
  },
  errorBannerText: { fontFamily: Fonts.sansMedium, fontSize: 13.5, color: '#E7A9A9' },
  // flexGrow pins the CTA to the bottom on short steps without letting it clip
  // the content on tall ones (the instrument list scrolls past a phone screen).
  body: { gap: 10, flexGrow: 1 },
  footer: { gap: 12 },
});
