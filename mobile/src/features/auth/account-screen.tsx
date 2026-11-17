import { useRouter, type Href } from 'expo-router';
import { StyleSheet } from 'react-native';

import { AppText, Button, Card, Screen } from '@/components/ui';
import { ar } from '@/i18n/ar';
import { spacing } from '@/theme';

import { AccountCard, LogoutButton, WorkspaceSwitcher } from './account-components';
import type { Workspace } from './workspaces';

/**
 * «حسابي»: who is signed in, the other workspaces of a multi-role account,
 * and «تسجيل الخروج» — the EXISTING logout (confirmation, then
 * session.logout(): server revocation and local tokens cleared). No auth
 * logic of its own.
 */
export function AccountScreen({ workspace, passwordHref }: { workspace: Workspace; passwordHref?: Href }) {
  const router = useRouter();
  return (
    <Screen>
      <AccountCard title={ar.account.signedInAs} />
      <WorkspaceSwitcher current={workspace} />
      <Card style={styles.session}>
        <AppText variant="label">{ar.account.session}</AppText>
        {passwordHref ? (
          <Button variant="outline" icon="key" label={ar.auth.changePasswordTitle} fullWidth onPress={() => router.push(passwordHref)} />
        ) : null}
        <AppText variant="small" tone="muted">
          {ar.account.logoutHint}
        </AppText>
        <LogoutButton />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  session: { gap: spacing.sm },
});
