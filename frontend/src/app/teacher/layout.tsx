import { redirect } from "next/navigation"

import { AppShell } from "@/components/layout/app-shell"
import { getCurrentUser, homeOf } from "@/lib/auth/current-user"
import { users } from "@/lib/mock"

export default async function Layout({ children }: LayoutProps<"/teacher">) {
  const user = await getCurrentUser()
  // Only accounts with a teacher profile have a teacher space
  if (!user.roles.includes("TEACHER") || !user.teacherId) redirect(homeOf(user))
  return (
    <AppShell workspace="teacher" user={user} accounts={users}>
      {children}
    </AppShell>
  )
}
