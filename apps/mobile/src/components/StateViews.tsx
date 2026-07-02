import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts } from '@/theme';

/**
 * Reusable loading / empty / error placeholders. The mock screens drive these
 * via `useMockQuery` so the UI exercises real async states (acceptance criterion),
 * and they'll keep working unchanged once a real data layer is added.
 */

interface StateViewProps {
  message?: string;
}

export function LoadingState({ message = 'Loading…' }: StateViewProps) {
  return (
    <View style={styles.container}>
      <ActivityIndicator color={Colors.gold} />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

export function EmptyState({
  title = 'Nothing here yet',
  message = 'Check back after your next practice session.',
}: {
  title?: string;
  message?: string;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

export function ErrorState({
  message = 'Something went wrong while loading.',
  onRetry,
}: StateViewProps & { onRetry?: () => void }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Couldn’t load</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry && (
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 48,
  },
  title: {
    fontFamily: Fonts.sansSemibold,
    fontSize: 15,
    color: Colors.textCream,
  },
  message: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    maxWidth: 240,
  },
  retry: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.goldBorderStrong,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 18,
  },
  retryPressed: { opacity: 0.6 },
  retryText: {
    fontFamily: Fonts.sansSemibold,
    fontSize: 13,
    color: Colors.gold,
  },
});
