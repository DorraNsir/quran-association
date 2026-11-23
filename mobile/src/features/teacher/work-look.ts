import type { IconName } from '@/components/ui';
import type { ColorTokens } from '@/theme';

import type { RecitationEntry, WorkItemStatus, WorkPerformance, WorkType } from '../quran-reference/work-assignment';

/*
 * «متابعة برنامج العمل» — one look per meaning, shared by the list cards and the program screen.
 * Work types keep their own soft colours (purple is the عرضة TYPE, never an action or a result);
 * results and the overall level use the status colours; primary actions stay green (Button).
 */
type Look = { icon: IconName; bg: keyof ColorTokens; fg: keyof ColorTokens };

/** حفظ blue · مراجعة teal · عرضة purple · اختبار amber */
export const TYPE_LOOK: Record<WorkType, Look> = {
  MEMORIZATION: { icon: 'memorization', bg: 'memorizationSoft', fg: 'memorizationForeground' },
  REVISION: { icon: 'revision', bg: 'revisionSoft', fg: 'revisionForeground' },
  RECITATION: { icon: 'recitation', bg: 'recitationSoft', fg: 'recitationForeground' },
  EXAM: { icon: 'exam', bg: 'examSoft', fg: 'examForeground' },
};

/** «التقييم العام»: the level only, with an icon of its own. */
export const LEVEL_LOOK: Record<WorkPerformance, Look> = {
  EXCELLENT: { icon: 'trophy', bg: 'brandSoft', fg: 'brandSoftForeground' },
  VERY_GOOD: { icon: 'thumbsUp', bg: 'infoSoft', fg: 'infoSoftForeground' },
  GOOD: { icon: 'star', bg: 'warningSoft', fg: 'warningSoftForeground' },
  NEEDS_IMPROVEMENT: { icon: 'improve', bg: 'destructiveSoft', fg: 'destructiveSoftForeground' },
};

/** Results of the items (icon + words, never colour alone): منجز green, جزئي amber, غير منجز red, مؤجل sky, ملغى / pending gray. */
export const RESULT_LOOK: Record<WorkItemStatus, Look> = {
  COMPLETED: { icon: 'success', bg: 'brandSoft', fg: 'brandSoftForeground' },
  PARTIAL: { icon: 'partial', bg: 'warningSoft', fg: 'warningSoftForeground' },
  NOT_COMPLETED: { icon: 'notDone', bg: 'destructiveSoft', fg: 'destructiveSoftForeground' },
  POSTPONED: { icon: 'clock', bg: 'infoSoft', fg: 'infoSoftForeground' },
  CANCELLED: { icon: 'ban', bg: 'muted', fg: 'mutedForeground' },
  NOT_EVALUATED: { icon: 'pending', bg: 'muted', fg: 'mutedForeground' },
};

/** «متابعة العرضات»: one look per recitation result (the same status colours, never the عرضة purple). */
export const RECITATION_LOOK: Record<RecitationEntry, Look> = {
  COMPLETED: RESULT_LOOK.COMPLETED,
  PARTIAL: RESULT_LOOK.PARTIAL,
  NOT_COMPLETED: RESULT_LOOK.NOT_COMPLETED,
  CANCELLED: RESULT_LOOK.CANCELLED,
  POSTPONED: RESULT_LOOK.POSTPONED,
  PENDING: RESULT_LOOK.NOT_EVALUATED,
  SESSION_CANCELLED: { icon: 'ban', bg: 'muted', fg: 'mutedForeground' },
};
