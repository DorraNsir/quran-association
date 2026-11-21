import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Icon } from '@/components/ui';
import { ar } from '@/i18n/ar';
import { spacing, touchTarget, useAppTheme } from '@/theme';

import { cycleSummaryText } from '../quran-reference/work-assignment';
import type { RecitationCycleSummary } from './work-types';

/**
 * «متابعة العرضات» of one عرضة item, compact: «الدورة الأولى · 3/4 ناجحة» (server values, the web's
 * wording), with «سجل العرضات» opening the surah's full history unless `compact` (list cards).
 */
export function RecitationCycleLine({ cycle, studentId, compact }: { cycle: RecitationCycleSummary; studentId: string; compact?: boolean }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const text = cycleSummaryText(cycle);
  return (
    <View style={styles.row}>
      <Icon name="revision" size={14} color={colors.primary} />
      <AppText variant="small" tone="muted" testID="recitation-cycle" accessibilityLabel={`${ar.work.recitations}: ${text}`}>
        {text}
      </AppText>
      {!compact ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${ar.work.recitationHistory} — ${text}`}
          hitSlop={8}
          style={styles.link}
          onPress={() =>
            router.push({ pathname: '/teacher/students/[id]/recitations', params: { id: studentId, surah: String(cycle.surah) } })
          }>
          <AppText variant="small" tone="primary">
            {ar.work.recitationHistory}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  link: { minHeight: touchTarget, justifyContent: 'center', paddingHorizontal: spacing.xs },
});
