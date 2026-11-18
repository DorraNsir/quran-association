import { Stack, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { EmptyState, LoadingState, QueryState } from '@/components/feedback';
import { AlertBox, AppText, Button, Card, OptionRow, Screen, SuccessToast } from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { ar } from '@/i18n/ar';
import { errorMessage } from '@/services/api';
import { fontFamilies, radius, spacing, touchTarget, useAppTheme } from '@/theme';

import { isUnavailable } from './teacher-work-program';
import { sessionOptionLabel } from './teacher-work-form';
import { useConfirmThenBack } from './use-confirm-then-back';
import { useEligibleSessions, useScheduleWorkItem, useWorkProgram } from './use-work';
import { WorkStatusBadge, WorkTypeBadge } from './work-badges';
import { classifyWorkError, DESCRIPTION_MAX, isTransferable, nextRecitation, recitationOrdinal, sessionDay } from './work-model';
import type { WorkItem, WorkProgram } from './work-types';

const w = ar.work;
export type ScheduleMode = 'carry' | 'next';

/**
 * Two separate, MANUAL actions on one item, both into an EXISTING upcoming
 * session of the same student, later than the source (the server lists and
 * re-checks them — never a free date):
 *  - «نقل إلى الحصة القادمة»: the SAME unfinished task; the original keeps its result;
 *  - «إضافة العرضة التالية»: the next numbered recitation (+1).
 * The new item starts «لم يُقيّم بعد» in the target session's program
 * (created there if the student has none). Duplicates are refused.
 */
export function TeacherWorkScheduleScreen({ programId, itemId, mode }: { programId: string; itemId: string; mode: ScheduleMode }) {
  const { user } = useSession();
  const teacherId = user?.teacherId ?? '';
  const router = useRouter();
  const query = useWorkProgram(teacherId, programId);
  const item = query.data?.items.find((i) => i.id === itemId);
  // The action must apply to this item (the server refuses otherwise anyway)
  const allowed = item ? (mode === 'carry' ? isTransferable(item.status, query.data?.session.status) : item.type === 'RECITATION') : false;

  if ((query.isError && isUnavailable(query.error)) || (query.data && !allowed))
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
  if (query.data && item) return <ScheduleForm teacherId={teacherId} source={query.data} item={item} mode={mode} />;
  return (
    <Screen>
      <Stack.Screen options={{ title: mode === 'carry' ? w.carry : w.next }} />
      <QueryState query={query}>{null}</QueryState>
    </Screen>
  );
}

function ScheduleForm({ teacherId, source, item, mode }: { teacherId: string; source: WorkProgram; item: WorkItem; mode: ScheduleMode }) {
  const { colors } = useAppTheme();
  const proposal = mode === 'next' ? nextRecitation(item) : undefined;
  const [description, setDescription] = useState(proposal?.description ?? item.description);
  const eligible = useEligibleSessions(teacherId, source.student.id, source.session.id);
  const options = eligible.data ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  const targetId = picked ?? options[0]?.id ?? '';
  const target = options.find((s) => s.id === targetId);
  const schedule = useScheduleWorkItem(teacherId, item.id, mode);
  const { confirmation, confirm } = useConfirmThenBack({ pathname: '/teacher/work/[id]', params: { id: source.id } });
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  // Known duplicates (the server refuses them anyway)
  const already = (mode === 'carry' ? item.carriedTo : item.continuedBy).some((l) => l.sessionId === targetId);
  const emptyDescription = mode === 'next' && !description.trim();
  const saving = schedule.isPending;

  async function onConfirm() {
    if (submitting.current || confirmation || !targetId || already || emptyDescription) return;
    submitting.current = true;
    setError(null);
    try {
      await schedule.mutateAsync({ targetSessionId: targetId, ...(mode === 'next' ? { description: description.trim() } : {}) });
      confirm(`${mode === 'carry' ? w.carried : w.nextAdded} — ${target ? sessionDay(target) : ''}`);
      return;
    } catch (e) {
      setError(classifyWorkError(e) === 'offline' ? w.offlineSave : errorMessage(e));
    }
    submitting.current = false;
  }

  const footer = (
    <View style={[styles.bar, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {confirmation ? (
        <SuccessToast message={confirmation} />
      ) : (
        <>
          {already ? <AlertBox message={mode === 'carry' ? w.alreadyCarried : w.alreadyPlanned} /> : null}
          {emptyDescription ? <AlertBox message={w.descriptionRequired} /> : null}
          {error ? <AlertBox message={error} /> : null}
          <Button
            label={saving ? w.saving : w.confirm}
            icon={mode === 'carry' ? 'transfer' : 'recitation'}
            loading={saving}
            disabled={saving || !targetId || already || emptyDescription}
            fullWidth
            onPress={() => void onConfirm()}
          />
        </>
      )}
    </View>
  );

  return (
    <Screen footer={footer}>
      <Stack.Screen options={{ title: mode === 'carry' ? w.carry : w.next }} />
      <AppText variant="small" tone="muted">
        {mode === 'carry' ? w.carryHint : w.nextHint}
      </AppText>
      <Card style={styles.section}>
        <AppText variant="small" tone="muted">
          {w.source(sessionDay(source.session))}
        </AppText>
        <View style={styles.inline}>
          <WorkTypeBadge type={item.type} recitationNumber={item.recitationNumber} />
          <WorkStatusBadge status={item.status} />
        </View>
        <AppText variant="body" style={styles.text}>
          {item.description}
        </AppText>
      </Card>

      {mode === 'next' && proposal ? (
        <Card style={styles.section}>
          <AppText variant="label">{w.nextDescription(recitationOrdinal(proposal.number))}</AppText>
          <TextInput
            value={description}
            onChangeText={(v) => {
              setDescription(v);
              setError(null);
            }}
            editable={!saving && !confirmation}
            maxLength={DESCRIPTION_MAX}
            accessibilityLabel={w.nextDescription(recitationOrdinal(proposal.number))}
            style={[styles.input, { color: colors.foreground, borderColor: colors.input }]}
          />
        </Card>
      ) : null}

      <Card style={styles.section}>
        <AppText variant="label">{w.target}</AppText>
        {eligible.isPending ? (
          <LoadingState />
        ) : eligible.isError ? (
          <AlertBox message={errorMessage(eligible.error)} />
        ) : options.length === 0 ? (
          <AppText variant="small" tone="muted">
            {w.noEligible}
          </AppText>
        ) : (
          <View accessibilityRole="radiogroup" accessibilityLabel={w.target} style={styles.options}>
            {options.map((s) => (
              <OptionRow
                key={s.id}
                label={sessionOptionLabel(s)}
                selected={s.id === targetId}
                onPress={() => {
                  if (saving || confirmation) return;
                  setPicked(s.id);
                  setError(null);
                }}
              />
            ))}
          </View>
        )}
        {target && !already ? (
          <AppText variant="small" tone="muted">
            {target.programId ? w.addsToExisting : w.createsNew}
          </AppText>
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  options: { gap: spacing.xs },
  text: { lineHeight: 26 },
  input: {
    minHeight: touchTarget,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  bar: {
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
});
