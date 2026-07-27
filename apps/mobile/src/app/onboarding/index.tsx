import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { useOnboardingFlowConfig } from '@/app/onboarding/_layout';
import { firstRoute } from '@/lib/onboarding/flow';
import { Colors } from '@/theme';

/**
 * The flow's front door: forwards to whichever step comes first.
 *
 * The route guard sends everyone who still owes onboarding to `/onboarding`, so
 * something has to live here. Making it a dispatcher rather than the first
 * question is what lets *every* step be reordered or skipped from the dashboard
 * — when the name step was this screen, it was the one step that could not be.
 *
 * Renders the app's background while the config resolves, so the handoff reads
 * as the splash still being up rather than as a blank flash.
 */
export default function OnboardingEntry() {
  const { config, loading } = useOnboardingFlowConfig();

  useEffect(() => {
    if (loading) return;
    router.replace(firstRoute(config.steps));
  }, [loading, config]);

  return (
    <LinearGradient
      colors={Colors.bgGradient}
      locations={[0, 0.62, 1]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={styles.fill}>
      <View style={styles.fill} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
