import { Stack, useNavigation, usePreventRemove, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { EmptyState, QueryState } from '@/components/feedback';
import {
  AlertBox,
  AppText,
  Button,
  Card,
  Icon,
  InitialsAvatar,
  Pill,
  Screen,
  SectionCard,
  TimeRange,
} from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { ar } from '@/i18n/ar';
import { formatDateLong } from '@/i18n/format';
import { errorMessage } from '@/services/api';
import { fontFamilies, radius, spacing, touchTarget, useAppTheme, type ColorTokens } from '@/theme';
import { headerTitle } from '@/theme/navigation';

import { AttendanceStateLabel, AttendanceStatusBadge } from './attendance-badges';
import {
  canEditStudent,
  canEditTeacher,
  effective,
  EMPTY_DRAFTS,
  markRestPresent,
  NOTE_MAX,
  pendingCount,
  savePayload,
  setNote,
  setStatus,
  STATUSES,
  studentSubject,
  teacherSubject,
  unrecordedAfterSave,
  type AttendanceDrafts,
  type Draft,
  type Subject,
} from './attendance-draft';
import {
  attendanceNotices,
  rosterGroups,
  rosterState,
  statusCounts,
  type AttendanceNotice,
} from './attendance-model';
import { classifySaveError, useSaveAttendance, type SaveErrorKind } from './attendance-save';
import { SessionStatusPill } from './session-card';
import type { AttendanceStatus, RosterStudent, RosterTeacher, SessionAttendance } from './types';
import { teacherKey } from './use-teacher-dashboard';
import { usePullToRefresh } from './use-refresh';
import { useSessionAttendance } from './use-teacher-sessions';

const a = ar.attendance;

function noticeText(n: AttendanceNotice): string {
  switch (n.kind) {
    case 'cancelled':
      return a.notices.cancelled;
    case 'notStarted':
      return a.notices.notStarted(n.startTime);
    case 'correctionClosed':
      return a.notices.correctionClosed;
    case 'assistantScope':
      return a.notices.assistantScope;
    case 'emptyRoster':
      return a.notices.emptyRoster;
  }
}

type Message = { tone: 'info' | 'destructive'; text: string; kind?: SaveErrorKind };

/** How long the compact «saved» confirmation stays readable before going back. */
export const SAVED_CONFIRMATION_MS = 1200;

/**
 * «الحضور» of one of MY sessions (GET / PUT /teacher/sessions/:id/attendance):
 * the students (in my scope) and the session's teaching team — every member,
 * me included, recordable by any member of the team, as on the web. What may
 * be edited comes only from the server (editable, correctable, expected,
 * scope). Edits stay local until «حفظ الحضور»; only changed rows are sent;
 * the screen then shows the server's answer — the session's completion is
 * decided by the server, never here.
 */
export function TeacherAttendanceScreen({ sessionId }: { sessionId: string }) {
  const { user } = useSession();
  const teacherId = user?.teacherId ?? '';
  const { colors } = useAppTheme();
  const query = useSessionAttendance(teacherId, sessionId);
  const save = useSaveAttendance(teacherId, sessionId);
  const { refreshing, onRefresh } = usePullToRefresh([[...teacherKey(teacherId), 'sessions', 'attendance', sessionId]]);
  const [drafts, setDrafts] = useState<AttendanceDrafts>(EMPTY_DRAFTS);
  const [message, setMessage] = useState<Message | null>(null);
  const [openNote, setOpenNote] = useState<string | null>(null);
  /** The server confirmed the save: a compact confirmation, then back to the previous screen */
  const [savedText, setSavedText] = useState<string | null>(null);
  // Synchronous guard: a double tap cannot send twice before the next render
  const submitting = useRef(false);
  const router = useRouter();
  const navigation = useNavigation();
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Leaving by «رجوع» during the confirmation unmounts the screen: no second navigation
  useEffect(
    () => () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    },
    [],
  );

  const dto = query.data;
  const editing = dto
    ? dto.students.some((s) => canEditStudent(dto, s)) || dto.teachers.some((t) => canEditTeacher(dto, t))
    : false;
  const pending = dto ? pendingCount(dto, drafts) : 0;
  const saving = save.isPending;

  usePreventRemove(pending > 0 && !saving, ({ repeat }) => {
    Alert.alert(a.leaveTitle, a.leaveMessage, [
      { text: a.stay, style: 'cancel' },
      { text: a.discard, style: 'destructive', onPress: repeat },
    ]);
  });

  const edit = (next: AttendanceDrafts) => {
    setDrafts(next);
    if (message?.tone === 'info') setMessage(null);
  };

  async function onSave() {
    if (!dto || submitting.current || pendingCount(dto, drafts) === 0) return;
    submitting.current = true;
    setMessage(null);
    const wasScheduled = dto.sessionStatus === 'SCHEDULED';
    const body = savePayload(dto, drafts);
    try {
      // Resolves once the server confirmed AND the session screens were refreshed
      const saved = await save.mutateAsync(body);
      setDrafts(EMPTY_DRAFTS);
      setOpenNote(null);
      const left = saved.expectedCount - saved.recordedCount;
      // Completion is the server's answer; a teachers-only save never completes a session
      setSavedText(
        !body.records
          ? a.savedTeachers
          : wasScheduled && saved.sessionStatus === 'COMPLETED'
            ? a.savedSessionCompleted
            : left > 0
              ? a.savedPartial(left)
              : a.savedComplete,
      );
      // Still blocked: no second save while the confirmation is shown
      leaveTimer.current = setTimeout(() => {
        leaveTimer.current = null;
        if (!navigation.isFocused()) return;
        // Back through the real stack (the session details below); a deep link without
        // history opens that session's details instead
        if (router.canGoBack()) router.back();
        else router.replace({ pathname: '/teacher/sessions/[id]', params: { id: sessionId } });
      }, SAVED_CONFIRMATION_MS);
      return;
    } catch (error) {
      // Every failure keeps the edits on screen
      const kind = classifySaveError(error);
      setMessage({ tone: 'destructive', kind, text: kind === 'offline' ? a.offlineSave : errorMessage(error) });
      // The server's rules changed (window closed, cancelled, scope, team…): reload its flags
      if (kind === 'locked' || kind === 'invalid') void query.refetch();
    }
    submitting.current = false;
  }

  function reloadLatest() {
    setDrafts(EMPTY_DRAFTS);
    setMessage(null);
    void query.refetch();
  }

  const groups = dto ? rosterGroups(dto) : [];
  const counts = dto ? statusCounts(dto.students) : null;
  const groupNames = dto ? [dto.groupClass.group.name, ...dto.additionalClasses.map((c) => c.group.name)] : [];
  const restCount = dto
    ? dto.students.filter((s) => s.expected && canEditStudent(dto, s) && effective(drafts.students, studentSubject(s)).status === null)
        .length
    : 0;
  const leftAfter = dto ? unrecordedAfterSave(dto, drafts) : 0;
  const teacherRecordedNow = dto
    ? dto.teachers.filter((t) => effective(drafts.teachers, teacherSubject(t)).status !== null).length
    : 0;

  const footer = savedText ? (
    <View style={[styles.saveBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View
        accessible
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityLabel={savedText}
        style={[styles.savedToast, { backgroundColor: colors.brandSoft }]}>
        <Icon name="success" size={18} color={colors.brandSoftForeground} />
        <AppText variant="label" style={[styles.flex, { color: colors.brandSoftForeground }]} numberOfLines={2}>
          {savedText}
        </AppText>
      </View>
    </View>
  ) : dto && (editing || message) ? (
      <View style={[styles.saveBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {message ? (
          <View style={styles.column}>
            {message.kind === 'conflict' ? (
              <AppText variant="label" tone="destructive">
                {a.conflictTitle}
              </AppText>
            ) : null}
            <AlertBox tone={message.tone} message={message.text} />
            {message.kind === 'conflict' ? (
              <Button variant="outline" icon="retry" label={a.reloadLatest} onPress={reloadLatest} />
            ) : null}
          </View>
        ) : null}
        {editing ? (
          <>
            <View style={styles.saveInfo}>
              {pending > 0 ? (
                <View style={styles.inline}>
                  <View style={[styles.dot, { backgroundColor: colors.warning }]} />
                  <AppText variant="small" style={{ color: colors.warning }}>
                    {a.unsaved(pending)}
                  </AppText>
                </View>
              ) : (
                <AppText variant="small" tone="muted">
                  {a.nothingToSave}
                </AppText>
              )}
              {pending > 0 && drafts.students.size > 0 && leftAfter > 0 ? (
                <AppText variant="small" tone="muted">
                  {a.partialWarning(leftAfter)}
                </AppText>
              ) : null}
            </View>
            <Button
              label={saving ? a.saving : a.save}
              icon="success"
              loading={saving}
              disabled={pending === 0 || saving}
              fullWidth
              onPress={() => void onSave()}
            />
          </>
        ) : null}
      </View>
    ) : undefined;

  /** Shared row props for one editable subject of a draft part. */
  const editorProps = (part: keyof AttendanceDrafts, subject: Subject) => ({
    subject,
    draft: drafts[part],
    disabled: saving || savedText !== null,
    noteOpen: openNote === `${part}:${subject.id}`,
    onToggleNote: () => setOpenNote(openNote === `${part}:${subject.id}` ? null : `${part}:${subject.id}`),
    onStatus: (status: AttendanceStatus) => edit({ ...drafts, [part]: setStatus(drafts[part], subject, status) }),
    onNote: (note: string) => edit({ ...drafts, [part]: setNote(drafts[part], subject, note) }),
  });

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh} footer={footer}>
      <QueryState query={query}>
        {dto && counts ? (
          <>
            <Stack.Screen options={{ title: headerTitle(`${a.title} — ${groupNames[0]}`) }} />
            <Card style={styles.header}>
              <AppText variant="heading" numberOfLines={2}>
                {groupNames.join(' · ')}
              </AppText>
              <View style={styles.inline}>
                <Icon name="calendar" size={14} color={colors.mutedForeground} />
                <AppText variant="caption" tone="muted">
                  {formatDateLong(dto.date)}
                </AppText>
                <TimeRange start={dto.startTime} end={dto.endTime} tone="muted" />
              </View>
              <View style={styles.inline}>
                <Icon name="location" size={14} color={colors.mutedForeground} />
                <AppText variant="caption" tone="muted" style={styles.shrink}>
                  {dto.groupClass.room.name} — {dto.groupClass.branch.name}
                </AppText>
              </View>
              <View style={[styles.progressBox, { borderColor: colors.border }]}>
                <View style={styles.inline}>
                  <SessionStatusPill status={dto.sessionStatus} />
                  <AttendanceStateLabel state={rosterState(dto)} />
                </View>
                <AppText variant="bodyStrong">{a.progress(dto.recordedCount, dto.expectedCount)}</AppText>
              </View>
              {dto.expectedCount > 0 ? (
                <View style={styles.pills}>
                  <Pill label={`${a.status.PRESENT}: ${counts.PRESENT}`} tone="brand" />
                  <Pill label={`${a.status.LATE}: ${counts.LATE}`} tone="warning" />
                  <Pill label={`${a.status.ABSENT}: ${counts.ABSENT}`} />
                  <Pill label={`${a.status.EXCUSED}: ${counts.EXCUSED}`} />
                  <Pill label={`${a.notRecorded}: ${counts.notRecorded}`} />
                </View>
              ) : null}
            </Card>

            {attendanceNotices(dto).map((n) => (
              <AlertBox key={n.kind} tone="info" message={noticeText(n)} />
            ))}
            {editing ? (
              <AppText variant="small" tone="muted">
                {a.editHint}
              </AppText>
            ) : null}

            <SectionCard
              title={a.students}
              icon="students"
              action={
                editing && restCount > 0 ? (
                  <Button
                    variant="ghost"
                    label={a.markRestPresent(restCount)}
                    onPress={() => edit({ ...drafts, students: markRestPresent(drafts.students, dto) })}
                  />
                ) : undefined
              }>
              {dto.students.length === 0 ? (
                <EmptyState icon="students" title={a.studentsEmpty} />
              ) : (
                groups.map((g) => (
                  <View key={g.classId ?? 'none'} style={styles.group}>
                    {groups.length > 1 || g.groupName ? (
                      <AppText variant="label" tone="primary" accessibilityRole="header">
                        {g.groupName ?? a.unknownClass}
                      </AppText>
                    ) : null}
                    {g.students.map((s, i) =>
                      canEditStudent(dto, s) ? (
                        <AttendanceEditor
                          key={s.studentId}
                          name={`${s.firstName} ${s.lastName}`}
                          caption={s.expected ? undefined : `${a.notCounted} — ${a.notCountedCorrectable}`}
                          bordered={i > 0}
                          {...editorProps('students', studentSubject(s))}
                        />
                      ) : (
                        <StudentRow key={s.studentId} student={s} dto={dto} bordered={i > 0} />
                      ),
                    )}
                  </View>
                ))
              )}
            </SectionCard>

            <SectionCard title={a.teachers} icon="teacher" aside={a.progress(teacherRecordedNow, dto.teacherExpectedCount)}>
              {dto.teachers.length === 0 ? <EmptyState icon="teacher" title={a.teachersEmpty} /> : null}
              {dto.teachers.map((t, i) => {
                const name = `${t.firstName} ${t.lastName}`;
                const role = t.role ? ar.labels.teachingRole[t.role] : a.noLongerInTeam;
                const caption = t.teacherId === teacherId ? `${role} · ${ar.classes.you}` : role;
                return canEditTeacher(dto, t) ? (
                  <AttendanceEditor
                    key={t.teacherId}
                    name={name}
                    caption={caption}
                    bordered={i > 0}
                    {...editorProps('teachers', teacherSubject(t))}
                  />
                ) : (
                  <TeacherRow key={t.teacherId} teacher={t} caption={caption} dto={dto} bordered={i > 0} />
                );
              })}
            </SectionCard>
          </>
        ) : null}
      </QueryState>
    </Screen>
  );
}

/* ---------------------------------- rows ---------------------------------- */

const statusTint = (colors: ColorTokens, status: AttendanceStatus) =>
  ({
    PRESENT: { bg: colors.primary, fg: colors.primaryForeground },
    LATE: { bg: colors.warning, fg: '#ffffff' },
    ABSENT: { bg: colors.destructive, fg: colors.destructiveForeground },
    EXCUSED: { bg: colors.secondaryForeground, fg: colors.secondary },
  })[status];

/** An editable row (student or team member): four status buttons (a radio group), optional note, unsaved marker. */
function AttendanceEditor({
  subject,
  name,
  caption,
  draft,
  bordered,
  disabled,
  noteOpen,
  onToggleNote,
  onStatus,
  onNote,
}: {
  subject: Subject;
  name: string;
  caption?: string;
  draft: Draft;
  bordered: boolean;
  disabled: boolean;
  noteOpen: boolean;
  onToggleNote: () => void;
  onStatus: (status: AttendanceStatus) => void;
  onNote: (note: string) => void;
}) {
  const { colors } = useAppTheme();
  const shown = effective(draft, subject);
  const changed = draft.has(subject.id);
  const draftNote = draft.get(subject.id)?.note;
  return (
    <View style={[styles.editor, bordered && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
      <View style={styles.row}>
        <InitialsAvatar name={name} size={32} />
        <View style={styles.flex}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {name}
          </AppText>
          {caption ? (
            <AppText variant="small" tone="muted" numberOfLines={2}>
              {caption}
            </AppText>
          ) : null}
        </View>
        {changed ? (
          <View accessible accessibilityLabel={a.unsaved(1)} style={[styles.dot, { backgroundColor: colors.warning }]} />
        ) : null}
        {shown.status ? (
          <Pressable
            onPress={onToggleNote}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`${shown.note ? a.editNote : a.addNote} — ${name}`}
            hitSlop={8}
            style={styles.noteButton}>
            <Icon name="notes" size={18} color={shown.note ? colors.primary : colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.statuses} accessibilityRole="radiogroup" accessibilityLabel={a.statusGroup(name)}>
        {STATUSES.map((status) => {
          const selected = shown.status === status;
          const tint = statusTint(colors, status);
          return (
            <Pressable
              key={status}
              onPress={() => onStatus(status)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityLabel={a.status[status]}
              accessibilityState={{ selected, checked: selected, disabled }}
              style={({ pressed }) => [
                styles.statusButton,
                selected
                  ? { backgroundColor: tint.bg, borderColor: tint.bg }
                  : { backgroundColor: pressed ? colors.accent : colors.card, borderColor: colors.input },
              ]}>
              <AppText variant="small" numberOfLines={1} style={{ color: selected ? tint.fg : colors.foreground }}>
                {a.short[status]}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {noteOpen ? (
        <View style={styles.column}>
          <TextInput
            value={draftNote ?? shown.note ?? ''}
            onChangeText={onNote}
            editable={!disabled}
            maxLength={NOTE_MAX}
            placeholder={a.notePlaceholder}
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel={`${a.note} — ${name}`}
            multiline
            style={[styles.noteInput, { borderColor: colors.input, color: colors.foreground, backgroundColor: colors.card }]}
          />
          <AppText variant="small" tone="muted">
            {a.noteLimit((draftNote ?? shown.note ?? '').length)}
          </AppText>
        </View>
      ) : shown.note ? (
        <AppText variant="small" tone="muted" numberOfLines={2}>
          {a.note}: {shown.note}
        </AppText>
      ) : null}
    </View>
  );
}

/** A student the teacher may not change now: the server's saved value, read-only, with the reason. */
function StudentRow({ student: s, dto, bordered }: { student: RosterStudent; dto: SessionAttendance; bordered: boolean }) {
  const { colors } = useAppTheme();
  const name = `${s.firstName} ${s.lastName}`;
  const status = s.status ? a.status[s.status] : a.notRecorded;
  const locked = dto.editable && s.status !== null && !dto.correctable;
  return (
    <View
      style={[styles.readRow, bordered && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}
      accessible
      accessibilityLabel={`${name}، ${status}${s.expected ? '' : `، ${a.notCounted}`}${s.note ? `، ${a.note}: ${s.note}` : ''}`}>
      <InitialsAvatar name={name} size={36} />
      <View style={styles.flex}>
        <AppText variant="body" numberOfLines={1}>
          {name}
        </AppText>
        {!s.expected ? (
          <AppText variant="small" tone="muted" numberOfLines={2}>
            {a.notCounted} — {a.notCountedHint}
          </AppText>
        ) : null}
        {locked ? (
          <AppText variant="small" tone="muted">
            {a.savedLocked}
          </AppText>
        ) : null}
        {s.note ? (
          <AppText variant="small" tone="muted" numberOfLines={2}>
            {a.note}: {s.note}
          </AppText>
        ) : null}
      </View>
      <AttendanceStatusBadge status={s.status} />
    </View>
  );
}

/** A team member that cannot be changed now (not started, cancelled, or window closed). */
function TeacherRow({
  teacher: t,
  caption,
  dto,
  bordered,
}: {
  teacher: RosterTeacher;
  caption: string;
  dto: SessionAttendance;
  bordered: boolean;
}) {
  const { colors } = useAppTheme();
  const name = `${t.firstName} ${t.lastName}`;
  const status = t.status ? a.status[t.status] : a.notRecorded;
  const locked = dto.editable && t.status !== null && !dto.correctable;
  return (
    <View
      style={[styles.readRow, bordered && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}
      accessible
      accessibilityLabel={`${name}، ${caption}، ${status}${t.note ? `، ${a.note}: ${t.note}` : ''}`}>
      <InitialsAvatar name={name} size={32} />
      <View style={styles.flex}>
        <AppText variant="body" numberOfLines={1}>
          {name}
        </AppText>
        <AppText variant="small" tone="muted">
          {caption}
        </AppText>
        {locked ? (
          <AppText variant="small" tone="muted">
            {a.savedLocked}
          </AppText>
        ) : null}
        {t.note ? (
          <AppText variant="small" tone="muted" numberOfLines={2}>
            {a.note}: {t.note}
          </AppText>
        ) : null}
      </View>
      <AttendanceStatusBadge status={t.status} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  shrink: { flexShrink: 1 },
  column: { gap: spacing.xs },
  progressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  group: { gap: 0, paddingTop: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  readRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, minHeight: 52 },
  editor: { gap: spacing.sm, paddingVertical: spacing.sm },
  statuses: { flexDirection: 'row', gap: spacing.xs },
  statusButton: {
    flex: 1,
    minHeight: touchTarget - 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 2,
  },
  noteButton: { padding: spacing.xs },
  noteInput: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  dot: { width: 8, height: 8, borderRadius: radius.full },
  savedToast: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  saveBar: {
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  saveInfo: { gap: 2 },
  flex: { flex: 1 },
});
