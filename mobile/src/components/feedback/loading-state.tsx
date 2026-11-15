import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { ar } from '@/i18n/ar';
import { spacing, useAppTheme } from '@/theme';

export function LoadingState({ label = ar.states.loading }: { label?: string }) {
  const { colors } = useAppTheme();
  return (
    <View
      style={styles.root}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}>
      <ActivityIndicator color={colors.primary} />
      <AppText variant="caption" tone="muted">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
  },
});
