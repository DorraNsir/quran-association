import { redirect } from "next/navigation"

import { AppShell } from "@/components/layout/app-shell"
import { getCurrentUser, homeOf } from "@/lib/auth/current-user"
import { users } from "@/lib/mock"

export default async function Layout({ children }: LayoutProps<"/student">) {
  const user = await getCurrentUser()
  // Only accounts linked to a student record have a student space
  if (!user.roles.includes("STUDENT") || !user.studentId) redirect(homeOf(user))
  return (
    <AppShell workspace="student" user={user} accounts={users}>
      {children}
    </AppShell>
  )
}
