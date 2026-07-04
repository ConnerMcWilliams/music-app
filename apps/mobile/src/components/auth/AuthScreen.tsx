import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components';
import { Colors, Fonts, Layout } from '@/theme';

interface AuthScreenProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  /** Non-field server error shown above the form. */
  formError?: string | null;
}

/**
 * Shared chrome for the login/register screens: brand mark, heading, a
 * keyboard-safe scrollable body, and an optional top-level error banner.
 */
export function AuthScreen({ title, subtitle, children, formError }: AuthScreenProps) {
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
            <View style={styles.brand}>
              <Icon name="logo" size={30} color={Colors.gold} />
              <Text style={styles.brandName}>Clarke Coach</Text>
            </View>

            <View style={styles.heading}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>

            {formError ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{formError}</Text>
              </View>
            ) : null}

            <View style={styles.form}>{children}</View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    paddingHorizontal: Layout.screenPaddingH,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 22,
    flexGrow: 1,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandName: {
    fontFamily: Fonts.serif,
    fontSize: 20,
    color: Colors.textCream,
    letterSpacing: 0.3,
  },
  heading: { gap: 6, marginTop: 8 },
  title: { fontFamily: Fonts.serifBold, fontSize: 32, color: Colors.textCream },
  subtitle: { fontFamily: Fonts.sans, fontSize: 14.5, color: Colors.textMuted, lineHeight: 20 },
  errorBanner: {
    backgroundColor: 'rgba(214,120,120,.12)',
    borderWidth: 1,
    borderColor: 'rgba(214,120,120,.4)',
    borderRadius: 12,
    padding: 13,
  },
  errorBannerText: { fontFamily: Fonts.sansMedium, fontSize: 13.5, color: '#E7A9A9' },
  form: { gap: 18 },
});
