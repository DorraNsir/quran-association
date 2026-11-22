import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Icon } from '@/components/ui';
import { ar } from '@/i18n/ar';
import { spacing, touchTarget, useAppTheme } from '@/theme';

import { recitationSummaryText } from '../quran-reference/work-assignment';
import { surahByNumber } from '../quran/surahs';
import type { RecitationSummary } from './work-types';

/** «سورة المجادلة · 3 عرضات» (the web's wording). */
export const recitationText = (r: RecitationSummary) => recitationSummaryText(`سورة ${surahByNumber(r.surah)?.nameAr ?? r.surah}`, r.attempts);

/**
 * «متابعة العرضات» of one structured عرضة, compact (server values), with «سجل العرضات» opening the
 * surah's history unless `compact` (list rows).
 */
export function RecitationLine({ recitation, studentId, compact }: { recitation: RecitationSummary; studentId: string; compact?: boolean }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const text = recitationText(recitation);
  return (
    <View style={styles.row}>
      <Icon name="recitation" size={14} color={colors.primary} />
      <AppText variant="small" tone="muted" testID="recitation-line" accessibilityLabel={`${ar.work.recitations}: ${text}`}>
        {text}
      </AppText>
      {!compact ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${ar.work.recitationHistory} — ${text}`}
          hitSlop={8}
          style={styles.link}
          onPress={() =>
            router.push({ pathname: '/teacher/students/[id]/recitations', params: { id: studentId, surah: String(recitation.surah) } })
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
