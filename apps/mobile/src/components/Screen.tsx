import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Layout } from '@/theme';

interface ScreenProps {
  children: ReactNode;
  /** Wrap content in a vertical ScrollView (default) or a static View. */
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}

/**
 * Shared screen chrome: the dark navy gradient phone surface plus a top safe-area
 * inset and consistent horizontal padding, matching every screen in the mockup.
 */
export function Screen({ children, scroll = true, contentStyle }: ScreenProps) {
  return (
    <LinearGradient
      colors={Colors.bgGradient}
      locations={[0, 0.62, 1]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={styles.fill}>
      <SafeAreaView style={styles.fill} edges={['top']}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={[styles.content, contentStyle]}
            showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.content, styles.fill, contentStyle]}>{children}</View>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    paddingHorizontal: Layout.screenPaddingH,
    paddingTop: 8,
    paddingBottom: 36,
    gap: Layout.screenGap,
  },
});
