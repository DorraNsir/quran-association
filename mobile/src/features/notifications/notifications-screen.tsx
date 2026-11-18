import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { EmptyState, QueryState } from '@/components/feedback';
import { AlertBox, AppText, Button, Card, ChipRow, Icon, Screen } from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { usePreferences } from '@/features/preferences/preferences';
import { usePullToRefresh } from '@/features/teacher/use-refresh';
import { ar } from '@/i18n/ar';
import { auto, ltr } from '@/i18n/format';
import { errorMessage } from '@/services/api';
import { radius, spacing, useAppTheme } from '@/theme';

import { badgeLabel, formatNotificationTime, notificationIcon } from './notification-model';
import type { AppNotification } from './notification-types';
import {
  notificationsKey,
  useMarkAllNotificationsRead,
  useNotificationPages,
  useOpenNotification,
  useUnreadCount,
} from './use-notifications';

const t = ar.notifications;
type Filter = 'all' | 'unread';

/**
 * «الإشعارات» of the signed-in teacher: GET /notifications (own only, newest
 * first), all or unread only, 20 per page with «عرض المزيد». A tap marks it
 * read and opens what it is about (see useOpenNotification); «تحديد الكل
 * كمقروء» needs no confirmation (nothing is lost) and sends one request.
 */
export function TeacherNotificationsScreen() {
  const { user } = useSession();
  const userId = user?.id ?? '';
  const teacherId = user?.teacherId ?? '';
  const timeZone = usePreferences().data?.timezone;
  const [filter, setFilter] = useState<Filter>('all');
  const pages = useNotificationPages(userId, filter === 'unread');
  const unread = useUnreadCount(userId);
  const markAll = useMarkAllNotificationsRead(userId);
  const { open, opening } = useOpenNotification(userId, teacherId);
  const { refreshing, onRefresh } = usePullToRefresh([notificationsKey(userId)]);
  const [markAllError, setMarkAllError] = useState<string | null>(null);
  // Synchronous guard: a double tap sends ONE «read all»
  const markingAll = useRef(false);

  const items = pages.data?.pages.flatMap((p) => p.data) ?? [];
  const unreadCount = unread.data ?? 0;
  const badge = badgeLabel(unreadCount);
  const now = new Date();

  async function onMarkAll() {
    if (markingAll.current) return;
    markingAll.current = true;
    setMarkAllError(null);
    try {
      await markAll.mutateAsync();
    } catch (error) {
      setMarkAllError(`${t.markAllFailed} ${errorMessage(error)}`);
    } finally {
      markingAll.current = false;
    }
  }

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <ChipRow
        label={t.pickFilter}
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: t.filter.all },
          { value: 'unread', label: badge ? `${t.filter.unread} (${ltr(badge)})` : t.filter.unread },
        ]}
      />
      <Button
        variant="outline"
        icon="markRead"
        label={t.markAll}
        fullWidth
        loading={markAll.isPending}
        disabled={unreadCount === 0}
        onPress={() => void onMarkAll()}
      />
      {markAllError ? <AlertBox message={markAllError} /> : null}

      <QueryState query={pages} loadingLabel={t.loading}>
        {items.length === 0 ? (
          <Card>
            {filter === 'unread' ? (
              <EmptyState icon="markRead" title={t.emptyUnread} />
            ) : (
              <EmptyState icon="bell" title={t.empty} description={t.emptyDescription} />
            )}
          </Card>
        ) : (
          <Card style={styles.list}>
            {items.map((n, i) => (
              <NotificationRow
                key={n.id}
                notification={n}
                time={formatNotificationTime(n.createdAt, now, timeZone)}
                bordered={i > 0}
                opening={opening === n.id}
                onPress={() => void open(n)}
              />
            ))}
          </Card>
        )}
        {pages.hasNextPage ? (
          <Button variant="outline" label={t.loadMore} loading={pages.isFetchingNextPage} onPress={() => void pages.fetchNextPage()} />
        ) : null}
      </QueryState>
    </Screen>
  );
}

/** Unread: tinted row, bold title, a dot (and «غير مقروء» for screen readers). Read: plain. */
export function NotificationRow({
  notification: n,
  time,
  bordered,
  opening,
  onPress,
}: {
  notification: AppNotification;
  time: string;
  bordered: boolean;
  opening: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const unread = !n.isRead;
  const label = [unread ? t.unread : null, n.title, n.message, n.available ? null : t.gone, time].filter(Boolean).join('، ');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: opening }}
      testID={unread ? 'notification-unread' : 'notification-read'}
      style={({ pressed }) => [
        styles.row,
        bordered && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
        unread && { backgroundColor: colors.brandSoft },
        pressed && { backgroundColor: colors.accent },
      ]}>
      <View style={[styles.tile, { backgroundColor: unread ? colors.card : colors.muted }]}>
        <Icon name={notificationIcon(n)} size={18} color={unread ? colors.primary : colors.mutedForeground} />
      </View>
      <View style={styles.flex}>
        <AppText variant={unread ? 'bodyStrong' : 'body'} numberOfLines={2}>
          {auto(n.title)}
        </AppText>
        <AppText variant="small" tone="muted" numberOfLines={3}>
          {auto(n.message)}
        </AppText>
        {n.available ? null : (
          <AppText variant="caption" tone="muted">
            {t.gone}
          </AppText>
        )}
        <AppText variant="caption" tone="muted">
          {time}
        </AppText>
      </View>
      {opening ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : unread ? (
        <View testID="unread-dot" style={[styles.dot, { backgroundColor: colors.primary }]} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: 0, paddingHorizontal: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  tile: { width: 36, height: 36, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: radius.full, marginTop: spacing.sm },
  flex: { flex: 1, gap: 2 },
});
