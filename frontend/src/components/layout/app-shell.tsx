import type { Workspace } from "@/lib/workspace"
import type { User } from "@/types/domain"

import { AppHeader } from "./app-header"
import { Brand } from "./brand"
import { SidebarNav } from "./sidebar-nav"
import { WorkspaceSwitcher } from "./workspace-switcher"

/**
 * Application shell shared by the admin and teacher workspaces: fixed
 * sidebar on large screens (inline-start side, so it sits on the right in
 * Arabic and on the left in French), drawer on mobile.
 */
export function AppShell({
  workspace,
  user,
  children,
}: {
  workspace: Workspace
  user: User
  children: React.ReactNode
}) {
  return (
    <div className="min-h-svh lg:ps-64">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
      >
        تخطي إلى المحتوى
      </a>
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 flex-col border-e bg-sidebar lg:flex">
        <div className="flex h-16 items-center border-b px-4">
          <Brand href={`/${workspace}`} />
        </div>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
          <WorkspaceSwitcher roles={user.roles} current={workspace} />
          <SidebarNav workspace={workspace} />
        </div>
      </aside>
      <div className="flex min-h-svh flex-col">
        <AppHeader user={user} workspace={workspace} />
        <main id="main" className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
