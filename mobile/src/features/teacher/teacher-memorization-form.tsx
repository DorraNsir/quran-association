import { Stack, usePreventRemove, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState, QueryState } from '@/components/feedback';
import { AlertBox, AppText, Button, Card, Icon, InitialsAvatar, Screen } from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { usePreferences } from '@/features/preferences/preferences';
import { ar } from '@/i18n/ar';
import { formatDateLong, ltr } from '@/i18n/format';
import { errorMessage } from '@/services/api';
import { fontFamilies, radius, spacing, touchTarget, useAppTheme } from '@/theme';
import { headerTitle } from '@/theme/navigation';

import { searchSurahs, surahLabel, type Surah } from '../quran/surahs';
import { studentProfile } from './classes-model';
import { currentSemester, platformClock } from './dashboard-model';
import { classifyMemorizationError, useSaveMemorization, validateMemorization } from './memorization-save';
import { platformDateOf, SEMESTERS, semesterEntry } from './memorization-model';
import type { Semester } from './types';
import { useStudentMemorization } from './use-memorization';
import { useTeacherWorkspace } from './use-teacher-dashboard';

const m = ar.memorization;

const isSemester = (value: string | undefined): value is Semester => SEMESTERS.includes(value as Semester);

/**
 * «تحديث الحفظ»: set THE last memorized surah of one student for one semester
 * of the current academic year (PUT /teacher/students/:id/memorization —
 * creates or updates the semester's single record). The only field the API
 * has is the surah (1–114): no verses, type, date, evaluation or comment.
 * Nothing is shown as saved before the server confirms it.
 */
