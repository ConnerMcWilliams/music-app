import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts, Radius } from '@/theme';
import { Icon } from './Icon';

interface SectionCardProps {
  /** Leading badge number — a section number, or a study's position. */
  badge: number;
  title: string;
  /** Optional descriptor line under the title. */
  subtitle?: string;
  /** Optional small right-aligned label (e.g. a study count, or the key). */
  meta?: string;
  onPress?: () => void;
}

/**
 * A single catalog row, shared by the Studies browse list (a Clarke Study) and
 * the section-detail list (one exercise within a Study). Same look in both;
 * the only difference is what the caller passes for `subtitle`/`meta`.
 */
export function SectionCard({ badge, title, subtitle, meta, onPress }: SectionCardProps) {
  const inner = (
    <View style={styles.card}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{badge}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        {!!subtitle && (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>
      {!!meta && <Text style={styles.meta}>{meta}</Text>}
      <Icon name="chevron-right" size={20} color={Colors.gold} strokeWidth={1.8} />
    </View>
  );

  if (!onPress) {
    return inner;
  }

  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: Radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    backgroundColor: Colors.surface,
    borderColor: Colors.mutedBorder,
  },
  pressed: { opacity: 0.85 },
  badge: {
    width: 46,
    height: 46,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(228,197,126,.12)',
    borderWidth: 1,
    borderColor: 'rgba(201,162,74,.3)',
  },
  badgeText: {
    fontFamily: Fonts.serifBold,
    fontSize: 21,
    color: Colors.gold,
  },
  body: { flex: 1 },
  title: {
    fontFamily: Fonts.sansSemibold,
    fontSize: 15,
    color: Colors.textCream,
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  meta: {
    fontFamily: Fonts.sansSemibold,
    fontSize: 12,
    color: Colors.textMuted,
  },
});
