import { Stack, usePreventRemove, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { EmptyState, QueryState } from '@/components/feedback';
import { AlertBox, AppText, Button, Card, Screen, SuccessToast } from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { ar } from '@/i18n/ar';
import { errorMessage } from '@/services/api';
import { fontFamilies, radius, spacing, useAppTheme } from '@/theme';

import { classifyNoteError, NOTE_MAX_LENGTH, validateNote } from './notes-model';
import { PrivateNotice } from './teacher-notes';
import type { TeacherNote } from './types';
import { useConfirmThenBack } from './use-confirm-then-back';
import { useSaveNote, useTeacherNotes } from './use-notes';

const n = ar.notes;

/**
 * «ملاحظة جديدة» / «تعديل الملاحظة»: the note's only field, its text
 * (POST /teacher/notes or PATCH /teacher/notes/:id — CreateTeacherNoteDto:
 * trimmed, 1–2000). The owner and dates are the server's. Nothing is shown as
 * saved before the server confirms it; a failure keeps the text.
 */
export function TeacherNoteFormScreen({ noteId }: { noteId?: string }) {
  const { user } = useSession();
  const teacherId = user?.teacherId ?? '';
  const router = useRouter();
  const notes = useTeacherNotes(teacherId);
  const title = noteId ? n.editTitle : n.newTitle;

  if (!noteId) return <NoteEditor teacherId={teacherId} title={title} />;
  // Only a note of MY list can be edited (the server checks the owner again)
  const note = notes.data?.find((x) => x.id === noteId);
  // Keyed: the editor starts from the saved text of THIS note
  if (note) return <NoteEditor key={note.id} teacherId={teacherId} title={title} note={note} />;
  return (
    <Screen>
      <Stack.Screen options={{ title }} />
      <QueryState query={notes}>
        <EmptyState
          icon="notes"
          title={n.notFound}
          description={n.notFoundHint}
          action={<Button variant="outline" label={n.backToList} onPress={() => router.replace('/teacher/notes')} />}
        />
      </QueryState>
    </Screen>
  );
}

function NoteEditor({ teacherId, title, note }: { teacherId: string; title: string; note?: TeacherNote }) {
  const { colors } = useAppTheme();
  const save = useSaveNote(teacherId, note?.id);
  const { confirmation, confirm } = useConfirmThenBack(
    note ? { pathname: '/teacher/notes/[id]', params: { id: note.id } } : '/teacher/notes',
  );
  const initial = note?.content ?? '';
  const [text, setText] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  const saving = save.isPending;
  const dirty = text !== initial;
  // Editing: saving the same text again changes nothing
  const changed = text.trim() !== initial.trim();
  const invalid = validateNote(text);
  const showInvalid = (submitted || text.length > NOTE_MAX_LENGTH) && invalid;

  const disablePrevention = usePreventRemove(dirty && !saving && !confirmation, ({ repeat }) => {
    Alert.alert(n.leaveTitle, n.leaveMessage, [
      { text: n.stay, style: 'cancel' },
      { text: n.discard, style: 'destructive', onPress: repeat },
    ]);
  });

  async function onSave() {
    if (submitting.current || confirmation) return;
    setSubmitted(true);
    if (invalid || !changed) return;
    submitting.current = true;
    setError(null);
    try {
      await save.mutateAsync(text.trim());
      disablePrevention();
      confirm(note ? n.updated_ok : n.created_ok);
      return; // stays locked until the screen goes back
    } catch (e) {
      // The text stays on screen
      const kind = classifyNoteError(e);
      setError(kind === 'offline' ? n.offlineSave : kind === 'notFound' ? n.goneOnSave : errorMessage(e));
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
          <View style={styles.inline}>
            {dirty ? (
              <>
                <View style={[styles.dot, { backgroundColor: colors.warning }]} />
                <AppText variant="small" style={[styles.flex, { color: colors.warning }]}>
                  {n.unsaved}
                </AppText>
              </>
            ) : (
              <AppText variant="small" tone="muted" style={styles.flex}>
                {note ? n.nothingToSave : n.formHint}
              </AppText>
            )}
          </View>
          <Button
            label={saving ? n.saving : n.save}
            icon="success"
            loading={saving}
            disabled={saving || (note ? !changed : false)}
            fullWidth
            onPress={() => void onSave()}
          />
        </>
      )}
    </View>
  );

  return (
    <Screen footer={footer}>
      <Stack.Screen options={{ title }} />
      <Card style={styles.card}>
        <AppText variant="label" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {n.field}
          <AppText variant="label" tone="destructive">
            {' *'}
          </AppText>
        </AppText>
        <TextInput
          value={text}
          onChangeText={(value) => {
            setText(value);
            setError(null);
          }}
          editable={!saving && !confirmation}
          multiline
          autoFocus={!note}
          textAlignVertical="top"
          placeholder={n.placeholder}
          placeholderTextColor={colors.mutedForeground}
          accessibilityLabel={n.field}
          accessibilityHint={n.formHint}
          // One character over the limit is allowed so the message can explain it
          maxLength={NOTE_MAX_LENGTH + 1}
          style={[
            styles.input,
            { color: colors.foreground, borderColor: showInvalid ? colors.destructive : colors.input, backgroundColor: colors.card },
          ]}
        />
        <View style={styles.meta}>
          <AppText variant="small" tone="destructive" style={styles.flex}>
            {showInvalid ? (invalid === 'required' ? n.required : n.tooLong) : ''}
          </AppText>
          <AppText variant="small" tone={text.length > NOTE_MAX_LENGTH ? 'destructive' : 'muted'} style={styles.counter}>
            {n.length(text.length, NOTE_MAX_LENGTH)}
          </AppText>
        </View>
      </Card>
      <PrivateNotice />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  input: {
    minHeight: 180,
    maxHeight: 360,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    fontFamily: fontFamilies.regular,
    fontSize: 16,
    lineHeight: 26,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  counter: { fontVariant: ['tabular-nums'] },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  bar: {
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  flex: { flex: 1 },
});