export function TeacherMemorizationFormScreen({ studentId, semesterParam }: { studentId: string; semesterParam?: string }) {
  const { user } = useSession();
  const teacherId = user?.teacherId ?? '';
  const router = useRouter();
  const { colors } = useAppTheme();
  const preferences = usePreferences();
  const workspace = useTeacherWorkspace(teacherId);
  const timeZone = preferences.data?.timezone;
  const clock = platformClock(timeZone);
  const year = preferences.data?.currentAcademicYear ?? null;

  const profile = workspace.data ? studentProfile(workspace.data, studentId, clock.today) : null;
  const semester: Semester | null = isSemester(semesterParam) ? semesterParam : year ? currentSemester(year, clock.today) : null;
  // Only a student of MY classes is read or written (the backend refuses others anyway)
  const results = useStudentMemorization(teacherId, profile ? studentId : '', year);
  const index = semester ? SEMESTERS.indexOf(semester) : -1;
  const result = index >= 0 ? results[index] : undefined;
  const entry = semester ? semesterEntry(semester, result?.data, result?.error) : null;
  const saved = entry?.kind === 'recorded' ? entry.record : null;

  const save = useSaveMemorization(teacherId, studentId);
  // undefined = untouched: the saved value is shown and kept
  const [picked, setPicked] = useState<number | undefined>();
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  const savedNumber = saved?.lastMemorizedSurahNumber ?? null;
  const value = picked ?? savedNumber;
  const dirty = picked !== undefined && picked !== savedNumber;
  const saving = save.isPending;

  const disablePrevention = usePreventRemove(dirty && !saving, ({ repeat }) => {
    Alert.alert(m.leaveTitle, m.leaveMessage, [
      { text: m.stay, style: 'cancel' },
      { text: m.discard, style: 'destructive', onPress: repeat },
    ]);
  });

  async function onSave() {
    if (!year || !semester || submitting.current || !dirty) return;
    const input = { academicYearId: year.id, semester, lastMemorizedSurahNumber: value };
    const invalid = validateMemorization(input);
    if (invalid) {
      setError(invalid === 'surahRequired' ? m.surahRequired : m.surahInvalid);
      return;
    }
    submitting.current = true;
    setError(null);
    try {
      await save.mutateAsync({ ...input, lastMemorizedSurahNumber: input.lastMemorizedSurahNumber! });
      // Confirmed by the server: leave; the refreshed screens show its value
      disablePrevention();
      router.back();
    } catch (e) {
      // The choice stays on screen
      const kind = classifyMemorizationError(e);
      setError(kind === 'offline' ? m.offlineSave : errorMessage(e));
    } finally {
      submitting.current = false;
    }
  }

  const list = searchSurahs(query);
  const isCurrent = !!year && !!semester && semester === currentSemester(year, clock.today);
  const loading = results.some((r) => r.isPending && r.fetchStatus !== 'idle');

  const footer =
    profile && year && semester && entry && entry.kind !== 'notMine' ? (
      <View style={[styles.saveBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {error ? <AlertBox message={error} /> : null}
        <View style={styles.inline}>
          {dirty ? (
            <>
              <View style={[styles.dot, { backgroundColor: colors.warning }]} />
              <AppText variant="small" style={{ color: colors.warning }}>
                {m.unsaved}
              </AppText>
            </>
          ) : null}
          <AppText variant="small" tone="muted" style={styles.flex} numberOfLines={1}>
            {value ? `${m.selected}: ${surahLabel(value)}` : m.pick}
          </AppText>
        </View>
        <Button
          label={saving ? m.saving : m.save}
          icon="success"
          loading={saving}
          disabled={!dirty || saving}
          fullWidth
          onPress={() => void onSave()}
        />
      </View>
    ) : undefined;

  return (
    <Screen footer={footer}>
      <Stack.Screen options={{ title: headerTitle(profile ? `${m.formTitle} — ${profile.name}` : m.formTitle) }} />
      <QueryState query={[preferences, workspace]}>
        {!profile ? (
          <EmptyState
            icon="forbidden"
            title={m.studentUnavailable}
            description={m.studentUnavailableHint}
            action={<Button variant="outline" label={ar.classes.back} onPress={() => router.back()} />}
          />
        ) : !year || !semester ? (
          <EmptyState icon="classes" title={m.noYear} />
        ) : result?.isError && !entry ? (
          <ErrorState error={result.error} onRetry={() => void result.refetch()} />
        ) : loading || !entry ? (
          <LoadingState />
        ) : entry.kind === 'notMine' ? (
          <EmptyState icon="forbidden" title={m.notMine} />
        ) : (
          <>
            <Card style={styles.context}>
              <View style={styles.row}>
                <InitialsAvatar name={profile.name} size={44} />
                <View style={styles.flex}>
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {profile.name}
                  </AppText>
                  <AppText variant="small" tone="muted" numberOfLines={1}>
                    {profile.groupClass.groupName} · {ltr(year.label)} · {ar.labels.semester[semester]}
                  </AppText>
                </View>
              </View>
              <View style={[styles.saved, { borderColor: colors.border }]}>
                <AppText variant="small" tone="muted">
                  {m.saved}
                </AppText>
                {saved ? (
                  <>
                    <AppText variant="bodyStrong">{surahLabel(saved.lastMemorizedSurahNumber)}</AppText>
                    <AppText variant="small" tone="muted">
                      {m.updatedOn(formatDateLong(platformDateOf(saved.updatedAt, timeZone)))}
                    </AppText>
                  </>
                ) : (
                  <AppText variant="body" tone="muted">
                    {m.notSetLong}
                  </AppText>
                )}
              </View>
            </Card>

            {!isCurrent ? <AlertBox tone="info" message={m.otherSemester} /> : null}
            <AppText variant="small" tone="muted">
              {m.formHint} {m.sharedRecord}
            </AppText>

            <Card style={styles.picker}>
              <View style={[styles.search, { borderColor: colors.input, backgroundColor: colors.card }]}>
                <Icon name="filter" size={16} color={colors.mutedForeground} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={m.search}
                  placeholderTextColor={colors.mutedForeground}
                  accessibilityLabel={m.searchLabel}
                  autoCorrect={false}
                  style={[styles.searchInput, { color: colors.foreground }]}
                />
              </View>
              <View accessibilityRole="radiogroup" accessibilityLabel={m.lastSurah}>
                {list.length === 0 ? (
                  <EmptyState icon="classes" title={m.noMatch} />
                ) : (
                  list.map((surah) => (
                    <SurahOption
                      key={surah.number}
                      surah={surah}
                      selected={value === surah.number}
                      disabled={saving}
                      onPress={() => {
                        setPicked(surah.number);
                        setError(null);
                      }}
                    />
                  ))
                )}
              </View>
            </Card>
          </>
        )}
      </QueryState>
    </Screen>
  );
}

function SurahOption({
  surah,
  selected,
  disabled,
  onPress,
}: {
  surah: Surah;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityLabel={`سورة ${surah.nameAr}، رقم ${surah.number}`}
      accessibilityState={{ selected, checked: selected, disabled }}
      style={({ pressed }) => [
        styles.option,
        selected ? { backgroundColor: colors.brandSoft, borderColor: colors.primary } : { borderColor: 'transparent' },
        pressed && !selected && { backgroundColor: colors.accent },
      ]}>
      <AppText variant="small" tone="muted" style={styles.number}>
        {surah.number}
      </AppText>
      <AppText variant="body" style={[styles.flex, selected && { color: colors.brandSoftForeground }]}>
        سورة {surah.nameAr}
      </AppText>
      {selected ? <Icon name="success" size={18} color={colors.primary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  context: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  saved: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm, gap: 2 },
  picker: { gap: spacing.sm },
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
  option: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
  },
  number: { width: 28, textAlign: 'center', fontVariant: ['tabular-nums'] },
  dot: { width: 8, height: 8, borderRadius: radius.full },
  saveBar: {
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  flex: { flex: 1 },
});
