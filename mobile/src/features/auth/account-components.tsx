import { useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Icon, InitialsAvatar } from '@/components/ui';
import { ar } from '@/i18n/ar';
import { radius, spacing, touchTarget, useAppTheme } from '@/theme';

import { session, useSession } from './auth-provider';
import { availableWorkspaces, type Workspace } from './workspaces';

export const WORKSPACE_ICON = { admin: 'admin', teacher: 'teacher', student: 'student' } as const;

export function confirmLogout() {
  Alert.alert(ar.auth.logoutConfirmTitle, ar.auth.logoutConfirmMessage, [
    { text: ar.auth.cancel, style: 'cancel' },
    { text: ar.auth.logout, style: 'destructive', onPress: () => void session.logout() },
  ]);
}

/** Who is signed in (GET /auth/me data held by the session). */
export function AccountCard({ title }: { title?: string }) {
  const { user } = useSession();
  const { colors } = useAppTheme();
  if (!user) return null;
  return (
    <Card>
      {title ? (
        <AppText variant="caption" tone="muted">
          {title}
        </AppText>
      ) : null}
      <View style={styles.identity}>
        <InitialsAvatar name={`${user.person.firstName} ${user.person.lastName}`} size={56} photoUrl={user.person.photoUrl} />
        <View style={styles.flex}>
          <AppText variant="heading">
            {user.person.firstName} {user.person.lastName}
          </AppText>
          <AppText variant="caption" tone="muted" style={styles.ltr}>
            {user.username}
          </AppText>
        </View>
      </View>
      <View style={styles.badges}>
        {user.roles.map((role) => (
          <View key={role} style={[styles.badge, { backgroundColor: colors.brandSoft }]}>
            <AppText variant="caption" style={{ color: colors.brandSoftForeground }}>
              {ar.roles[role]}
            </AppText>
          </View>
        ))}
      </View>
    </Card>
  );
}

/** Role switching for multi-role accounts (only the workspaces the account may open). */
export function WorkspaceSwitcher({ current }: { current: Workspace }) {
  const { user } = useSession();
  const router = useRouter();
  const { colors } = useAppTheme();
  if (!user) return null;
  const others = availableWorkspaces(user).filter((w) => w !== current);
  if (others.length === 0) return null;
  return (
    <Card>
      <AppText variant="label">{ar.workspace.switchTitle}</AppText>
      {others.map((w) => (
        <Pressable
          key={w}
          accessibilityRole="button"
          accessibilityLabel={ar.workspace[w]}
          onPress={() => router.replace(`/${w}`)}
          style={({ pressed }) => [
            styles.switchRow,
            { borderColor: colors.border, backgroundColor: pressed ? colors.accent : colors.card },
          ]}>
          <Icon name={WORKSPACE_ICON[w]} size={20} color={colors.primary} />
          <AppText variant="bodyStrong" style={styles.flex}>
            {ar.workspace[w]}
          </AppText>
          <Icon name="switch" size={18} color={colors.mutedForeground} />
        </Pressable>
      ))}
    </Card>
  );
}

export function LogoutButton() {
  return <Button variant="outline" icon="logout" label={ar.auth.logout} onPress={confirmLogout} />;
}

const styles = StyleSheet.create({
  ltr: { writingDirection: 'ltr' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  badge: { borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 2 },
  switchRow: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
  },
  flex: { flex: 1 },
});
