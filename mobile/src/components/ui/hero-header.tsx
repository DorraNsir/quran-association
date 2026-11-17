import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ar } from '@/i18n/ar';
import { radius, spacing, useAppTheme } from '@/theme';

import { AppText } from './app-text';
import { LogoMark } from './logo';

/**
 * Branded workspace header (replaces the plain navigation bar on a
 * workspace's home): logo, association name and the workspace title on the
 * deep logo green, with the web login page's gold accent as its lower edge.
 * Draws under the status bar and pads by the safe-area inset itself.
 */
export function HeroHeader({ title, action }: { title: string; action?: ReactNode }) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="header"
      style={[
        styles.root,
        {
          backgroundColor: colors.heroBackground,
          borderColor: colors.gold,
          paddingTop: insets.top + spacing.md,
        },
      ]}>
      <View style={styles.logoBox}>
        <LogoMark size={40} />
      </View>
      <View style={styles.texts}>
        <AppText variant="small" style={{ color: colors.heroMuted }} numberOfLines={1}>
          {ar.appName}
        </AppText>
        <AppText variant="heading" style={{ color: colors.heroForeground }} numberOfLines={1}>
          {title}
        </AppText>
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radius.xl * 2,
    borderBottomRightRadius: radius.xl * 2,
    borderBottomWidth: 3,
  },
  logoBox: {
    width: 52,
    height: 52,
    borderRadius: radius.xl,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, gap: 2 },
});
