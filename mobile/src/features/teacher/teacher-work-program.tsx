import { Stack, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EmptyState, QueryState } from '@/components/feedback';
import { AlertBox, AppText, Button, Card, Icon, InitialsAvatar, LinkButton, Screen } from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { usePreferences } from '@/features/preferences/preferences';
import { ar } from '@/i18n/ar';
import { ApiError } from '@/services/api';
import { spacing, useAppTheme } from '@/theme';
import { headerTitle } from '@/theme/navigation';

import { platformDateOf } from './memorization-model';
import { useEvaluationBlock } from './use-evaluation-block';
import { usePullToRefresh } from './use-refresh';
import { useWorkProgram, workProgramKey } from './use-work';
import { WorkProgressView, WorkSessionLine, WorkStatusBadge, WorkTypeBadge } from './work-badges';
import { OverallEvaluationCard } from './overall-evaluation-card';
import { RecitationCycleLine } from './recitation-cycle-line';
import { ownDescription, WorkAssignmentView } from './work-assignment-view';
import { isTransferable, phaseOf, shortDate, studentName } from './work-model';
import type { WorkItem, WorkItemLink, WorkProgram } from './work-types';

const w = ar.work;

/** 404 / 403 / 400 (a program outside my scope, or a malformed id) — "not found" for me, as on the web. */
export const isUnavailable = (error: unknown) =>
  error instanceof ApiError && (error.isNotFound || error.isForbidden || error.status === 400);

/**
 * One work program in full (GET /teacher/work-programs/:id): every item with
 * its complete description, result, comment and links (carried / next
 * recitation), the teacher notes and the server's progress. Writes open
 * their own screens; the server re-checks the team and the roster each time.
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
      {program ? <Stack.Screen options={{ title: headerTitle(`${w.detailTitle} — ${studentName(program)}`) }} /> : null}
      <QueryState query={query}>
        {program ? (
          <>
            <Card style={styles.summary}>
              <View style={styles.head}>
                <InitialsAvatar name={studentName(program)} size={44} photoUrl={program.student.photoUrl} />
                <View style={styles.flex}>
                  <AppText variant="bodyStrong" accessibilityRole="header">
                    {studentName(program)}
                  </AppText>
                  <AppText variant="small" tone="muted">
                    {program.session.groupName} — {program.session.branchName}
                  </AppText>
                </View>
              </View>
              <WorkSessionLine session={program.session} phase={phaseOf(program.session, timeZone)} />
              <WorkProgressView progress={program.progress} />
            </Card>

            <AppText variant="label" accessibilityRole="header">
              {w.itemsCount(program.progress.total)}
            </AppText>
            <Card>
              {program.items.map((item, i) => (
                <ItemRow
                  key={item.id}
                  studentId={program.student.id}
                  item={item}
                  bordered={i > 0}
                  timeZone={timeZone}
                  sessionStatus={program.session.status}
                  onOpen={open}
                  onSchedule={(mode) =>
                    router.push({ pathname: '/teacher/work/[id]/schedule', params: { id: program.id, itemId: item.id, mode } })
                  }
                />
              ))}
            </Card>

            {/* «التقييم العام»: after the individual results, separate from them */}
            <OverallEvaluationCard
              key={program.id}
              teacherId={teacherId}
              program={program}
              blocked={blocked}
              onStale={() => void query.refetch()}
            />

            {program.generalNotes ? (
              <Card style={styles.notes}>
                <View style={styles.inline}>
                  <Icon name="notes" size={16} color={colors.primary} />
                  <AppText variant="label">{w.generalNotes}</AppText>
                </View>
                <AppText variant="body" selectable style={styles.text}>
                  {program.generalNotes}
                </AppText>
              </Card>
            ) : null}
            <Footnote program={program} />
          </>
        ) : null}
      </QueryState>
    </Screen>
  );
}

function Footnote({ program }: { program: WorkProgram }) {
  return program.lastEditedBy ? (
    <AppText variant="small" tone="muted">
      {w.lastEditedBy(program.lastEditedBy)}
    </AppText>
  ) : null;
}

