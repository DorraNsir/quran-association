import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Icon, type IconName } from '@/components/ui';
import { radius, spacing, useAppTheme } from '@/theme';

/** Shared layout of the empty / error states (icon bubble, title, text, action). */
export function StateLayout({
  icon,
  title,
  description,
  action,
  tone = 'muted',
}: {
  icon: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: 'muted' | 'destructive';
}) {
  const { colors } = useAppTheme();
  const bubble = tone === 'destructive' ? colors.destructiveSoft : colors.muted;
  const iconColor = tone === 'destructive' ? colors.destructive : colors.mutedForeground;
  return (
    <View style={styles.root} accessibilityRole="summary">
      <View style={[styles.bubble, { backgroundColor: bubble }]}>
        <Icon name={icon} size={24} color={iconColor} />
      </View>
      <View style={styles.texts}>
        <AppText variant="bodyStrong" center>
          {title}
        </AppText>
        {description ? (
          <AppText variant="caption" tone="muted" center>
            {description}
          </AppText>
        ) : null}
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  bubble: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { gap: spacing.xs, maxWidth: 360 },
});
