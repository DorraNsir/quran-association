import { StyleSheet, View } from 'react-native';

import { radius, spacing, useAppTheme } from '@/theme';

import { AppText } from './app-text';
import { Icon } from './icon';

/** Web Alert / FormErrorAlert: an inline message next to the action. */
export function AlertBox({
  message,
  tone = 'destructive',
}: {
  message: string;
  tone?: 'destructive' | 'info';
}) {
  const { colors } = useAppTheme();
  const destructive = tone === 'destructive';
  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      accessibilityLabel={message}
      style={[
        styles.root,
        {
          backgroundColor: destructive ? colors.destructiveSoft : colors.brandSoft,
          borderColor: destructive ? colors.destructive : colors.ring,
        },
      ]}>
      <Icon
        name={destructive ? 'error' : 'success'}
        size={18}
        color={destructive ? colors.destructive : colors.brandSoftForeground}
      />
      <AppText
        variant="caption"
        style={[styles.text, { color: destructive ? colors.destructive : colors.brandSoftForeground }]}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  text: { flex: 1 },
});
