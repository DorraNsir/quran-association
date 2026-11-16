import { Stack, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { EmptyState, QueryState } from '@/components/feedback';
import { AlertBox, AppText, Button, Card, Screen, SuccessToast } from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { usePreferences } from '@/features/preferences/preferences';
import { ar } from '@/i18n/ar';
import { errorMessage } from '@/services/api';
import { spacing, useAppTheme } from '@/theme';

import { classifyNoteError, formatNoteDate, wasEdited } from './notes-model';
import { PrivateNotice } from './teacher-notes';
import { useConfirmThenBack } from './use-confirm-then-back';
import { notesKey, useDeleteNote, useTeacherNotes } from './use-notes';
import { usePullToRefresh } from './use-refresh';

const n = ar.notes;

/** One line, at most 80 characters: names the note in the delete confirmation. */
export function noteExcerpt(content: string, max = 80): string {
  const line = content.replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max).trimEnd()}…` : line;
}

/**
 * One of MY notes, in full (read from my list: the API has no GET by id —
 * an id that is not in my list, e.g. another teacher's, shows «غير موجودة»).
 * Edit and delete are offered because a listed note is always mine; the
 * server checks the owner again on every write.
 */
export function TeacherNoteScreen({ noteId }: { noteId: string }) {
  const { user } = useSession();
  const teacherId = user?.teacherId ?? '';
  const router = useRouter();
  const { colors } = useAppTheme();
  const timeZone = usePreferences().data?.timezone;
  const notes = useTeacherNotes(teacherId);
  const { refreshing, onRefresh } = usePullToRefresh([notesKey(teacherId)]);
  const remove = useDeleteNote(teacherId, noteId);
  const { confirmation, confirm } = useConfirmThenBack('/teacher/notes');
  const [error, setError] = useState<string | null>(null);
  const deleting = useRef(false);

  const note = notes.data?.find((x) => x.id === noteId);

  function askDelete() {
    if (!note || deleting.current) return;
    Alert.alert(n.deleteTitle, n.deleteMessage(noteExcerpt(note.content)), [
      { text: n.cancel, style: 'cancel' },
      { text: n.delete, style: 'destructive', onPress: () => void onDelete() },
    ]);
  }

  async function onDelete() {
    if (deleting.current) return;
    deleting.current = true;
    setError(null);
    try {
      await remove.mutateAsync();
      confirm(n.deleted_ok);
      return; // stays locked until the screen goes back
    } catch (e) {
      const kind = classifyNoteError(e);
      setError(kind === 'offline' ? n.offlineDelete : errorMessage(e));
      if (kind === 'notFound') void notes.refetch();
    }
    deleting.current = false;
  }

  // Deleted: the note has left the list; the confirmation stays until going back
  if (confirmation)
    return (
      <Screen>
        <Stack.Screen options={{ title: n.detailTitle }} />
        <SuccessToast message={confirmation} />
      </Screen>
    );

  const footer = note ? (
    <View style={[styles.bar, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {error ? <AlertBox message={error} /> : null}
      <View style={styles.actions}>
        <View style={styles.flex}>
          <Button
            variant="outline"
            icon="edit"
            label={n.edit}
            fullWidth
            disabled={remove.isPending}
            onPress={() => router.push({ pathname: '/teacher/notes/[id]/edit', params: { id: note.id } })}
          />
        </View>
        <View style={styles.flex}>
          <Button
            variant="destructive"
            icon="delete"
            label={remove.isPending ? n.deleting : n.delete}
            loading={remove.isPending}
            fullWidth
            onPress={askDelete}
          />
        </View>
      </View>
    </View>
  ) : undefined;

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh} footer={footer}>
      <Stack.Screen options={{ title: n.detailTitle }} />
      <QueryState query={notes}>
        {!note ? (
          <EmptyState
            icon="notes"
            title={n.notFound}
            description={n.notFoundHint}
            action={<Button variant="outline" label={n.backToList} onPress={() => router.replace('/teacher/notes')} />}
          />
        ) : (
          <>
            <Card style={styles.card}>
              <View style={[styles.dates, { borderColor: colors.border }]}>
                <AppText variant="small" tone="muted">
                  {n.created}: {formatNoteDate(note.createdAt, timeZone)}
                </AppText>
                {wasEdited(note) ? (
                  <AppText variant="small" tone="muted">
                    {n.updated}: {formatNoteDate(note.updatedAt, timeZone)}
                  </AppText>
                ) : null}
              </View>
              <AppText variant="body" selectable style={styles.content}>
                {note.content}
              </AppText>
            </Card>
            <PrivateNotice />
          </>
        )}
      </QueryState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  dates: { gap: 2, borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: spacing.sm },
  content: { lineHeight: 28 },
  bar: {
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
