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
import type { EvaluationBlock } from './work-model';
import type { WorkProgram } from './work-types';

/**
 * «التقييم العام» of a program (the web's section, after the items): four choices, the saved one
 * checked, a choice saved explicitly (a correction worded as such). The server decides when it is
 * allowed; the saved value changes only once it confirms (the confirmed program replaces the
 * cached one); a 409 shows its message and the program is reloaded.
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
  const [choice, setChoice] = useState<WorkPerformance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const save = useEvaluateWorkProgram(teacherId, program.id);
  const selected = choice ?? saved?.level ?? null;
  const changed = choice !== null && choice !== saved?.level;
  const disabled = blocked !== null || save.isPending;
  const pendingNote = overallPendingNote(program.progress.pending);

  function submit() {
    if (!changed || !choice) return;
    setError(null);
    setConfirmation(null);
    save.mutate(
      { items: [], version: program.version, overall: choice },
      {
        onSuccess: () => {
          setChoice(null);
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
      <View style={styles.inline}>
        <Icon name="success" size={16} color={colors.primary} />
        <AppText variant="label" accessibilityRole="header">
          {OVERALL_EVALUATION.title}
        </AppText>
      </View>
      <AppText variant="caption" tone="muted">
        {OVERALL_EVALUATION.hint}
      </AppText>
      <AppText variant="body" testID="overall-saved">
        {saved ? (
          <>
            <AppText variant="bodyStrong">{PERFORMANCE_LABEL[saved.level]}</AppText>
            <AppText variant="caption" tone="muted">
              {` — ${saved.evaluatedBy ? `${saved.evaluatedBy} · ` : ''}${formatDate(saved.evaluatedAt.slice(0, 10))}`}
            </AppText>
          </>
        ) : (
          <AppText variant="body" tone="muted">
            {OVERALL_EVALUATION.none}
          </AppText>
        )}
      </AppText>
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
              {on ? <Icon name="success" size={16} color={colors.primaryForeground} /> : null}
              <AppText variant="label" style={{ color: on ? colors.primaryForeground : colors.foreground }}>
                {PERFORMANCE_LABEL[level]}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {blocked ? (
        // worded for this section (the footer already states the items' reason)
        <AppText variant="caption" tone="muted" testID="overall-blocked">
          {blocked === 'CANCELLED' ? OVERALL_BLOCKED.cancelled : OVERALL_BLOCKED.notStarted}
        </AppText>
      ) : pendingNote ? (
        <AppText variant="caption" tone="muted">
          {pendingNote}
        </AppText>
      ) : null}
      {changed && saved && choice ? <AppText variant="label">{overallChangeText(saved.level, choice)}</AppText> : null}
      {error ? <AlertBox message={error} /> : null}
      {confirmation && !changed ? <SuccessToast message={confirmation} /> : null}
      {changed ? (
        <View style={styles.actions}>
          <View style={styles.flex}>
            <Button label={save.isPending ? OVERALL_EVALUATION.saving : OVERALL_EVALUATION.save} loading={save.isPending} disabled={disabled} fullWidth onPress={submit} />
          </View>
          <Button variant="ghost" label={ar.work.cancelChoice} disabled={save.isPending} onPress={() => setChoice(null)} />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
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
