import { Stack, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';

import { EmptyState, QueryState } from '@/components/feedback';
import { AlertBox, AppText, Button, Card, Icon, Pill, Screen, SuccessToast } from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { usePreferences } from '@/features/preferences/preferences';
import { ar } from '@/i18n/ar';
import { auto, formatDateLong, ltr } from '@/i18n/format';
import { ApiError, errorMessage } from '@/services/api';
import { radius, spacing, useAppTheme } from '@/theme';
import { headerTitle } from '@/theme/navigation';

import { platformDateOf } from './memorization-model';
import { openErrorKind, openPrivateFile } from './private-file';
import { classifyResourceError, formatSize, isLinkType, isSafeUrl, publisherName, RESOURCE_ICON, targetLabels } from './resource-model';
import type { Resource } from './resource-types';
import { useConfirmThenBack } from './use-confirm-then-back';
import { usePullToRefresh } from './use-refresh';
import { resourceKey, useDeleteResource, useResource } from './use-resources';

const r = ar.resources;

/** 404 / 403 / 400: missing and not-visible look the same (the server leaks nothing). */
export const isResourceUnavailable = (error: unknown) =>
  error instanceof ApiError && (error.isNotFound || error.isForbidden || error.status === 400);

/**
 * One resource in full (GET /teacher/resources/:id). A file is opened through
 * an AUTHENTICATED download (never its URL in a browser); a link only when it
 * is a valid http(s) URL. Edit / delete only when the server says `canManage`.
 */
export function TeacherResourceScreen({ resourceId }: { resourceId: string }) {
  const { user } = useSession();
  const teacherId = user?.teacherId ?? '';
  const router = useRouter();
  const { colors } = useAppTheme();
  const timeZone = usePreferences().data?.timezone;
  const query = useResource(teacherId, resourceId);
  const { refreshing, onRefresh } = usePullToRefresh([resourceKey(teacherId, resourceId)]);
  const remove = useDeleteResource(teacherId, resourceId);
  const { confirmation, confirm } = useConfirmThenBack('/teacher/resources');
  const [error, setError] = useState<string | null>(null);
  const deleting = useRef(false);
  const res = query.data;

  if (confirmation)
    return (
      <Screen>
        <SuccessToast message={confirmation} />
      </Screen>
    );

  if (query.isError && isResourceUnavailable(query.error))
    return (
      <Screen>
        <EmptyState
          icon="resources"
          title={r.notFound}
          description={r.notFoundHint}
          action={<Button variant="outline" label={r.backToList} onPress={() => router.replace('/teacher/resources')} />}
        />
      </Screen>
    );

  function askDelete() {
    if (!res || deleting.current) return;
    Alert.alert(r.deleteTitle, r.deleteMessage(res.title), [
      { text: r.cancel, style: 'cancel' },
      { text: r.delete, style: 'destructive', onPress: () => void onDelete() },
    ]);
  }

  async function onDelete() {
    if (deleting.current) return;
    deleting.current = true;
    setError(null);
    try {
      await remove.mutateAsync();
      confirm(r.deleted);
      return;
    } catch (e) {
      setError(classifyResourceError(e) === 'offline' ? r.offlineDelete : errorMessage(e));
    }
    deleting.current = false;
  }

  const footer =
    res?.canManage ? (
      <View style={[styles.bar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {error ? <AlertBox message={error} /> : null}
        <View style={styles.actions}>
          <View style={styles.flex}>
            <Button
              variant="outline"
              icon="edit"
              label={r.edit}
              fullWidth
              disabled={remove.isPending}
              onPress={() => router.push({ pathname: '/teacher/resources/[id]/edit', params: { id: res.id } })}
            />
          </View>
          <View style={styles.flex}>
            <Button
              variant="destructive"
              icon="delete"
              label={remove.isPending ? r.deleting : r.delete}
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
      {res ? <Stack.Screen options={{ title: headerTitle(res.title) }} /> : null}
      <QueryState query={query}>
        {res ? (
          <>
            <Card style={styles.section}>
              <View style={styles.row}>
                <View style={[styles.tile, { backgroundColor: colors.brandSoft }]}>
                  <Icon name={RESOURCE_ICON[res.type]} size={24} color={colors.primary} />
                </View>
                <View style={styles.flex}>
                  <AppText variant="bodyStrong" accessibilityRole="header">
                    {auto(res.title)}
                  </AppText>
                  <View style={styles.pills}>
                    <Pill label={r.type[res.type]} />
                    {res.canManage ? <Pill label={r.mine} tone="success" /> : null}
                  </View>
                </View>
              </View>
              <AppText variant="small" tone="muted">
                {r.publishedBy(auto(publisherName(res)), formatDateLong(platformDateOf(res.createdAt, timeZone)))}
              </AppText>
            </Card>

            {isLinkType(res.type) ? <LinkCard resource={res} /> : <FileCard resource={res} />}

            <Card style={styles.section}>
              <AppText variant="label">{r.audience}</AppText>
              <AppText variant="small" tone="muted">
                {r.visibility[res.visibility]}
              </AppText>
              <View style={styles.pills}>
                {targetLabels(res, r.allStudents).map((t) => (
                  <Pill key={t} label={auto(t)} tone="brand" />
                ))}
              </View>
            </Card>

            <Card style={styles.section}>
              <AppText variant="label">{r.description}</AppText>
              <AppText variant="body" tone={res.description ? 'default' : 'muted'} selectable style={styles.text}>
                {res.description ? auto(res.description) : r.noDescription}
              </AppText>
            </Card>
          </>
        ) : null}
      </QueryState>
    </Screen>
  );
}

/** A PRIVATE file: name, size, then an authenticated download handed to the platform viewer. */
function FileCard({ resource: res }: { resource: Resource }) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const file = res.file;

  async function onOpen() {
    if (!file || busy.current) return;
    busy.current = true;
    setOpening(true);
    setError(null);
    try {
      await openPrivateFile(file, res.title);
    } catch (e) {
      setError(r.fileErrors[openErrorKind(e)]);
    } finally {
      busy.current = false;
      setOpening(false);
    }
  }

  return (
    <Card style={styles.section}>
      <AppText variant="label">{r.file}</AppText>
      {file ? (
        <>
          <AppText variant="body" numberOfLines={2}>
            {ltr(file.fileName)}
          </AppText>
          <AppText variant="small" tone="muted">
            {formatSize(file.size)} · {ltr(file.mimeType)}
          </AppText>
          {error ? <AlertBox message={error} /> : null}
          <Button icon="open" label={opening ? r.opening : r.openFile} loading={opening} fullWidth onPress={() => void onOpen()} />
          <AppText variant="small" tone="muted">
            {r.privateFileNote}
          </AppText>
        </>
      ) : (
        <AlertBox message={r.fileErrors.unavailable} />
      )}
    </Card>
  );
}

/** An external link: shown as text; opened by the system ONLY if it is a valid http(s) URL. */
function LinkCard({ resource: res }: { resource: Resource }) {
  const [error, setError] = useState<string | null>(null);
  const safe = isSafeUrl(res.externalUrl);

  async function onOpen() {
    if (!isSafeUrl(res.externalUrl)) return;
    setError(null);
    try {
      await Linking.openURL(res.externalUrl.trim());
    } catch {
      setError(r.linkFailed);
    }
  }

  return (
    <Card style={styles.section}>
      <AppText variant="label">{res.type === 'VIDEO_LINK' ? r.videoUrlLabel : r.link}</AppText>
      {res.externalUrl ? (
        <AppText variant="small" tone="muted" selectable numberOfLines={3} style={styles.url}>
          {res.externalUrl}
        </AppText>
      ) : null}
      {safe ? (
        <>
          {error ? <AlertBox message={error} /> : null}
          <Button icon="open" label={r.openLink} fullWidth onPress={() => void onOpen()} />
        </>
      ) : (
        <AlertBox message={r.unsafeLink} />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tile: { width: 48, height: 48, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  text: { lineHeight: 26 },
  url: { writingDirection: 'ltr', textAlign: 'left' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  bar: {
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  flex: { flex: 1 },
});
