import { Stack, usePreventRemove, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { EmptyState, QueryState } from '@/components/feedback';
import { AlertBox, AppText, Button, Card, Icon, pillColors, Screen, SuccessToast } from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { usePreferences } from '@/features/preferences/preferences';
import { ar } from '@/i18n/ar';
import { errorMessage } from '@/services/api';
import { fontFamilies, radius, spacing, touchTarget, useAppTheme } from '@/theme';

import { useConfirmThenBack } from './use-confirm-then-back';
import { useEvaluationBlock } from './use-evaluation-block';
import { useEvaluateWorkProgram, useWorkProgram } from './use-work';
import { WorkTypeBadge } from './work-badges';
import { isUnavailable } from './teacher-work-program';
import {
  classifyWorkError,
  COMMENT_MAX,
  evaluationBody,
  evaluationDraftOf,
  isEvaluationClosedError,
  NOTES_MAX,
  progressLabel,
  progressOf,
  sessionDay,
  studentName,
  validateEvaluation,
  WORK_STATUS_STYLE,
  WORK_STATUSES,
  type EvaluationDraft,
} from './work-model';
import type { WorkItem, WorkProgram, WorkStatus } from './work-types';

const w = ar.work;

/**
 * «تقييم الأعمال» (PATCH /teacher/work-programs/:id/evaluation): each item its
 * own result and optional comment — during or after the session, by any
 * member of its team (as on the web). Only the changed items are sent, each
 * with the version it was loaded at: if someone evaluated it meanwhile the
 * server refuses (409) instead of overwriting, and the edits stay here.
 */
export function TeacherWorkEvaluateScreen({ programId }: { programId: string }) {
  const { user } = useSession();
  const teacherId = user?.teacherId ?? '';
  const router = useRouter();
  const query = useWorkProgram(teacherId, programId);
  const timeZone = usePreferences().data?.timezone;
  const blocked = useEvaluationBlock(query.data, timeZone);
  // Bumped by «تحميل آخر القيم»: the form restarts from the server's latest values
  const [round, setRound] = useState(0);

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
  // Before the start, or a cancelled session: nothing to evaluate (also when opened by a link)
  if (query.data && blocked)
    return (
      <Screen>
        <Stack.Screen options={{ title: w.evaluateTitle }} />
        <EmptyState
          icon={blocked === 'CANCELLED' ? 'ban' : 'clock'}
          title={w.evaluationBlocked[blocked]}
          action={
            <Button
              variant="outline"
              label={w.backToProgram}
              onPress={() => router.replace({ pathname: '/teacher/work/[id]', params: { id: programId } })}
            />
          }
        />
      </Screen>
    );
  if (query.data)
    return (
      <EvaluationForm
        key={`${query.data.id}:${round}`}
        teacherId={teacherId}
        program={query.data}
        onSessionClosed={() => void query.refetch()}
        onReload={async () => {
          await query.refetch();
          setRound((r) => r + 1);
        }}
      />
    );
  return (
    <Screen>
      <Stack.Screen options={{ title: w.evaluateTitle }} />
      <QueryState query={query}>{null}</QueryState>
    </Screen>
  );
}

function EvaluationForm({
  teacherId,
  program,
  onReload,
  onSessionClosed,
}: {
  teacherId: string;
  program: WorkProgram;
  onReload: () => Promise<void>;
  onSessionClosed: () => void;
}) {
  const { colors } = useAppTheme();
  const save = useEvaluateWorkProgram(teacherId, program.id);
  const { confirmation, confirm } = useConfirmThenBack({ pathname: '/teacher/work/[id]', params: { id: program.id } });
  const [draft, setDraft] = useState<EvaluationDraft>(() => evaluationDraftOf(program));
  const [notes, setNotes] = useState(program.generalNotes ?? '');
  const [error, setError] = useState<{ text: string; conflict: boolean } | null>(null);
  const submitting = useRef(false);

  const { changed, ...body } = evaluationBody(program, draft, notes);
  const invalid = validateEvaluation(draft, notes);
  const saving = save.isPending;
  const preview = progressOf(program.items.map((i) => ({ status: draft[i.id]?.status ?? i.status })));

  const disablePrevention = usePreventRemove(changed && !saving && !confirmation, ({ repeat }) => {
    Alert.alert(w.leaveTitle, w.leaveMessage, [
      { text: w.stay, style: 'cancel' },
      { text: w.discard, style: 'destructive', onPress: repeat },
    ]);
  });

  const set = (id: string, patch: Partial<EvaluationDraft[string]>) => {
    setDraft((d) => ({ ...d, [id]: { ...d[id]!, ...patch } }));
    setError(null);
  };

  async function onSave() {
    if (submitting.current || confirmation || !changed || invalid) return;
    submitting.current = true;
    setError(null);
    try {
      const saved = await save.mutateAsync(body);
      disablePrevention();
      confirm(`${w.evaluated} — ${progressLabel(saved.progress)}`);
      return; // stays locked until the screen goes back
    } catch (e) {
      const kind = classifyWorkError(e);
      setError({ text: kind === 'offline' ? w.offlineSave : errorMessage(e), conflict: kind === 'conflict' });
      // Rescheduled or cancelled meanwhile: the API's message, and the program's state reloaded
      if (isEvaluationClosedError(e)) {
        disablePrevention();
        onSessionClosed();
      }
    }
    submitting.current = false;
  }

  const footer = (
    <View style={[styles.bar, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {confirmation ? (
        <SuccessToast message={confirmation} />
      ) : (
        <>
          {error ? (
            <View style={styles.column}>
              {error.conflict ? (
                <AppText variant="label" tone="destructive">
                  {w.conflictTitle}
                </AppText>
              ) : null}
              <AlertBox message={error.text} />
              {error.conflict ? <Button variant="outline" icon="retry" label={w.reloadLatest} onPress={() => void onReload()} /> : null}
            </View>
          ) : null}
          {invalid ? <AlertBox message={w[invalid]} /> : null}
          <AppText variant="small" tone={changed ? 'warning' : 'muted'}>
            {changed ? w.unsaved : w.nothingToSave} · {progressLabel(preview)}
          </AppText>
          <Button
            label={saving ? w.saving : w.saveEvaluation}
            icon="success"
            loading={saving}
            disabled={saving || !changed || Boolean(invalid)}
            fullWidth
            onPress={() => void onSave()}
          />
        </>
      )}
    </View>
  );

  const locked = saving || Boolean(confirmation);
  return (
    <Screen footer={footer}>
      <Stack.Screen options={{ title: w.evaluateTitle }} />
      <Card style={styles.context}>
        <AppText variant="bodyStrong">{studentName(program)}</AppText>
        <AppText variant="small" tone="muted">
          {program.session.groupName} — {program.session.branchName} · {sessionDay(program.session)}
        </AppText>
        <AppText variant="small" tone="muted">
          {w.evaluateHint}
        </AppText>
      </Card>
      {program.items.map((item, i) => (
        <ItemEvaluation
          key={item.id}
          index={i}
          item={item}
          status={draft[item.id]!.status}
          comment={draft[item.id]!.comment}
          disabled={locked}
          onStatus={(status) => set(item.id, { status })}
          onComment={(comment) => set(item.id, { comment })}
        />
      ))}
      <Card style={styles.context}>
        <AppText variant="label">{w.generalNotes}</AppText>
        <TextInput
          value={notes}
          onChangeText={(v) => {
            setNotes(v);
            setError(null);
          }}
          editable={!locked}
          multiline
          textAlignVertical="top"
          maxLength={NOTES_MAX + 1}
          placeholder={w.notesPlaceholder}
          placeholderTextColor={colors.mutedForeground}
          accessibilityLabel={w.generalNotes}
          style={[styles.input, styles.multiline, { color: colors.foreground, borderColor: colors.input }]}
        />
      </Card>
    </Screen>
  );
}

function ItemEvaluation({
  index,
  item,
  status,
  comment,
  disabled,
  onStatus,
  onComment,
}: {
  index: number;
  item: WorkItem;
  status: WorkStatus;
  comment: string;
  disabled: boolean;
  onStatus: (s: WorkStatus) => void;
  onComment: (c: string) => void;
}) {
  const { colors } = useAppTheme();
  const touched = status !== item.status || (comment.trim() || null) !== item.evaluationComment;
  return (
    <Card style={[styles.context, touched && { borderColor: colors.warning }]}>
      <View style={styles.inline}>
        <AppText variant="small" tone="muted">
          {w.itemN(index + 1)}
        </AppText>
        <WorkTypeBadge type={item.type} recitationNumber={item.recitationNumber} />
      </View>
      <AppText variant="body" style={styles.text}>
        {item.description}
      </AppText>
      <View accessibilityRole="radiogroup" accessibilityLabel={w.statusGroup(item.description)} style={styles.grid}>
        {WORK_STATUSES.map((s) => {
          const selected = s === status;
          const { bg, fg } = pillColors(colors, WORK_STATUS_STYLE[s].tone);
          return (
            <Pressable
              key={s}
              onPress={() => onStatus(s)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityLabel={w.status[s]}
              accessibilityState={{ selected, checked: selected, disabled }}
              style={({ pressed }) => [
                styles.status,
                { borderColor: selected ? fg : colors.border, backgroundColor: selected ? bg : colors.card },
                pressed && { opacity: 0.85 },
              ]}>
              <Icon name={WORK_STATUS_STYLE[s].icon} size={15} color={selected ? fg : colors.mutedForeground} />
              <AppText variant="small" style={{ color: selected ? fg : colors.foreground }}>
                {w.status[s]}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        value={comment}
        onChangeText={onComment}
        editable={!disabled}
        maxLength={COMMENT_MAX + 1}
        placeholder={w.commentPlaceholder}
        placeholderTextColor={colors.mutedForeground}
        accessibilityLabel={w.commentLabel(item.description)}
        style={[styles.input, { color: colors.foreground, borderColor: comment.trim().length > COMMENT_MAX ? colors.destructive : colors.input }]}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  context: { gap: spacing.xs },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  text: { lineHeight: 26 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  status: {
    minHeight: touchTarget - 4,
    flexBasis: '31%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.xs,
  },
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
  multiline: { minHeight: 96, paddingVertical: spacing.sm },
  column: { gap: spacing.xs },
  bar: {
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
});
