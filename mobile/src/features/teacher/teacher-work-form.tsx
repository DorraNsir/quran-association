import { Stack, usePreventRemove, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { EmptyState, LoadingState, QueryState } from '@/components/feedback';
import { AlertBox, AppText, BottomSheet, Button, Card, ChipRow, Icon, OptionRow, Screen, SuccessToast } from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { ar } from '@/i18n/ar';
import { ltr } from '@/i18n/format';
import { errorMessage } from '@/services/api';
import { fontFamilies, radius, spacing, touchTarget, useAppTheme } from '@/theme';

import { teacherClasses } from './dashboard-model';
import { isUnavailable } from './teacher-work-program';
import type { TeacherWorkspace } from './types';
import { useConfirmThenBack } from './use-confirm-then-back';
import { useTeacherWorkspace } from './use-teacher-dashboard';
import { useCreateWorkProgram, useEligibleSessions, useUpdateWorkProgram, useWorkProgram } from './use-work';
import { WorkStatusBadge } from './work-badges';
import {
  blankItem,
  classifyWorkError,
  DESCRIPTION_MAX,
  existingProgramId,
  newItemsOf,
  NOTES_MAX,
  sessionDay,
  toDraft,
  updateBody,
  validatePlan,
  WORK_TYPES,
  type DraftItem,
} from './work-model';
import type { EligibleSession, WorkProgram } from './work-types';

const w = ar.work;

/** «الاثنين 16 نوفمبر 2026 · 17:00 – 19:00» (times isolated LTR: start read first in RTL). */
export const sessionOptionLabel = (s: EligibleSession) =>
  `${sessionDay(s)} · ${ltr(s.startTime)} – ${ltr(s.endTime)}${s.programId ? ` · ${w.hasProgram}` : ''}`;

/** Students I may plan for: current, active students of my classes (the web's options; the server re-checks). */
function studentOptions(ws: TeacherWorkspace) {
  const classes = teacherClasses(ws);
  return classes.map((c) => ({
    id: c.id,
    label: c.groupName,
    students: ws.students
      .filter((s) => s.groupClassId === c.id && s.status === 'ACTIVE')
      .map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar')),
  }));
}

/**
 * «إضافة برنامج عمل» (POST) / «تعديل برنامج العمل» (PATCH), as the web form:
 * the session is picked among the student's EXISTING upcoming sessions (no
 * free date); one program per student per session (an existing one is
 * offered for editing); saved items are never deleted (a dropped one is
 * evaluated «ملغى»). Only what changed is sent, with the versions it was
 * edited from.
 */
export function TeacherWorkFormScreen({ programId, studentId }: { programId?: string; studentId?: string }) {
  const { user } = useSession();
  const teacherId = user?.teacherId ?? '';
  const router = useRouter();
  const workspace = useTeacherWorkspace(teacherId);
  const query = useWorkProgram(teacherId, programId ?? '');

  if (programId) {
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
    if (query.data) return <PlanForm key={query.data.id} teacherId={teacherId} program={query.data} />;
    return (
      <Screen>
        <Stack.Screen options={{ title: w.editTitle }} />
        <QueryState query={query}>{null}</QueryState>
      </Screen>
    );
  }
  if (workspace.data) return <PlanForm teacherId={teacherId} workspace={workspace.data} initialStudentId={studentId} />;
  return (
    <Screen>
      <Stack.Screen options={{ title: w.newTitle }} />
      <QueryState query={workspace}>{null}</QueryState>
    </Screen>
  );
}

function PlanForm({
  teacherId,
  program,
  workspace,
  initialStudentId,
}: {
  teacherId: string;
  program?: WorkProgram;
  workspace?: TeacherWorkspace;
  initialStudentId?: string;
}) {
  const router = useRouter();
  const { colors } = useAppTheme();
  const groups = workspace ? studentOptions(workspace) : [];
  const allStudents = groups.flatMap((g) => g.students);
  const [studentId, setStudentId] = useState(
    program?.student.id ?? (allStudents.some((s) => s.id === initialStudentId) ? initialStudentId! : ''),
  );
  const [sessionId, setSessionId] = useState(program?.session.id ?? '');
  const [items, setItems] = useState<DraftItem[]>(() => (program ? program.items.map(toDraft) : [blankItem()]));
  const [notes, setNotes] = useState(program?.generalNotes ?? '');
  const [picking, setPicking] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A program created meanwhile by someone else (409 WORK_PROGRAM_EXISTS)
  const [raced, setRaced] = useState<string | null>(null);
  const submitting = useRef(false);

  const create = useCreateWorkProgram(teacherId);
  const update = useUpdateWorkProgram(teacherId, program?.id ?? '');
  const eligible = useEligibleSessions(teacherId, program ? null : studentId || null);
  const { confirmation, confirm } = useConfirmThenBack(
    program ? { pathname: '/teacher/work/[id]', params: { id: program.id } } : '/teacher/work',
  );

  const options = eligible.data ?? [];
  const chosen = options.find((s) => s.id === sessionId);
  const existingId = raced ?? (!program && chosen?.programId) ?? null;
  const invalid = validatePlan({ studentId, sessionId, items, notes });
  const edit = program ? updateBody(program, items, notes) : null;
  const dirty = program ? edit!.changed : Boolean(studentId || sessionId || notes.trim() || items.some((i) => i.description.trim()));
  const saving = create.isPending || update.isPending;
  const locked = saving || Boolean(confirmation);
  const studentLabel = program
    ? `${program.student.firstName} ${program.student.lastName}`
    : allStudents.find((s) => s.id === studentId)?.name;

  const disablePrevention = usePreventRemove(dirty && !saving && !confirmation, ({ repeat }) => {
    Alert.alert(w.leaveTitle, w.leaveMessage, [
      { text: w.stay, style: 'cancel' },
      { text: w.discard, style: 'destructive', onPress: repeat },
    ]);
  });

  const patch = (key: string, p: Partial<DraftItem>) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...p } : i)));
    setError(null);
  };

  async function onSave() {
    if (submitting.current || confirmation) return;
    setSubmitted(true);
    if (invalid || existingId || (program && !edit!.changed)) return;
    submitting.current = true;
    setError(null);
    try {
      if (program) await update.mutateAsync(edit!.body);
      else await create.mutateAsync({ studentId, sessionId, generalNotes: notes.trim() || null, items: newItemsOf(items) });
      disablePrevention();
      confirm(program ? w.updated : w.created);
      return; // stays locked until the screen goes back
    } catch (e) {
      const kind = classifyWorkError(e);
      const raceId = existingProgramId(e);
      if (raceId) setRaced(raceId);
      else setError(kind === 'offline' ? w.offlineSave : errorMessage(e));
    }
    submitting.current = false;
  }

  const footer = (
    <View style={[styles.bar, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {confirmation ? (
        <SuccessToast message={confirmation} />
      ) : (
        <>
          {error ? <AlertBox message={error} /> : null}
          {submitted && invalid ? <AlertBox message={w.errors[invalid]} /> : null}
          <AppText variant="small" tone={dirty ? 'warning' : 'muted'}>
            {dirty ? w.unsaved : program ? w.nothingToSave : w.planHint}
          </AppText>
          <Button
            label={saving ? w.saving : w.savePlan}
            icon="success"
            loading={saving}
            disabled={saving || Boolean(existingId) || (program ? !edit!.changed : false)}
            fullWidth
            onPress={() => void onSave()}
          />
        </>
      )}
    </View>
  );

  return (
    <Screen footer={footer}>
      <Stack.Screen options={{ title: program ? w.editTitle : w.newTitle }} />

      <Card style={styles.section}>
        <AppText variant="label">{w.student}</AppText>
        {program ? (
          <AppText variant="body">{studentLabel}</AppText>
        ) : (
          <Pressable
            onPress={() => setPicking(true)}
            disabled={locked}
            accessibilityRole="button"
            accessibilityLabel={`${w.student}: ${studentLabel ?? w.pickStudent}`}
            style={[styles.picker, { borderColor: submitted && !studentId ? colors.destructive : colors.input }]}>
            <AppText variant="body" tone={studentLabel ? 'default' : 'muted'} style={styles.flex}>
              {studentLabel ?? w.pickStudent}
            </AppText>
            <Icon name="forward" size={16} color={colors.mutedForeground} />
          </Pressable>
        )}

        <AppText variant="label">{w.session}</AppText>
        {program ? (
          <AppText variant="body">{sessionOptionLabel({ ...program.session, programId: null })}</AppText>
        ) : !studentId ? (
          <AppText variant="small" tone="muted">
            {w.pickStudentFirst}
          </AppText>
        ) : eligible.isPending ? (
          <LoadingState />
        ) : eligible.isError ? (
          <AlertBox message={errorMessage(eligible.error)} />
        ) : options.length === 0 ? (
          <AppText variant="small" tone="muted">
            {w.noEligible}
          </AppText>
        ) : (
          <View accessibilityRole="radiogroup" accessibilityLabel={w.session} style={styles.options}>
            {options.map((s) => (
              <OptionRow
                key={s.id}
                label={sessionOptionLabel(s)}
                selected={s.id === sessionId}
                onPress={() => {
                  if (locked) return;
                  setSessionId(s.id);
                  setRaced(null);
                  setError(null);
                }}
              />
            ))}
          </View>
        )}
        {existingId ? (
          <View style={styles.section}>
            <AlertBox tone="info" message={`${w.existsTitle} ${w.existsHint}`} />
            <Button
              variant="outline"
              icon="edit"
              label={w.openExisting}
              onPress={() => router.replace({ pathname: '/teacher/work/[id]/edit', params: { id: existingId } })}
            />
          </View>
        ) : null}
      </Card>

      <AppText variant="label" accessibilityRole="header">
        {w.items}
      </AppText>
      {items.map((item, index) => (
        <ItemEditor
          key={item.key}
          index={index}
          item={item}
          disabled={locked}
          removable={!item.saved && items.length > 1}
          onChange={(p) => patch(item.key, p)}
          onRemove={() => setItems((prev) => prev.filter((i) => i.key !== item.key))}
        />
      ))}
      <Button variant="outline" icon="add" label={w.addItem} disabled={locked} onPress={() => setItems((prev) => [...prev, blankItem()])} />

      <Card style={styles.section}>
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
          placeholder={w.planNotesPlaceholder}
          placeholderTextColor={colors.mutedForeground}
          accessibilityLabel={w.generalNotes}
          style={[styles.input, styles.multiline, { color: colors.foreground, borderColor: colors.input }]}
        />
      </Card>

      {!program ? (
        <BottomSheet visible={picking} title={w.pickStudent} closeLabel={w.closePicker} onClose={() => setPicking(false)}>
          {groups.map((g) => (
            <View key={g.id} style={styles.options}>
              <AppText variant="small" tone="muted" accessibilityRole="header">
                {g.label}
              </AppText>
              {g.students.map((s) => (
                <OptionRow
                  key={s.id}
                  label={s.name}
                  selected={s.id === studentId}
                  onPress={() => {
                    setStudentId(s.id);
                    setSessionId('');
                    setRaced(null);
                    setPicking(false);
                  }}
                />
              ))}
            </View>
          ))}
        </BottomSheet>
      ) : null}
    </Screen>
  );
}

function ItemEditor({
  index,
  item,
  disabled,
  removable,
  onChange,
  onRemove,
}: {
  index: number;
  item: DraftItem;
  disabled: boolean;
  removable: boolean;
  onChange: (p: Partial<DraftItem>) => void;
  onRemove: () => void;
}) {
  const { colors } = useAppTheme();
  const typeLocked = Boolean(item.saved?.continuedFrom);
  return (
    <Card style={styles.section}>
      <View style={styles.inline}>
        <AppText variant="label" style={styles.flex}>
          {w.itemN(index + 1)}
        </AppText>
        {item.saved && item.saved.status !== 'NOT_EVALUATED' ? <WorkStatusBadge status={item.saved.status} /> : null}
        {removable ? (
          <Pressable onPress={onRemove} disabled={disabled} accessibilityRole="button" accessibilityLabel={w.removeItem(index + 1)} hitSlop={8}>
            <Icon name="delete" size={18} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
      {typeLocked ? (
        <AppText variant="small" tone="muted">
          {w.lockedType}
        </AppText>
      ) : (
        <ChipRow
          label={`${w.itemType} — ${w.itemN(index + 1)}`}
          value={item.type}
          onChange={(type) => !disabled && onChange({ type })}
          options={WORK_TYPES.map((t) => ({ value: t, label: w.type[t] }))}
        />
      )}
      <TextInput
        value={item.description}
        onChangeText={(description) => onChange({ description })}
        editable={!disabled}
        multiline
        textAlignVertical="top"
        maxLength={DESCRIPTION_MAX + 1}
        placeholder={w.placeholder[item.type]}
        placeholderTextColor={colors.mutedForeground}
        accessibilityLabel={`${w.itemDescription} — ${w.itemN(index + 1)}`}
        style={[styles.input, styles.multiline, { color: colors.foreground, borderColor: colors.input }]}
      />
      {item.type === 'RECITATION' ? (
        <TextInput
          value={item.recitationNumber}
          onChangeText={(recitationNumber) => onChange({ recitationNumber })}
          editable={!disabled}
          keyboardType="number-pad"
          placeholder="2"
          placeholderTextColor={colors.mutedForeground}
          accessibilityLabel={`${w.recitationNumber} — ${w.itemN(index + 1)}`}
          style={[styles.input, styles.number, { color: colors.foreground, borderColor: colors.input }]}
        />
      ) : null}
      {item.saved ? (
        <AppText variant="small" tone="muted">
          {w.savedItemNote}
        </AppText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  options: { gap: spacing.xs },
  picker: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
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
  multiline: { minHeight: 80, paddingVertical: spacing.sm, lineHeight: 24 },
  number: { width: 96, textAlign: 'center', writingDirection: 'ltr' },
  bar: {
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  flex: { flex: 1 },
});
