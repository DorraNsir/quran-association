import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { EmptyState, QueryState } from '@/components/feedback';
import { AppText, Button, Card, Icon, PressableRow, Screen } from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { usePreferences } from '@/features/preferences/preferences';
import { ar } from '@/i18n/ar';
import { fontFamilies, radius, spacing, touchTarget, useAppTheme } from '@/theme';

import { formatNoteDate, searchNotes, wasEdited } from './notes-model';
import type { TeacherNote } from './types';
import { notesKey, useTeacherNotes } from './use-notes';
import { usePullToRefresh } from './use-refresh';

const n = ar.notes;

/** The lock line shown wherever notes are read or written: nobody else can read them. */
export function PrivateNotice() {
  const { colors } = useAppTheme();
  return (
    <View style={styles.notice}>
      <Icon name="lock" size={14} color={colors.mutedForeground} />
      <AppText variant="small" tone="muted" style={styles.flex}>
        {n.privateNotice}
      </AppText>
    </View>
  );
}

/**
 * «ملاحظاتي»: the signed-in teacher's PRIVATE notebook — their own notes only
 * (GET /teacher/notes never returns anyone else's), most recently updated
 * first. The complete list is loaded (every page), so the search — the web's
 * — covers all of them.
 */
export function TeacherNotesScreen() {
  const { user } = useSession();
  const teacherId = user?.teacherId ?? '';
  const router = useRouter();
  const { colors } = useAppTheme();
  const timeZone = usePreferences().data?.timezone;
  const notes = useTeacherNotes(teacherId);
  const { refreshing, onRefresh } = usePullToRefresh([notesKey(teacherId)]);
  const [query, setQuery] = useState('');

  const all = notes.data ?? [];
  const shown = searchNotes(all, query);
  const searching = query.trim().length > 0;

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <PrivateNotice />
      <QueryState query={notes}>
        <Button label={n.add} icon="add" fullWidth onPress={() => router.push('/teacher/notes/new')} />
        {all.length === 0 ? (
          <Card>
            <EmptyState icon="notes" title={n.empty} description={n.emptyHint} />
          </Card>
        ) : (
          <>
            <View style={[styles.search, { borderColor: colors.input, backgroundColor: colors.card }]}>
              <Icon name="search" size={16} color={colors.mutedForeground} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={n.search}
                placeholderTextColor={colors.mutedForeground}
                accessibilityLabel={n.searchLabel}
                autoCorrect={false}
                returnKeyType="search"
                style={[styles.searchInput, { color: colors.foreground }]}
              />
              {searching ? (
                <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel={n.clearSearch} hitSlop={8}>
                  <Icon name="close" size={16} color={colors.mutedForeground} />
                </Pressable>
              ) : null}
            </View>
            <AppText variant="small" tone="muted" accessibilityLiveRegion="polite">
              {searching ? n.matches(shown.length, all.length) : n.count(all.length)}
            </AppText>
            <Card>
              {shown.length === 0 ? (
                <EmptyState icon="search" title={n.noMatch} />
              ) : (
                shown.map((note, i) => (
                  <NoteRow
                    key={note.id}
                    note={note}
                    timeZone={timeZone}
                    bordered={i > 0}
                    onPress={() => router.push({ pathname: '/teacher/notes/[id]', params: { id: note.id } })}
                  />
                ))
              )}
            </Card>
          </>
        )}
      </QueryState>
    </Screen>
  );
}

function NoteRow({
  note,
  timeZone,
  bordered,
  onPress,
}: {
  note: TeacherNote;
  timeZone: string | undefined;
  bordered: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const date = formatNoteDate(wasEdited(note) ? note.updatedAt : note.createdAt, timeZone);
  const dateLabel = wasEdited(note) ? `${n.updated}: ${date}` : date;
  return (
    <PressableRow bordered={bordered} onPress={onPress} accessibilityLabel={`${dateLabel}، ${note.content.slice(0, 120)}`}>
      <View style={styles.rowTop}>
        <Icon name="notes" size={14} color={colors.primary} />
        <AppText variant="small" tone="muted" style={styles.flex} numberOfLines={1}>
          {dateLabel}
        </AppText>
      </View>
      <AppText variant="body" numberOfLines={3} style={styles.preview}>
        {note.content}
      </AppText>
    </PressableRow>
  );
}

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  search: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, minHeight: touchTarget, fontFamily: fontFamilies.regular, fontSize: 15, textAlign: 'right', writingDirection: 'rtl' },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  preview: { lineHeight: 24 },
  flex: { flex: 1 },
});
