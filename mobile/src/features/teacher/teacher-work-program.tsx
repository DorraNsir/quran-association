import { Stack, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EmptyState, QueryState } from '@/components/feedback';
import { AppText, Button, Card, Icon, InitialsAvatar, LinkButton, Screen } from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { usePreferences } from '@/features/preferences/preferences';
import { ar } from '@/i18n/ar';
import { ApiError } from '@/services/api';
import { spacing, useAppTheme } from '@/theme';
import { headerTitle } from '@/theme/navigation';

import { platformDateOf } from './memorization-model';
import { usePullToRefresh } from './use-refresh';
import { useWorkProgram, workProgramKey } from './use-work';
import { WorkProgressView, WorkSessionLine, WorkStatusBadge, WorkTypeBadge } from './work-badges';
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
    <View style={[styles.bar, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
          disabled={program.items.length === 0}
          onPress={() => router.push({ pathname: '/teacher/work/[id]/evaluate', params: { id: program.id } })}
        />
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
                <InitialsAvatar name={studentName(program)} size={44} />
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
                  item={item}
                  bordered={i > 0}
                  timeZone={timeZone}
                  onOpen={open}
                  onSchedule={(mode) =>
                    router.push({ pathname: '/teacher/work/[id]/schedule', params: { id: program.id, itemId: item.id, mode } })
                  }
                />
              ))}
            </Card>

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
  bordered,
  timeZone,
  onOpen,
  onSchedule,
}: {
  item: WorkItem;
  bordered: boolean;
  timeZone: string | undefined;
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
      <AppText variant="body" selectable style={styles.text}>
        {item.description}
      </AppText>
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
          label={w.carriedFrom(shortDate(item.carriedFrom.sessionDate), w.status[item.carriedFrom.status])}
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
      {isTransferable(item.status) || item.type === 'RECITATION' ? (
        <View style={styles.actions}>
          {isTransferable(item.status) ? (
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
  bar: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  flex: { flex: 1 },
});