function ItemRow({
  item,
  studentId,
  bordered,
  timeZone,
  sessionStatus,
  onOpen,
  onSchedule,
}: {
  item: WorkItem;
  studentId: string;
  bordered: boolean;
  timeZone: string | undefined;
  sessionStatus: WorkProgram['session']['status'];
  onOpen: (link: WorkItemLink) => void;
  onSchedule: (mode: 'carry' | 'next') => void;
}) {
  const { colors } = useAppTheme();
  const dates = (links: WorkItemLink[]) => links.map((l) => shortDate(l.sessionDate)).join('، ');
  return (
    <View style={[styles.item, bordered && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
      <View style={styles.between}>
        <WorkTypeBadge type={item.type} recitationNumber={item.recitationNumber} />
        <WorkStatusBadge status={item.status} />
      </View>
      {item.assignment ? <WorkAssignmentView type={item.type} assignment={item.assignment} workload={item.workload} /> : null}
      {/* «متابعة العرضات»: this surah's current cycle, and a way to its full history (none for a legacy recitation) */}
      {item.recitationCycle ? <RecitationCycleLine cycle={item.recitationCycle} studentId={studentId} /> : null}
      {/* Legacy free text as written; for a structured item, only the teacher's own note */}
      {ownDescription(item) ? (
        <AppText variant="body" selectable tone={item.assignment ? 'muted' : 'default'} style={styles.text}>
          {ownDescription(item)}
        </AppText>
      ) : null}
      {item.evaluationComment ? (
        <View style={[styles.comment, { backgroundColor: colors.muted }]}>
          <AppText variant="small" selectable>
            <AppText variant="small" style={styles.strong}>
              {w.comment}:{' '}
            </AppText>
            {item.evaluationComment}
          </AppText>
        </View>
      ) : null}
      {item.evaluatedBy && item.evaluatedAt ? (
        <AppText variant="small" tone="muted">
          {w.evaluatedBy(item.evaluatedBy, shortDate(platformDateOf(item.evaluatedAt, timeZone)))}
        </AppText>
      ) : null}
      {item.carriedFrom ? (
        <LinkRow
          label={
            item.carriedFrom.status === 'NOT_EVALUATED'
              ? w.carriedFromCancelled(shortDate(item.carriedFrom.sessionDate))
              : w.carriedFrom(shortDate(item.carriedFrom.sessionDate), w.status[item.carriedFrom.status])
          }
          onPress={() => onOpen(item.carriedFrom!)}
        />
      ) : null}
      {item.continuedFrom ? (
        <LinkRow label={w.continuedFrom(shortDate(item.continuedFrom.sessionDate))} onPress={() => onOpen(item.continuedFrom!)} />
      ) : null}
      {item.carriedTo.length ? <LinkRow label={w.carriedTo(dates(item.carriedTo))} onPress={() => onOpen(item.carriedTo[0]!)} /> : null}
      {item.continuedBy.length ? (
        <LinkRow label={w.continuedBy(dates(item.continuedBy))} onPress={() => onOpen(item.continuedBy[0]!)} />
      ) : null}
      {isTransferable(item.status, sessionStatus) || item.type === 'RECITATION' ? (
        <View style={styles.actions}>
          {isTransferable(item.status, sessionStatus) ? (
            <Button variant="outline" icon="transfer" label={w.carry} accessibilityLabel={`${w.carry}: ${item.description}`} onPress={() => onSchedule('carry')} />
          ) : null}
          {item.type === 'RECITATION' ? (
            <Button variant="outline" icon="recitation" label={w.next} accessibilityLabel={`${w.next}: ${item.description}`} onPress={() => onSchedule('next')} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** A link to the other program of a carried / continued item. */
function LinkRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <View style={styles.inline}>
      <AppText variant="small" tone="primary" style={styles.flex}>
        {label}
      </AppText>
      <LinkButton label={w.openLinked} onPress={onPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  item: { gap: spacing.xs, paddingVertical: spacing.md },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  text: { lineHeight: 26 },
  comment: { borderRadius: 8, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  strong: { fontWeight: '600' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingTop: spacing.xs },
  notes: { gap: spacing.xs },
  footer: {
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  bar: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
