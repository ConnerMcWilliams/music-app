import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName, Screen } from '@/components';
import { useAuth } from '@/context/AuthContext';
import { instrumentLabel } from '@/data';
import { EMPTY_PREFERENCES, fetchPreferences, type Preferences } from '@/services/preferences';
import { Colors, Fonts, Radius } from '@/theme';

const EXPERIENCE_LABELS: Record<string, string> = {
  under_1: 'Less than a year',
  y1_3: '1–3 years',
  y3_7: '3–7 years',
  over_7: '7+ years',
};

const GOAL_LABELS: Record<string, string> = {
  tone: 'Better tone and control',
  range: 'Extend my range',
  endurance: 'Build endurance',
  technique: 'Faster, cleaner technique',
  consistency: 'Practice consistently',
  audition: 'Prepare for an audition',
};

/** `HH:MM:SS` → a friendly 12-hour label. */
function reminderLabel(preferences: Preferences): string {
  if (!preferences.reminderEnabled || !preferences.reminderTime) return 'Off';
  const [hourText, minuteText] = preferences.reminderTime.split(':');
  const hour = Number(hourText);
  const suffix = hour < 12 ? 'am' : 'pm';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minuteText} ${suffix}`;
}

/**
 * Account screen: identity, the onboarding answers, and logout.
 *
 * Each preference row opens the onboarding step that owns that question with
 * `?edit=1`, so there is exactly one implementation of each question rather than
 * a second set of forms here.
 */
export default function AccountScreen() {
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>(EMPTY_PREFERENCES);

  // Refetched on focus so a value changed in a step screen is current when the
  // user comes back here.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchPreferences()
        .then((next) => {
          if (active) setPreferences(next);
        })
        .catch(() => {
          // Leave the last known values; the rows simply show an em dash.
        });
      return () => {
        active = false;
      };
    }, []),
  );

  async function onLogout() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      // The root guard resets navigation to the auth flow once the status flips
      // to "unauthenticated"; nothing to navigate to here.
    } finally {
      setSigningOut(false);
    }
  }

  const initials = (user?.displayName || user?.email || '?').trim().charAt(0).toUpperCase();

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <Icon name="chevron-left" size={26} color={Colors.textCream} />
        </Pressable>
        <Text style={styles.headerTitle}>Account</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.name}>{user?.displayName || 'Your account'}</Text>
      </View>

      <View style={styles.card}>
        <Row
          icon="user"
          label="Display name"
          value={preferences.displayName || user?.displayName || '—'}
          onPress={() => router.push('/onboarding?edit=1')}
        />
        <View style={styles.divider} />
        <Row icon="mail" label="Email" value={user?.email || '—'} />
      </View>

      <Text style={styles.sectionLabel}>Practice preferences</Text>
      <View style={styles.card}>
        <Row
          icon="music"
          label="Instrument"
          value={instrumentLabel(preferences.instrument)}
          onPress={() => router.push('/onboarding/instrument?edit=1')}
        />
        <View style={styles.divider} />
        <Row
          icon="award"
          label="Experience"
          value={EXPERIENCE_LABELS[preferences.experienceLevel] ?? '—'}
          onPress={() => router.push('/onboarding/experience?edit=1')}
        />
        <View style={styles.divider} />
        <Row
          icon="target"
          label="Goal"
          value={GOAL_LABELS[preferences.primaryGoal] ?? '—'}
          onPress={() => router.push('/onboarding/goal?edit=1')}
        />
        <View style={styles.divider} />
        <Row
          icon="flame"
          label="Practice goal"
          value={`${preferences.practiceDaysGoal} days a week`}
          onPress={() => router.push('/onboarding/practice?edit=1')}
        />
        <View style={styles.divider} />
        <Row
          icon="clock"
          label="Daily reminder"
          value={reminderLabel(preferences)}
          onPress={() => router.push('/onboarding/practice?edit=1')}
        />
        <View style={styles.divider} />
        <Row
          icon="headphones"
          label="Clarke starting point"
          value={
            preferences.clarkeStartSection === null
              ? 'New to Clarke'
              : `Study ${preferences.clarkeStartSection}`
          }
          onPress={() => router.push('/onboarding/clarke?edit=1')}
        />
      </View>

      <Pressable
        onPress={onLogout}
        disabled={signingOut}
        accessibilityRole="button"
        style={({ pressed }) => [styles.logout, pressed && styles.logoutPressed, signingOut && styles.logoutDisabled]}>
        <Icon name="log-out" size={19} color={Colors.gold} />
        <Text style={styles.logoutText}>{signingOut ? 'Signing out…' : 'Log out'}</Text>
      </Pressable>
    </Screen>
  );
}

/** One labelled value. Tappable rows open the step that owns the question. */
function Row({
  icon,
  label,
  value,
  onPress,
}: {
  icon: IconName;
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const body = (
    <>
      <Icon name={icon} size={19} color={Colors.textMuted} />
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
      {onPress && <Icon name="chevron-right" size={18} color={Colors.textMutedDark} />}
    </>
  );

  if (!onPress) return <View style={styles.row}>{body}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. Change`}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  headerTitle: { fontFamily: Fonts.serif, fontSize: 22, color: Colors.textCream },
  identity: { alignItems: 'center', gap: 12, paddingVertical: 8 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1.5,
    borderColor: Colors.goldBorderStrong,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: Fonts.serif, fontSize: 30, color: Colors.gold },
  name: { fontFamily: Fonts.serif, fontSize: 24, color: Colors.textCream },
  card: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.mutedBorder,
    borderRadius: Radius.lg,
    paddingHorizontal: 16,
  },
  sectionLabel: {
    fontFamily: Fonts.sansMedium,
    fontSize: 11.5,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: Colors.textMutedDim,
    marginTop: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16 },
  rowPressed: { opacity: 0.65 },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontFamily: Fonts.sans, fontSize: 11.5, color: Colors.textMuted, letterSpacing: 0.3 },
  rowValue: { fontFamily: Fonts.sansMedium, fontSize: 15.5, color: Colors.textCream },
  divider: { height: 1, backgroundColor: Colors.mutedBorder },
  logout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderWidth: 1,
    borderColor: Colors.goldBorderStrong,
    borderRadius: Radius.md,
    paddingVertical: 15,
    marginTop: 4,
  },
  logoutPressed: { opacity: 0.7 },
  logoutDisabled: { opacity: 0.5 },
  logoutText: { fontFamily: Fonts.sansSemibold, fontSize: 15, color: Colors.gold },
});
