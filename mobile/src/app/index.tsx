import { Redirect } from 'expo-router';

import { EmptyState } from '@/components/feedback';
import { Button, Screen } from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { confirmLogout } from '@/features/auth/workspace-home';
import { landingWorkspace } from '@/features/auth/workspaces';
import { ar } from '@/i18n/ar';

/** Signed in: open the landing workspace (admin → teacher → student), like the web. */
export default function IndexScreen() {
  const { user } = useSession();
  const workspace = user ? landingWorkspace(user) : null;
  if (workspace) return <Redirect href={`/${workspace}`} />;

  return (
    <Screen scroll={false} edges={['top', 'bottom']}>
      <EmptyState
        icon="forbidden"
        title={ar.workspace.noWorkspaceTitle}
        description={ar.workspace.noWorkspaceDescription}
        action={<Button variant="outline" icon="logout" label={ar.auth.logout} onPress={confirmLogout} />}
      />
    </Screen>
  );
}
