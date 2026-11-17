import { Stack, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { EmptyState, QueryState } from '@/components/feedback';
import { AlertBox, AppText, Button, Card, Icon, Pill, Screen, SuccessToast } from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { usePreferences } from '@/features/preferences/preferences';
import { ar } from '@/i18n/ar';
import { auto, formatDateLong } from '@/i18n/format';
import { ApiError, errorMessage } from '@/services/api';
import { radius, spacing, useAppTheme } from '@/theme';
import { headerTitle } from '@/theme/navigation';

import { audienceTargets, authorName, classifyAnnouncementError, dayOf, STATE_TONE } from './announcement-model';
import type { Announcement } from './announcement-types';
import { useConfirmThenBack } from './use-confirm-then-back';
import { announcementKey, useAnnouncement, useAnnouncementAction, type AnnouncementAction } from './use-announcements';
import { usePullToRefresh } from './use-refresh';

const t = ar.announcements;

/** 404 / 403 / 400: missing and not-visible look the same (the server leaks nothing). */
export const isAnnouncementUnavailable = (error: unknown) =>
  error instanceof ApiError && (error.isNotFound || error.isForbidden || error.status === 400);

/** The publication line of the web: when it was / will be published, or «مسودة». */
function publicationLine(a: Announcement, timeZone: string | undefined) {
  if (a.state === 'DRAFT') return t.draftLine;
  const day = formatDateLong(dayOf(a, timeZone));
  return a.state === 'SCHEDULED' ? t.scheduledLine(day) : t.publishedOn(day);
}

/**
 * One announcement in full (GET /teacher/announcements/:id). Its actions —
 * only on MY announcements (`canManage`), and only those its status allows:
 * edit (not archived), publish (a draft), archive (a published one), delete.
 */
export function TeacherAnnouncementScreen({ announcementId }: { announcementId: string }) {
  const { user } = useSession();
  const teacherId = user?.teacherId ?? '';
  const router = useRouter();
  const { colors } = useAppTheme();
  const timeZone = usePreferences().data?.timezone;
  const query = useAnnouncement(teacherId, announcementId);
  const { refreshing, onRefresh } = usePullToRefresh([announcementKey(teacherId, announcementId)]);
  const action = useAnnouncementAction(teacherId, announcementId);
  const { confirmation, confirm } = useConfirmThenBack('/teacher/announcements');
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const a = query.data;

  if (confirmation)
    return (
      <Screen>
        <SuccessToast message={confirmation} />
      </Screen>
    );
  if (query.isError && isAnnouncementUnavailable(query.error))
    return (
      <Screen>
        <EmptyState
          icon="announcements"
          title={t.notFound}
          description={t.notFoundHint}
          action={<Button variant="outline" label={t.backToList} onPress={() => router.replace('/teacher/announcements')} />}
        />
      </Screen>
    );

  function ask(kind: AnnouncementAction) {
    if (!a || busy.current) return;
    Alert.alert(t.confirm[kind].title, t.confirm[kind].message(a.title), [
      { text: t.cancel, style: 'cancel' },
      { text: kind === 'publish' ? t.publish : kind === 'archive' ? t.archive : t.delete, style: kind === 'delete' ? 'destructive' : 'default', onPress: () => void run(kind) },
    ]);
  }

  async function run(kind: AnnouncementAction) {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    setDone(null);
    try {
      await action.mutateAsync(kind);
      if (kind === 'delete') {
        confirm(t.done_delete);
        return; // stays locked until the screen goes back
      }
      setDone(kind === 'publish' ? t.done_publish : t.done_archive);
    } catch (e) {
      setError(classifyAnnouncementError(e) === 'offline' ? t.offlineAction : errorMessage(e));
      // The server's state may have changed (published meanwhile…): reload it
      if (classifyAnnouncementError(e) === 'conflict') void query.refetch();
    }
    busy.current = false;
  }

  const working = action.isPending;
  const footer = a?.canManage ? (
    <View style={[styles.bar, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {done ? <SuccessToast message={done} /> : null}
      {error ? <AlertBox message={error} /> : null}
      <View style={styles.actions}>
        {a.status === 'DRAFT' ? (
          <View style={styles.flex}>
            <Button icon="announcements" label={working ? t.working : t.publish} loading={working} fullWidth onPress={() => ask('publish')} />
          </View>
        ) : null}
        {a.status !== 'ARCHIVED' ? (
          <View style={styles.flex}>
            <Button
              variant="outline"
              icon="edit"
              label={t.edit}
              fullWidth
              disabled={working}
              onPress={() => router.push({ pathname: '/teacher/announcements/[id]/edit', params: { id: a.id } })}
            />
          </View>
        ) : null}
      </View>
      <View style={styles.actions}>
        {a.status === 'PUBLISHED' ? (
          <View style={styles.flex}>
            <Button variant="outline" icon="ban" label={t.archive} fullWidth disabled={working} onPress={() => ask('archive')} />
          </View>
        ) : null}
        <View style={styles.flex}>
          <Button variant="destructive" icon="delete" label={t.delete} fullWidth disabled={working} onPress={() => ask('delete')} />
        </View>
      </View>
    </View>
  ) : undefined;

  const targets = a ? audienceTargets(a) : [];
  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh} footer={footer}>
      {a ? <Stack.Screen options={{ title: headerTitle(a.title) }} /> : null}
      <QueryState query={query}>
        {a ? (
          <>
            <Card style={styles.section}>
              <View style={styles.row}>
                <View style={[styles.tile, { backgroundColor: colors.brandSoft }]}>
                  <Icon name="announcements" size={22} color={colors.primary} />
                </View>
                <AppText variant="bodyStrong" accessibilityRole="header" style={styles.flex}>
                  {auto(a.title)}
                </AppText>
              </View>
              <View style={styles.pills}>
                {a.canManage ? <Pill label={t.state[a.state]} tone={STATE_TONE[a.state]} /> : null}
                <Pill label={t.audience[a.audience]} />
              </View>
              <AppText variant="small" tone="muted">
                {publicationLine(a, timeZone)}
              </AppText>
              {a.expiresAt ? (
                <AppText variant="small" tone="muted">
                  {t.expiresOn(formatDateLong(a.expiresAt))}
                </AppText>
              ) : null}
              <AppText variant="small" tone="muted">
                {t.author}: {auto(authorName(a))}
              </AppText>
            </Card>

            <Card>
              <AppText variant="body" selectable style={styles.text}>
                {auto(a.content)}
              </AppText>
            </Card>

            {targets.length ? (
              <Card style={styles.section}>
                <AppText variant="label">{a.audience === 'SPECIFIC_BRANCHES' ? t.targetsBranches : t.targetsClasses}</AppText>
                <View style={styles.pills}>
                  {targets.map((name) => (
                    <Pill key={name} label={auto(name)} tone="brand" />
                  ))}
                </View>
              </Card>
            ) : null}
          </>
        ) : null}
      </QueryState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tile: { width: 44, height: 44, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  text: { lineHeight: 28 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  bar: {
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  flex: { flex: 1 },
});
