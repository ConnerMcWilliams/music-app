import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, Screen } from '@/components';
import { useAuth } from '@/context/AuthContext';
import { Colors, Fonts, Radius } from '@/theme';

/**
 * Minimal account screen: shows the signed-in user's display name + email and
 * a logout action. Profile editing and richer stats are intentionally out of
 * scope for the auth foundation.
 */
export default function AccountScreen() {
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

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
        <Row icon="user" label="Display name" value={user?.displayName || '—'} />
        <View style={styles.divider} />
        <Row icon="mail" label="Email" value={user?.email || '—'} />
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

function Row({ icon, label, value }: { icon: 'user' | 'mail'; label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Icon name={icon} size={19} color={Colors.textMuted} />
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    </View>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16 },
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
