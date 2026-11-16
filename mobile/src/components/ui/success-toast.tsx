import { StyleSheet, View } from 'react-native';

import { radius, spacing, useAppTheme } from '@/theme';

import { AppText } from './app-text';
import { Icon } from './icon';

/** A compact, announced success line (inside a screen's footer bar, never over the header). */
export function SuccessToast({ message }: { message: string }) {
  const { colors } = useAppTheme();
  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={message}
      style={[styles.toast, { backgroundColor: colors.brandSoft }]}>
      <Icon name="success" size={18} color={colors.brandSoftForeground} />
      <AppText variant="label" numberOfLines={2} style={[styles.text, { color: colors.brandSoftForeground }]}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  text: { flex: 1 },
});
