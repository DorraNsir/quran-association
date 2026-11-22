import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AlertBox, AppText, Button, Card, Icon, SuccessToast } from '@/components/ui';
import { ar } from '@/i18n/ar';
import { formatDate } from '@/i18n/format';
import { ApiError, errorMessage } from '@/services/api';
import { radius, spacing, touchTarget, useAppTheme } from '@/theme';

import {
  OVERALL_BLOCKED,
  OVERALL_EVALUATION,
  overallChangeText,
  overallPendingNote,
  PERFORMANCE_LABEL,
  WORK_PERFORMANCES,
  type WorkPerformance,
} from '../quran-reference/work-assignment';
import { useEvaluateWorkProgram } from './use-work';
import { LEVEL_LOOK } from './work-look';
import type { EvaluationBlock } from './work-model';
import type { WorkProgram } from './work-types';

/**
 * «التقييم العام» of a program (after the items): the saved level prominent, who gave it and when
 * below it, and «تعديل التقييم» revealing the four choices (shown at once while none is given). A
 * choice is saved explicitly (a correction worded as such). The server decides when it is allowed;
 * the saved value changes only once it confirms (the confirmed program replaces the cached one); a
 * 409 shows its message and the program is reloaded.
 */
export function OverallEvaluationCard({
  teacherId,
  program,
  blocked,
  onStale,
}: {
  teacherId: string;
  program: WorkProgram;
  /** The evaluation block of the session (null: open) */
  blocked: EvaluationBlock | null;
  onStale: () => void;
}) {
  const { colors } = useAppTheme();
  const saved = program.overallEvaluation ?? null;
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState<WorkPerformance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const save = useEvaluateWorkProgram(teacherId, program.id);
  const selected = choice ?? saved?.level ?? null;
  const changed = choice !== null && choice !== saved?.level;
  const disabled = blocked !== null || save.isPending;
  const pendingNote = overallPendingNote(program.progress.pending);
  // Nothing given yet: the choices straight away (disabled while the session forbids it); given:
  // behind «تعديل التقييم», which is offered only while allowed.
  const choosing = !saved || (editing && blocked === null);
  const look = saved ? LEVEL_LOOK[saved.level] : null;

  function close() {
    setChoice(null);
    setEditing(false);
  }

  function submit() {
    if (!changed || !choice) return;
    setError(null);
    setConfirmation(null);
    save.mutate(
      { items: [], version: program.version, overall: choice },
      {
        onSuccess: () => {
          close();
          setConfirmation(`${OVERALL_EVALUATION.saved} — ${PERFORMANCE_LABEL[choice]}`);
        },
        onError: (e) => {
          const stale = e instanceof ApiError && e.code === 'WORK_PROGRAM_CHANGED';
          setError(errorMessage(e));
          if (stale) {
            setChoice(null);
            onStale();
          }
        },
      },
    );
  }

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Icon name="award" size={22} color={colors.primary} />
        <AppText variant="heading" accessibilityRole="header" style={styles.flex}>
          {OVERALL_EVALUATION.title}
        </AppText>
        <View testID="overall-saved">
          {saved && look ? (
            <View style={[styles.level, { backgroundColor: colors[look.bg] }]}>
              <Icon name={look.icon} size={16} color={colors[look.fg]} />
              <AppText variant="bodyStrong" style={{ color: colors[look.fg] }}>
                {PERFORMANCE_LABEL[saved.level]}
              </AppText>
            </View>
          ) : (
            <AppText variant="small" tone="muted">
              {OVERALL_EVALUATION.none}
            </AppText>
          )}
        </View>
      </View>
      {saved ? (
        <View style={styles.inline}>
          <Icon name="user" size={14} color={colors.mutedForeground} />
          <AppText variant="small" tone="muted" style={styles.flex}>
            {ar.work.lastOverall([saved.evaluatedBy, formatDate(saved.evaluatedAt.slice(0, 10))].filter(Boolean).join(' · '))}
          </AppText>
        </View>
      ) : null}

      {blocked ? (
        // worded for this section (the footer already states the items' reason)
        <AppText variant="caption" tone="muted" testID="overall-blocked">
          {blocked === 'CANCELLED' ? OVERALL_BLOCKED.cancelled : OVERALL_BLOCKED.notStarted}
        </AppText>
      ) : null}

      {choosing ? (
        <>
          <View accessibilityRole="radiogroup" accessibilityLabel={OVERALL_EVALUATION.title} style={styles.choices}>
            {WORK_PERFORMANCES.map((level) => {
              const on = selected === level;
              return (
                <Pressable
                  key={level}
                  onPress={() => setChoice(level)}
                  disabled={disabled}
                  accessibilityRole="radio"
                  accessibilityLabel={PERFORMANCE_LABEL[level]}
                  accessibilityState={{ selected: on, checked: on, disabled }}
                  style={[
                    styles.choice,
                    { borderColor: on ? colors.primary : colors.input, backgroundColor: on ? colors.primary : colors.card },
                    disabled && styles.disabled,
                  ]}>
                  <Icon name={LEVEL_LOOK[level].icon} size={16} color={on ? colors.primaryForeground : colors.mutedForeground} />
                  <AppText variant="label" style={{ color: on ? colors.primaryForeground : colors.foreground }}>
                    {PERFORMANCE_LABEL[level]}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          {pendingNote ? (
            <AppText variant="caption" tone="muted">
              {pendingNote}
            </AppText>
          ) : null}
          {changed && saved && choice ? <AppText variant="label">{overallChangeText(saved.level, choice)}</AppText> : null}
        </>
      ) : null}

      {error ? <AlertBox message={error} /> : null}
      {confirmation && !changed ? <SuccessToast message={confirmation} /> : null}

      {choosing && (changed || editing) ? (
        <View style={styles.actions}>
          {changed ? (
            <View style={styles.flex}>
              <Button
                label={save.isPending ? OVERALL_EVALUATION.saving : OVERALL_EVALUATION.save}
                loading={save.isPending}
                disabled={disabled}
                fullWidth
                onPress={submit}
              />
            </View>
          ) : null}
          <Button variant="ghost" label={ar.work.cancelChoice} disabled={save.isPending} onPress={close} />
        </View>
      ) : null}
      {saved && !choosing && blocked === null ? (
        <Button variant="outline" icon="edit" label={ar.work.editOverall} fullWidth onPress={() => setEditing(true)} />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  level: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 6 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: {
    minHeight: touchTarget,
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
  },
  disabled: { opacity: 0.6 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
