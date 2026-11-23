import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card, Icon } from '@/components/ui';
import { ar } from '@/i18n/ar';
import { radius, spacing, touchTarget, useAppTheme } from '@/theme';

import type { FeedbackSpace } from './feedback-model';

/** «الملاحظات والاقتراحات» in the account / settings area (never a bottom tab). */
export function FeedbackEntry({ space }: { space: FeedbackSpace }) {
  const router = useRouter();
  const { colors } = useAppTheme();
  return (
    <Card style={styles.card}>
      <Pressable
        onPress={() => router.push({ pathname: '/feedback', params: { space } })}
        accessibilityRole="button"
        accessibilityLabel={ar.feedback.entry}
        accessibilityHint={ar.feedback.entryHint}
        testID="feedback-entry"
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.accent }]}>
        <View style={[styles.tile, { backgroundColor: colors.brandSoft }]}>
          <Icon name="notes" size={20} color={colors.brandSoftForeground} />
        </View>
        <View style={styles.flex}>
          <AppText variant="bodyStrong">{ar.feedback.entry}</AppText>
          <AppText variant="small" tone="muted">
            {ar.feedback.entryHint}
          </AppText>
        </View>
        <Icon name="forward" size={18} color={colors.mutedForeground} />
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.xs },
  row: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.lg, padding: spacing.sm },
  tile: { width: 40, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, minWidth: 0 },
});
