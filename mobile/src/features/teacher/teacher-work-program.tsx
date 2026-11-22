import { Stack, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { EmptyState, QueryState } from '@/components/feedback';
import { AlertBox, AppText, Button, Card, Icon, InitialsAvatar, Screen, type IconName } from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { usePreferences } from '@/features/preferences/preferences';
import { ar } from '@/i18n/ar';
import { ApiError } from '@/services/api';
import { radius, spacing, touchTarget, useAppTheme, type ColorTokens } from '@/theme';
import { headerTitle } from '@/theme/navigation';

import { completionParts, completionText, PERFORMANCE_LABEL } from '../quran-reference/work-assignment';
import { platformDateOf } from './memorization-model';
import { OverallEvaluationCard } from './overall-evaluation-card';
import { RecitationLine } from './recitation-line';
import { useEvaluationBlock } from './use-evaluation-block';
import { usePullToRefresh } from './use-refresh';
import { useWorkProgram, workProgramKey } from './use-work';
import { ownDescription, WorkAssignmentView } from './work-assignment-view';
import { WorkSessionLine, WorkStatusBadge, WorkTypeBadge } from './work-badges';
import { LEVEL_LOOK, RESULT_LOOK } from './work-look';
import { isTransferable, phaseOf, shortDate, studentName } from './work-model';
import type { WorkItem, WorkItemLink, WorkProgram } from './work-types';

const w = ar.work;

/** 404 / 403 / 400 (a program outside my scope, or a malformed id) — "not found" for me, as on the web. */
export const isUnavailable = (error: unknown) =>
  error instanceof ApiError && (error.isNotFound || error.isForbidden || error.status === 400);

/**
 * «تفاصيل برنامج العمل» (GET /teacher/work-programs/:id):
 *   summary   the student (photo, name, class, session), the overall level, and «ملخص الأعمال» —
 *             one counter per result present, EVERY item counted (never «all done» with dropped work);
 *   items     one card each, in full: kind and result, the Quranic range and its size, the evaluator
 *             and date, the evaluation notes, the recitation history, links to the other programs
 *             (carried / next recitation) and the actions the API allows;
 *   then      «التقييم العام», the teacher notes; the two main actions stay fixed at the bottom.
 * Writes open their own screens; the server re-checks the team and the roster each time.
 */
export function TeacherWorkProgramScreen({ programId }: { programId: string }) {
  const { user } = useSession();
  const teacherId = user?.teacherId ?? '';
  const router = useRouter();
  const { colors } = useAppTheme();
  const timeZone = usePreferences().data?.timezone;
  const query = useWorkProgram(teacherId, programId);
  const { refreshing, onRefresh } = usePullToRefresh([workProgramKey(teacherId, programId)]);
  const program = query.data;
  const blocked = useEvaluationBlock(program, timeZone);

  if (query.isError && isUnavailable(query.error))
    return (
      <Screen>
        <EmptyState
          icon="forbidden"
          title={w.notFound}
          description={w.notFoundHint}
          action={<Button variant="outline" label={w.backToList} onPress={() => router.replace('/teacher/work')} />}
        />
      </Screen>
    );

  const footer = program ? (
    <View style={[styles.footer, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {blocked ? <AlertBox tone="info" message={w.evaluationBlocked[blocked]} /> : null}
      <View style={styles.bar}>
        <View style={styles.flex}>
          <Button
            variant="outline"
            icon="edit"
            label={w.edit}
            fullWidth
            onPress={() => router.push({ pathname: '/teacher/work/[id]/edit', params: { id: program.id } })}
          />
        </View>
        <View style={styles.flex}>
          <Button
            icon="completed"
            label={w.evaluate}
            fullWidth
            disabled={program.items.length === 0 || blocked !== null}
            accessibilityHint={blocked ? w.evaluationBlocked[blocked] : undefined}
            onPress={() => router.push({ pathname: '/teacher/work/[id]/evaluate', params: { id: program.id } })}
          />
        </View>
      </View>
    </View>
  ) : undefined;

  const open = (link: WorkItemLink) =>
    link.programId !== programId && router.push({ pathname: '/teacher/work/[id]', params: { id: link.programId } });

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh} footer={footer}>
      <Stack.Screen options={{ title: headerTitle(w.detailsTitle) }} />
      <QueryState query={query}>
        {program ? (
          <>
            <SummaryCard program={program} timeZone={timeZone} />

            <AppText variant="heading" accessibilityRole="header">
              {w.itemsCount(program.items.length)}
            </AppText>
            {program.items.map((item) => (
              <ItemCard
                key={item.id}
                studentId={program.student.id}
                item={item}
                timeZone={timeZone}
                sessionStatus={program.session.status}
                onOpen={open}
                onSchedule={(mode) =>
                  router.push({ pathname: '/teacher/work/[id]/schedule', params: { id: program.id, itemId: item.id, mode } })
                }
              />
            ))}

            {/* «التقييم العام»: after the individual results, separate from them */}
            <OverallEvaluationCard
              key={program.id}
              teacherId={teacherId}
              program={program}
              blocked={blocked}
              onStale={() => void query.refetch()}
            />

            {program.generalNotes ? (
              <Card style={styles.gapXs}>
                <View style={styles.inline}>
                  <Icon name="notes" size={16} color={colors.primary} />
                  <AppText variant="label">{w.generalNotes}</AppText>
                </View>
                <AppText variant="body" selectable style={styles.text}>
                  {program.generalNotes}
                </AppText>
              </Card>
            ) : null}
            {program.lastEditedBy ? (
              <AppText variant="small" tone="muted">
                {w.lastEditedBy(program.lastEditedBy)}
              </AppText>
            ) : null}
          </>
        ) : null}
      </QueryState>
    </Screen>
  );
}

/** The student, the session, the overall level (once given) and «ملخص الأعمال». */
function SummaryCard({ program, timeZone }: { program: WorkProgram; timeZone: string | undefined }) {
  const { colors } = useAppTheme();
  const name = studentName(program);
  const level = program.overallEvaluation?.level ?? null;
  const statuses = program.items.map((i) => i.status);
  const parts = completionParts(statuses);
  return (
    <Card style={styles.summary}>
      <View style={styles.top}>
        <InitialsAvatar name={name} size={56} photoUrl={program.student.photoUrl} />
        <View style={styles.identity}>
          <AppText variant="heading" accessibilityRole="header">
            {name}
          </AppText>
          <AppText variant="small" tone="muted">
            {program.session.groupName} — {program.session.branchName}
          </AppText>
          <WorkSessionLine session={program.session} phase={phaseOf(program.session, timeZone)} />
        </View>
        {level ? (
          <View style={[styles.level, { backgroundColor: colors[LEVEL_LOOK[level].bg] }]} testID="summary-overall">
            <Icon name={LEVEL_LOOK[level].icon} size={16} color={colors[LEVEL_LOOK[level].fg]} />
            <AppText variant="label" style={{ color: colors[LEVEL_LOOK[level].fg] }}>
              {PERFORMANCE_LABEL[level]}
            </AppText>
          </View>
        ) : null}
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <View style={styles.inline}>
        <Icon name="summary" size={18} color={colors.primary} />
        <AppText variant="bodyStrong" accessibilityRole="header" style={styles.flex}>
          {w.itemsSummary}
        </AppText>
        <View style={[styles.count, { backgroundColor: colors.muted }]}>
          <AppText variant="label">{w.itemsTotal(program.items.length)}</AppText>
        </View>
      </View>
      {parts.length ? (
        // Every item counted — «1 منجز · 1 ملغى», never «all done» when some were dropped
        <View style={styles.counters} accessible accessibilityLabel={`${w.itemsSummary}: ${completionText(statuses)}`} testID="items-summary">
          {parts.map((part) => {
            const look = RESULT_LOOK[part.status];
            return (
              <View key={part.status} style={[styles.counter, { backgroundColor: colors[look.bg] }]} testID={`summary-${part.status}`}>
                <View style={styles.inline}>
                  <Icon name={look.icon} size={18} color={colors[look.fg]} />
                  <AppText variant="heading" style={{ color: colors[look.fg] }}>
                    {part.count}
                  </AppText>
                </View>
                <AppText variant="small" style={{ color: colors[look.fg] }}>
                  {part.label}
                </AppText>
              </View>
            );
          })}
        </View>
      ) : (
        <AppText variant="small" tone="muted">
          {w.itemsTotal(0)}
        </AppText>
      )}
    </Card>
  );
}

/** One work item in full (a details page: nothing useful is dropped to make it smaller). */
function ItemCard({
  item,
  studentId,
  timeZone,
  sessionStatus,
  onOpen,
  onSchedule,
}: {
  item: WorkItem;
  studentId: string;
  timeZone: string | undefined;
  sessionStatus: WorkProgram['session']['status'];
  onOpen: (link: WorkItemLink) => void;
  onSchedule: (mode: 'carry' | 'next') => void;
}) {
  const { colors } = useAppTheme();
  const dates = (links: WorkItemLink[]) => links.map((l) => shortDate(l.sessionDate)).join('، ');
  const note = ownDescription(item);
  const evaluatedOn = item.evaluatedAt ? shortDate(platformDateOf(item.evaluatedAt, timeZone)) : null;
  const transferable = isTransferable(item.status, sessionStatus);
  const recitation = item.type === 'RECITATION';
  return (
    <Card style={styles.item}>
      <View style={styles.between}>
        <WorkTypeBadge type={item.type} recitationNumber={item.recitationNumber} large />
        <WorkStatusBadge status={item.status} large />
      </View>

      {item.assignment ? <WorkAssignmentView type={item.type} assignment={item.assignment} workload={item.workload} /> : null}
      {/* Legacy free text as written; for a structured item, only the teacher's own note */}
      {note ? (
        <AppText variant={item.assignment ? 'body' : 'bodyStrong'} selectable tone={item.assignment ? 'muted' : 'default'} style={styles.text}>
          {note}
        </AppText>
      ) : null}

      {item.evaluatedBy && evaluatedOn ? (
        <View style={styles.meta} accessible accessibilityLabel={w.evaluatedBy(item.evaluatedBy, evaluatedOn)} testID="item-evaluated">
          <View style={[styles.inline, styles.flex]}>
            <Icon name="user" size={15} color={colors.mutedForeground} />
            <AppText variant="small" tone="muted" numberOfLines={1} style={styles.flex}>
              {item.evaluatedBy}
            </AppText>
          </View>
          <View style={[styles.metaDivider, { backgroundColor: colors.border }]} />
          <View style={styles.inline}>
            <Icon name="calendar" size={15} color={colors.mutedForeground} />
            <AppText variant="small" tone="muted">
              {evaluatedOn}
            </AppText>
          </View>
        </View>
      ) : null}

      {item.evaluationComment ? (
        <View style={[styles.box, { backgroundColor: colors.muted }]}>
          <View style={styles.inline}>
            <Icon name="notes" size={15} color={colors.mutedForeground} />
            <AppText variant="label">{w.evaluationNotes}</AppText>
          </View>
          <AppText variant="body" selectable style={styles.text}>
            {item.evaluationComment}
          </AppText>
        </View>
      ) : null}

      {/* «سجل العرضات»: this surah's recitations, opening its full history (none for a legacy عرضة) */}
      {item.recitation ? <RecitationLine recitation={item.recitation} studentId={studentId} /> : null}

      {item.carriedFrom ? (
        <LinkRow
          icon="transfer"
          title={item.carriedFrom.status === 'NOT_EVALUATED' ? w.linkCarriedFromCancelled : w.linkCarriedFrom}
          detail={
            item.carriedFrom.status === 'NOT_EVALUATED'
              ? shortDate(item.carriedFrom.sessionDate)
              : `${shortDate(item.carriedFrom.sessionDate)} — ${w.status[item.carriedFrom.status]}`
          }
          label={
            item.carriedFrom.status === 'NOT_EVALUATED'
              ? w.carriedFromCancelled(shortDate(item.carriedFrom.sessionDate))
              : w.carriedFrom(shortDate(item.carriedFrom.sessionDate), w.status[item.carriedFrom.status])
          }
          onPress={() => onOpen(item.carriedFrom!)}
        />
      ) : null}
      {item.continuedFrom ? (
        <LinkRow
          icon="recitation"
          title={w.linkContinuedFrom}
          detail={shortDate(item.continuedFrom.sessionDate)}
          label={w.continuedFrom(shortDate(item.continuedFrom.sessionDate))}
          onPress={() => onOpen(item.continuedFrom!)}
        />
      ) : null}
      {item.carriedTo.length ? (
        <LinkRow
          icon="transfer"
          title={w.linkCarriedTo}
          detail={dates(item.carriedTo)}
          label={w.carriedTo(dates(item.carriedTo))}
          onPress={() => onOpen(item.carriedTo[0]!)}
        />
      ) : null}
      {item.continuedBy.length ? (
        <LinkRow
          icon="calendar"
          tone="brand"
          title={w.linkContinuedBy}
          detail={w.scheduledOn(dates(item.continuedBy))}
          label={w.continuedBy(dates(item.continuedBy))}
          onPress={() => onOpen(item.continuedBy[0]!)}
        />
      ) : null}

      {transferable || recitation ? (
        <View style={styles.actions}>
          {/* Primary actions stay green (the app's colour): purple only marks the عرضة type */}
          {recitation ? (
            <View style={styles.action}>
              <Button icon="recitation" label={w.next} fullWidth accessibilityLabel={`${w.next}: ${item.description}`} onPress={() => onSchedule('next')} />
            </View>
          ) : null}
          {transferable ? (
            <View style={styles.action}>
              <Button
                variant="outline"
                icon="transfer"
                label={w.carry}
                fullWidth
                accessibilityLabel={`${w.carry}: ${item.description}`}
                onPress={() => onSchedule('carry')}
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

/** A link to the other program of a carried / continued item: title · detail, the whole row opens it. */
function LinkRow({
  icon,
  title,
  detail,
  label,
  tone = 'muted',
  onPress,
}: {
  icon: IconName;
  title: string;
  detail: string;
  /** The full sentence, for screen readers */
  label: string;
  tone?: 'muted' | 'brand';
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const bg: keyof ColorTokens = tone === 'brand' ? 'brandSoft' : 'muted';
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint={w.openLinked}
      onPress={onPress}
      style={({ pressed }) => [styles.link, { backgroundColor: colors[bg] }, pressed && styles.pressed]}>
      <Icon name={icon} size={18} color={colors.primary} />
      <AppText variant="label" style={styles.shrink}>
        {title}
      </AppText>
      <View style={styles.flex} />
      <AppText variant="small" tone="muted" style={styles.shrink}>
        {detail}
      </AppText>
      <Icon name="forward" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  summary: { gap: spacing.md },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  identity: { flex: 1, minWidth: 0, gap: 2 },
  level: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 6 },
  divider: { height: StyleSheet.hairlineWidth },
  count: { borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 2 },
  counters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  counter: { flexGrow: 1, flexBasis: '30%', alignItems: 'center', gap: 2, borderRadius: radius.lg, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  item: { gap: spacing.sm },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  text: { lineHeight: 26 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metaDivider: { width: StyleSheet.hairlineWidth * 2, height: 16 },
  box: { gap: 2, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  link: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  shrink: { flexShrink: 1 },
  pressed: { opacity: 0.8 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingTop: spacing.xs },
  action: { flexGrow: 1, flexBasis: '45%' },
  gapXs: { gap: spacing.xs },
  footer: {
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  bar: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
