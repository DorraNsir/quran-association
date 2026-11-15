import { useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/feedback';
import { AppText, Button, Card, Icon, Screen } from '@/components/ui';
import { ar } from '@/i18n/ar';
import { radius, spacing, touchTarget, useAppTheme } from '@/theme';

import { session, useSession } from './auth-provider';
import { availableWorkspaces, type Workspace } from './workspaces';

const ICON = { admin: 'admin', teacher: 'teacher', student: 'student' } as const;

export function confirmLogout() {
  Alert.alert(ar.auth.logoutConfirmTitle, ar.auth.logoutConfirmMessage, [
    { text: ar.auth.cancel, style: 'cancel' },
    { text: ar.auth.logout, style: 'destructive', onPress: () => void session.logout() },
  ]);
}

/**
 * Entry of a workspace for this phase: who is signed in (GET /auth/me data
 * from the session), the workspaces the account may open, and logout. The
 * workspace's business modules are added in the next tasks — no placeholder
 * data is shown meanwhile.
 */
export function WorkspaceHome({ workspace }: { workspace: Workspace }) {
  const { user } = useSession();
  const router = useRouter();
  const { colors } = useAppTheme();
  if (!user) return null;

  const others = availableWorkspaces(user).filter((w) => w !== workspace);

  return (
    <Screen>
      <Card>
        <AppText variant="caption" tone="muted">
          {ar.workspace.account}
        </AppText>
        <AppText variant="heading">
          {user.person.firstName} {user.person.lastName}
        </AppText>
        <AppText variant="caption" tone="muted" style={styles.ltr}>
          {user.username}
        </AppText>
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

      {others.length > 0 ? (
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
              <Icon name={ICON[w]} size={20} color={colors.primary} />
              <AppText variant="bodyStrong" style={styles.flex}>
                {ar.workspace[w]}
              </AppText>
              <Icon name="switch" size={18} color={colors.mutedForeground} />
            </Pressable>
          ))}
        </Card>
      ) : null}

      <Card>
        <EmptyState
          icon={ICON[workspace]}
          title={ar.workspace.comingTitle}
          description={ar.workspace.comingDescription}
        />
      </Card>

      <Button variant="outline" icon="logout" label={ar.auth.logout} onPress={confirmLogout} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  ltr: { writingDirection: 'ltr' },
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
