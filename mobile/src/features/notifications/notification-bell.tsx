import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Icon } from '@/components/ui';
import { ar } from '@/i18n/ar';
import { ltr } from '@/i18n/format';
import { fontFamilies, radius, useAppTheme } from '@/theme';

import { badgeLabel } from './notification-model';
import { useUnreadCount } from './use-notifications';

const t = ar.notifications;

/**
 * The bell of the green header: the unread count (hidden at 0, «99+» beyond),
 * kept fresh by the polling unread-count query (see useUnreadCount — this is
 * its only polling observer). Opens «الإشعارات».
 */
export function NotificationBell({ userId, onPress }: { userId: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  const unread = useUnreadCount(userId, { poll: true });
  const count = unread.data ?? 0;
  const badge = badgeLabel(count);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t.bellLabel(count)}
      testID="notification-bell"
      hitSlop={6}
      style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}>
      <Icon name="bell" size={22} color={colors.heroForeground} />
      {badge ? (
        <View
          testID="notification-badge"
          importantForAccessibility="no-hide-descendants"
          style={[styles.badge, { backgroundColor: colors.destructive, borderColor: colors.heroBackground }]}>
          <AppText variant="caption" style={[styles.badgeText, { color: colors.destructiveForeground }]}>
            {ltr(badge)}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  badge: {
    position: 'absolute',
    top: -2,
    end: -4,
    minWidth: 20,
    height: 20,
    borderRadius: radius.full,
    borderWidth: 2,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fontFamilies.bold, fontSize: 11, lineHeight: 14 },
});
