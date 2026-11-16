import { EmptyState } from '@/components/feedback';
import { Card, Screen } from '@/components/ui';
import { ar } from '@/i18n/ar';

import {
  AccountCard,
  LogoutButton,
  WORKSPACE_ICON,
  WorkspaceSwitcher,
} from './account-components';
import type { Workspace } from './workspaces';

export { confirmLogout } from './account-components';

/**
 * Entry of a workspace whose modules are not built yet (admin, student):
 * identity, role switching and logout — no placeholder data.
 */
export function WorkspaceHome({ workspace }: { workspace: Workspace }) {
  return (
    <Screen>
      <AccountCard title={ar.workspace.account} />
      <WorkspaceSwitcher current={workspace} />
      <Card>
        <EmptyState
          icon={WORKSPACE_ICON[workspace]}
          title={ar.workspace.comingTitle}
          description={ar.workspace.comingDescription}
        />
      </Card>
      <LogoutButton />
    </Screen>
  );
}
