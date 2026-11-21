import { StyleSheet, View } from 'react-native';

import { AppText, Icon } from '@/components/ui';
import { ar } from '@/i18n/ar';
import { spacing, useAppTheme } from '@/theme';

import {
  assignmentSummary,
  isDefaultDescription,
  workloadSummary,
  type WorkAssignment,
  type WorkloadSnapshot,
  type WorkType,
} from '../quran-reference/work-assignment';
import { surahByNumber } from '../quran/surahs';
import { recitationOrdinal } from './work-model';

const nameOf = (n: number) => surahByNumber(n)?.nameAr ?? String(n);

/** The item's own text, unless it is just the server's default wording of its assignment (the web's rule). */
export function ownDescription(item: {
  type: WorkType;
  description: string;
  recitationNumber: number | null;
  assignment: WorkAssignment | null;
}): string | null {
  if (!item.assignment) return item.description;
  // today's default wording, or the one an older item was saved with
  const generated = isDefaultDescription(
    item.description,
    item.type,
    item.assignment,
    nameOf,
    item.recitationNumber ? recitationOrdinal(item.recitationNumber) : null,
  );
  return generated ? null : item.description;
}

/**
 * A structured item (cards and the program screen alike):
 *   primary   «سورة مريم: من الآية 12 إلى الآية 50»
 *   secondary «39 آية · بين صفحتين و3 صفحات» / «16 حزبًا تقريبًا · 159 صفحة» — the server's workload,
 *             never more precise than it said (exact as such, «تقريبًا» when rounded by the server,
 *             bounded as «بين … و…» / «أقل من …», unavailable left out); in hizbs from one hizb;
 *             verse count below 100 only; the exact total page count as a lighter hint.
 * No per-item verification sentence (the status stays in the data).
 */
export function WorkAssignmentView({
  type,
  assignment,
  workload,
}: {
  type: WorkType;
  assignment: WorkAssignment;
  workload: WorkloadSnapshot | null;
  /** Lists and the program screen now render the same compact line (kept for callers) */
  compact?: boolean;
}) {
  const { colors } = useAppTheme();
  const summary = workload ? workloadSummary(type, workload) : null;
  return (
    <View style={styles.gap}>
      <View style={styles.row}>
        <Icon name="classes" size={16} color={colors.primary} />
        <AppText variant="bodyStrong" style={styles.flex}>
          {assignmentSummary(type, assignment, nameOf)}
        </AppText>
      </View>
      {summary?.text ? (
        <AppText
          variant="small"
          tone="muted"
          testID={summary.exact ? 'workload-exact' : 'workload-bounded'}
          accessibilityLabel={`${ar.work.workload}: ${summary.text}${summary.hint ? ` — ${ar.work.totalPages}: ${summary.hint}` : ''}`}>
          {/* The exact total page count, on the same line and lighter (no extra height) */}
          {summary.hint ? (
            <>
              {summary.text}
              <AppText variant="caption" tone="muted" testID="workload-page-hint" style={styles.hint}>
                {` · ${summary.hint}`}
              </AppText>
            </>
          ) : (
            summary.text
          )}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: 2 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  flex: { flex: 1 },
  hint: { opacity: 0.8 },
});
