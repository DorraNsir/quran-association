import { StyleSheet, View } from 'react-native';

import { radius, spacing, useAppTheme, type ColorTokens } from '@/theme';

import { AppText } from './app-text';
import { Icon, type IconName } from './icon';

/**
 * Pill tones: a soft background with a dark text of the same hue (AA contrast).
 * brand/success = green, danger = red, warning = amber, muted = neutral.
 */
export type PillTone = 'muted' | 'brand' | 'success' | 'warning' | 'danger';

export function pillColors(colors: ColorTokens, tone: PillTone): { bg: string; fg: string } {
  switch (tone) {
    case 'brand':
    case 'success':
      return { bg: colors.brandSoft, fg: colors.brandSoftForeground };
    case 'warning':
      return { bg: colors.warningSoft, fg: colors.warningSoftForeground };
    case 'danger':
      return { bg: colors.destructiveSoft, fg: colors.destructiveSoftForeground };
    default:
      return { bg: colors.muted, fg: colors.mutedForeground };
  }
}

/** Web Badge: a small rounded label (optional icon; colour is never the only signal). */
export function Pill({ label, tone = 'muted', icon }: { label: string; tone?: PillTone; icon?: IconName }) {
  const { colors } = useAppTheme();
  const { bg, fg } = pillColors(colors, tone);
  return (
    <View style={[styles.pill, { backgroundColor: bg }]} testID={`pill-${tone}`}>
      {icon ? <Icon name={icon} size={12} color={fg} /> : null}
      <AppText variant="caption" style={{ color: fg }}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
  },
});
