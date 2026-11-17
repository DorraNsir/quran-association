import { useRouter, type Href } from 'expo-router';
import { StyleSheet } from 'react-native';

import { AppText, Card, Screen } from '@/components/ui';
import { ar } from '@/i18n/ar';
import { spacing } from '@/theme';

import { AccountActionRow, AccountCard, confirmLogout, WorkspaceSwitcher } from './account-components';
import type { PhotoRole } from './my-photo';
import type { Workspace } from './workspaces';

/**
 * «حسابي»: who is signed in, the other workspaces of a multi-role account,
 * and «تسجيل الخروج» — the EXISTING logout (confirmation, then
 * session.logout(): server revocation and local tokens cleared). No auth
 * logic of its own.
 */
export function AccountScreen({
  workspace,
  passwordHref,
  photoRole,
}: {
  workspace: Workspace;
  passwordHref?: Href;
  /** This role may change its OWN photo here (teacher / student endpoints) */
  photoRole?: PhotoRole;
}) {
  const router = useRouter();
  return (
    <Screen>
      <AccountCard title={ar.account.signedInAs} photoRole={photoRole} />
      <WorkspaceSwitcher current={workspace} />
      <Card style={styles.session}>
        <AppText variant="label">{ar.account.session}</AppText>
        {passwordHref ? (
          <AccountActionRow icon="key" label={ar.auth.changePasswordTitle} tone="brand" onPress={() => router.push(passwordHref)} />
        ) : null}
        <AccountActionRow icon="logout" label={ar.auth.logout} tone="danger" onPress={confirmLogout} />
        <AppText variant="small" tone="muted">
          {ar.account.logoutHint}
        </AppText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  session: { gap: spacing.sm },
});
