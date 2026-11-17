import { Stack, usePreventRemove, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { EmptyState, QueryState } from '@/components/feedback';
import { AlertBox, AppText, Button, Card, FilterChip, Pill, Screen, SuccessToast } from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { usePreferences } from '@/features/preferences/preferences';
import { ar } from '@/i18n/ar';
import { auto, formatDateLong } from '@/i18n/format';
import { errorMessage } from '@/services/api';
import { fontFamilies, radius, spacing, touchTarget, useAppTheme } from '@/theme';

import {
  audienceTargets,
  classifyAnnouncementError,
  CONTENT_MAX,
  draftOfAnnouncement,
  isDay,
  TITLE_MAX,
  updateBody,
  validateAnnouncement,
  type AnnouncementDraft,
} from './announcement-model';
import type { Announcement } from './announcement-types';
import { platformClock, teacherClasses } from './dashboard-model';
import { isAnnouncementUnavailable } from './teacher-announcement';
import type { TeacherWorkspace } from './types';
import { useAnnouncement, useSaveAnnouncement } from './use-announcements';
import { useConfirmThenBack } from './use-confirm-then-back';
import { useTeacherWorkspace } from './use-teacher-dashboard';

const t = ar.announcements;

/**
 * «إعلان جديد» (POST, TeacherAnnouncementDto: title, content, my current
 * classes, optional last day; publish now or save as a draft — no
 * scheduling for teachers) / «تعديل الإعلان» (PATCH, my own only: a draft is
 * fully editable; once published only title, content and the last day).
 */
export function TeacherAnnouncementFormScreen({ announcementId }: { announcementId?: string }) {
  const { user } = useSession();
  const teacherId = user?.teacherId ?? '';
  const router = useRouter();
  const workspace = useTeacherWorkspace(teacherId);
  const query = useAnnouncement(teacherId, announcementId ?? '');
  const title = announcementId ? t.editTitle : t.newTitle;
  const unavailable = (
    <Screen>
      <Stack.Screen options={{ title }} />
      <EmptyState
        icon="forbidden"
        title={t.notFound}
        description={t.notFoundHint}
        action={<Button variant="outline" label={t.backToList} onPress={() => router.replace('/teacher/announcements')} />}
      />
    </Screen>
  );

  if (announcementId && query.isError && isAnnouncementUnavailable(query.error)) return unavailable;
  // Somebody else's, or archived: never an edit form (the server would refuse)
  if (announcementId && query.data && (!query.data.canManage || query.data.status === 'ARCHIVED')) return unavailable;
  if (workspace.data && (!announcementId || query.data))
    return <AnnouncementForm key={query.data?.id ?? 'new'} teacherId={teacherId} workspace={workspace.data} announcement={query.data} />;
  return (
    <Screen>
      <Stack.Screen options={{ title }} />
      <QueryState query={announcementId ? [workspace, query] : workspace}>{null}</QueryState>
    </Screen>
  );
}

function AnnouncementForm({ teacherId, workspace, announcement }: { teacherId: string; workspace: TeacherWorkspace; announcement?: Announcement }) {
  const { colors } = useAppTheme();
  const timeZone = usePreferences().data?.timezone;
  // Targets: my current, ACTIVE classes (the server refuses an inactive one)
  const classes = teacherClasses(workspace).filter((c) => c.status === 'ACTIVE');
  const [initial] = useState(() => draftOfAnnouncement(announcement, new Set(classes.map((c) => c.id))));
  const [draft, setDraft] = useState<AnnouncementDraft>(initial);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const save = useSaveAnnouncement(teacherId, announcement);
  const { confirmation, confirm } = useConfirmThenBack(
    announcement ? { pathname: '/teacher/announcements/[id]', params: { id: announcement.id } } : '/teacher/announcements',
  );

  // After publication the classes are locked (ANNOUNCEMENT_PUBLISHED_LOCKED)
  const lockedTargets = announcement?.status === 'PUBLISHED';
  const today = announcement ? null : platformClock(timeZone).today;
  const invalid = validateAnnouncement(draft, today, lockedTargets);
  const dirty = announcement
    ? Object.keys(updateBody(announcement, draft)).length > 0
    : JSON.stringify(draft) !== JSON.stringify(initial);
  const saving = save.isPending;
  const locked = saving || Boolean(confirmation);

  const disablePrevention = usePreventRemove(dirty && !saving && !confirmation, ({ repeat }) => {
    Alert.alert(t.leaveTitle, t.leaveMessage, [
      { text: t.stay, style: 'cancel' },
      { text: t.discard, style: 'destructive', onPress: repeat },
    ]);
  });

  const set = (patch: Partial<AnnouncementDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setError(null);
  };

  async function onSave(mode: 'PUBLISH_NOW' | 'DRAFT') {
    if (submitting.current || confirmation) return;
    setSubmitted(true);
    if (invalid || (announcement && !dirty)) return;
    submitting.current = true;
    setError(null);
    try {
      const result = await save.mutateAsync({ draft, mode });
      disablePrevention();
      confirm(announcement ? t.updated : mode === 'DRAFT' ? t.drafted : `${t.created}${t.notified(result.notifiedCount)}`);
      return; // stays locked until the screen goes back
    } catch (e) {
      // Everything typed stays on screen
      setError(classifyAnnouncementError(e) === 'offline' ? t.offlineSave : errorMessage(e));
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
          {submitted && invalid ? <AlertBox message={t.errors[invalid]} /> : null}
          <AppText variant="small" tone={dirty ? 'warning' : 'muted'}>
            {dirty ? t.unsaved : lockedTargets ? t.publishedLockHint : t.formHint}
          </AppText>
          {announcement ? (
            <Button label={saving ? t.saving : t.saveEdit} icon="success" loading={saving} disabled={saving || !dirty} fullWidth onPress={() => void onSave('PUBLISH_NOW')} />
          ) : (
            <View style={styles.actions}>
              <View style={styles.flex}>
                <Button variant="outline" label={t.saveDraft} disabled={saving} fullWidth onPress={() => void onSave('DRAFT')} />
              </View>
              <View style={styles.flex}>
                <Button label={saving ? t.saving : t.publishNow} icon="announcements" loading={saving} fullWidth onPress={() => void onSave('PUBLISH_NOW')} />
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );

  const input = [styles.input, { color: colors.foreground, borderColor: colors.input }];
  const expiry = draft.expiresAt.trim();
  return (
    <Screen footer={footer}>
      <Stack.Screen options={{ title: announcement ? t.editTitle : t.newTitle }} />
      <Card style={styles.section}>
        <AppText variant="label">{t.titleLabel} *</AppText>
        <TextInput value={draft.title} onChangeText={(v) => set({ title: v })} editable={!locked} maxLength={TITLE_MAX + 1} accessibilityLabel={t.titleLabel} style={input} />
        <AppText variant="label">{t.contentLabel} *</AppText>
        <TextInput
          value={draft.content}
          onChangeText={(v) => set({ content: v })}
          editable={!locked}
          multiline
          textAlignVertical="top"
          maxLength={CONTENT_MAX + 1}
          accessibilityLabel={t.contentLabel}
          style={[...input, styles.multiline]}
        />
      </Card>

      <Card style={styles.section}>
        <AppText variant="label">{t.classesLabel} *</AppText>
        {lockedTargets && announcement ? (
          <>
            <View style={styles.chips}>
              {audienceTargets(announcement).map((name) => (
                <Pill key={name} label={auto(name)} tone="brand" />
              ))}
            </View>
            <AppText variant="small" tone="muted">
              {t.publishedLockHint}
            </AppText>
          </>
        ) : (
          <View style={styles.chips} accessibilityLabel={t.classesLabel}>
            {classes.map((c) => {
              const selected = draft.classIds.includes(c.id);
              return (
                <FilterChip
                  key={c.id}
                  label={c.groupName}
                  role="checkbox"
                  selected={selected}
                  onPress={() => !locked && set({ classIds: selected ? draft.classIds.filter((id) => id !== c.id) : [...draft.classIds, c.id] })}
                />
              );
            })}
          </View>
        )}
      </Card>

      <Card style={styles.section}>
        <AppText variant="label">{t.expiryLabel}</AppText>
        <TextInput
          value={draft.expiresAt}
          onChangeText={(v) => set({ expiresAt: v })}
          editable={!locked}
          placeholder="2026-12-31"
          placeholderTextColor={colors.mutedForeground}
          keyboardType="numbers-and-punctuation"
          autoCorrect={false}
          maxLength={10}
          accessibilityLabel={t.expiryLabel}
          style={[...input, styles.ltr]}
        />
        <AppText variant="small" tone="muted">
          {expiry && isDay(expiry) ? t.expiryPreview(formatDateLong(expiry)) : t.expiryHint}
        </AppText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
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
  multiline: { minHeight: 140, paddingVertical: spacing.sm, lineHeight: 24 },
  ltr: { textAlign: 'left', writingDirection: 'ltr' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.sm },
  bar: {
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  flex: { flex: 1 },
});
