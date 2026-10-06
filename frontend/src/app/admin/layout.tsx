import { redirect } from "next/navigation"

import { AppShell } from "@/components/layout/app-shell"
import { getCurrentUser, homeOf } from "@/lib/auth/current-user"
import { users } from "@/lib/mock"

export default async function Layout({ children }: LayoutProps<"/admin">) {
  const user = await getCurrentUser()
  // Accounts without the ADMIN role have no admin space: send them to their own workspace
  if (!user.roles.includes("ADMIN")) redirect(homeOf(user))
  return (
    <AppShell workspace="admin" user={user} accounts={users}>
      {children}
    </AppShell>
  )
}
