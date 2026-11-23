import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { AppText, Icon } from '@/components/ui';
import { ar } from '@/i18n/ar';
import { radius, spacing, touchTarget, useAppTheme } from '@/theme';

import { recitationsCount, recitationSummaryText } from '../quran-reference/work-assignment';
import { surahByNumber } from '../quran/surahs';
import type { RecitationSummary } from './work-types';

/** «سورة المجادلة · 3 عرضات» (the web's wording). */
export const recitationText = (r: RecitationSummary) => recitationSummaryText(`سورة ${surahByNumber(r.surah)?.nameAr ?? r.surah}`, r.attempts);

/**
 * «سجل العرضات» of one structured عرضة on the program screen (server values): a soft row in the
 * عرضة colour — the history on one side, how many recitations of the surah were done
 * («عرضة واحدة» / «3 عرضات») on the other — opening the surah's history.
 */
export function RecitationLine({ recitation, studentId }: { recitation: RecitationSummary; studentId: string }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const text = recitationText(recitation);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${ar.work.recitationHistory} — ${text}`}
      onPress={() =>
        // «متابعة العرضات»: this student chosen, this surah open
        router.push({ pathname: '/teacher/recitations', params: { studentId, surah: String(recitation.surah) } })
      }
      style={({ pressed }) => [styles.row, { backgroundColor: colors.recitationSoft }, pressed && styles.pressed]}>
      <Icon name="history" size={18} color={colors.recitationForeground} />
      <AppText variant="label" style={[styles.flex, { color: colors.recitationForeground }]}>
        {ar.work.recitationHistory}
      </AppText>
      <AppText variant="small" tone="muted" testID="recitation-line">
        {recitationsCount(recitation.attempts)}
      </AppText>
      <Icon name="forward" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  flex: { flex: 1 },
  pressed: { opacity: 0.8 },
});
