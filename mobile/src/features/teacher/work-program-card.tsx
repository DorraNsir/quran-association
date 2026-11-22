import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Icon, InitialsAvatar } from '@/components/ui';
import { ar } from '@/i18n/ar';
import { radius, spacing, useAppTheme } from '@/theme';

import {
  completionParts,
  completionText,
  PERFORMANCE_LABEL,
  workTypeBadges,
} from '../quran-reference/work-assignment';
import { LEVEL_LOOK, RESULT_LOOK, TYPE_LOOK } from './work-look';
import { sessionDay, studentName } from './work-model';
import type { WorkProgram } from './work-types';

const w = ar.work;

/** Results on the card: the text colour only (no background). */
const RESULT_FG = {
  COMPLETED: 'primary',
  PARTIAL: 'warning',
  NOT_COMPLETED: 'destructive',
  POSTPONED: 'infoSoftForeground',
  CANCELLED: 'mutedForeground',
  NOT_EVALUATED: 'mutedForeground',
} as const;

/**
 * ONE work program as one card (the whole card opens it):
 *   top-right  photo (or initial), name, class, the session's full date «الأحد 15 نوفمبر 2026»;
 *   top-left   the overall evaluation, the level only (none until given);
 *   middle     the kinds of work as soft badges («اختبار (2)»);
 *   bottom     the items' results «1 منجز · 4 ملغاة», and a chevron.
 * Nothing else (no workload, no recitation history, no last editor): those are on its screen.
 */
export function WorkProgramCard({ program: p, onPress }: { program: WorkProgram; onPress: () => void }) {
  const { colors } = useAppTheme();
  const name = studentName(p);
  const date = sessionDay(p.session);
  const level = p.overallEvaluation?.level ?? null;
  const badges = workTypeBadges(p.items.map((i) => i.type));
  const statuses = p.items.map((i) => i.status);
  const parts = completionParts(statuses);
  const label = [
    `${w.detailTitle} ${name}`,
    p.session.groupName,
    date,
    badges.map((b) => b.label).join('، '),
    completionText(statuses),
    level ? PERFORMANCE_LABEL[level] : null,
  ]
    .filter(Boolean)
    .join(' — ');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={`program-${p.id}`}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.foreground },
        pressed && { backgroundColor: colors.accent },
      ]}>
      <View style={styles.top}>
        <InitialsAvatar name={name} size={52} photoUrl={p.student.photoUrl} />
        <View style={styles.identity}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {name}
          </AppText>
          <AppText variant="small" tone="muted" numberOfLines={1}>
            {p.session.groupName}
          </AppText>
          <View style={styles.inline}>
            <Icon name="calendar" size={14} color={colors.mutedForeground} />
            {/* the full date, never shortened */}
            <AppText variant="small" tone="muted" testID="card-date">
              {date}
            </AppText>
          </View>
        </View>
        {level ? (
          <View style={[styles.level, { backgroundColor: colors[LEVEL_LOOK[level].bg] }]} testID="card-overall">
            <Icon name={LEVEL_LOOK[level].icon} size={14} color={colors[LEVEL_LOOK[level].fg]} />
            <AppText variant="label" style={{ color: colors[LEVEL_LOOK[level].fg] }}>
              {PERFORMANCE_LABEL[level]}
            </AppText>
          </View>
        ) : null}
      </View>

      {badges.length ? (
        <View style={styles.badges}>
          {badges.map((b) => (
            <View key={b.type} testID={`card-type-${b.type}`} style={[styles.badge, { backgroundColor: colors[TYPE_LOOK[b.type].bg] }]}>
              <Icon name={TYPE_LOOK[b.type].icon} size={14} color={colors[TYPE_LOOK[b.type].fg]} />
              <AppText variant="label" style={{ color: colors[TYPE_LOOK[b.type].fg] }}>
                {b.label}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}

      <View style={[styles.bottom, { borderTopColor: colors.border }]}>
        <View style={styles.results}>
          {parts.map((part, i) => (
            <View key={part.status} style={styles.inline}>
              {i > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
              <Icon name={RESULT_LOOK[part.status].icon} size={16} color={colors[RESULT_FG[part.status]]} />
              <AppText variant="label" style={{ color: colors[RESULT_FG[part.status]] }} testID={`card-result-${part.status}`}>
                {part.text}
              </AppText>
            </View>
          ))}
        </View>
        <Icon name="forward" size={18} color={colors.mutedForeground} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.sm,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  identity: { flex: 1, minWidth: 0, gap: 2 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  level: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.full, paddingHorizontal: spacing.sm + 2, paddingVertical: 4 },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm },
  results: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.sm, rowGap: 4 },
  divider: { width: 1, height: 14, marginEnd: spacing.xs },
});
