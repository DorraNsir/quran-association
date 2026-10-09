"use client"

import { Loader2 } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useMemo } from "react"

import { AppShell } from "@/components/layout/app-shell"
import { useAuth } from "@/lib/auth/auth-provider"
import { canUseWorkspace, landingPath, toUser } from "@/lib/auth/session-user"
import type { Workspace } from "@/lib/workspace"

/** Centered loader used while the session is being restored. */
export function FullPageLoader({ label = "جارٍ التحميل…" }: { label?: string }) {
  return (
    <div className="flex min-h-svh items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  )
}

/**
 * Protected workspace: restores the session (refresh cookie), sends
 * visitors to /login, enforces the first-login password change, and keeps
 * accounts inside workspaces they hold (ADMIN role; TEACHER / STUDENT with
 * their profile). Navigation only — the API authorizes every request.
 */
export function WorkspaceGate({ workspace, children }: { workspace: Workspace; children: React.ReactNode }) {
  const { status, user, restore } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (status === "idle") void restore()
  }, [status, restore])

  const target = useMemo(() => {
    if (status === "anonymous") return `/login?next=${encodeURIComponent(pathname)}`
    if (!user) return null
    if (user.mustChangePassword) return `/change-password?next=${encodeURIComponent(pathname)}`
    if (!canUseWorkspace(user, workspace)) return landingPath(user) ?? "/login?noworkspace=1"
    return null
  }, [status, user, workspace, pathname])

  useEffect(() => {
    if (target) router.replace(target)
  }, [target, router])

  const shellUser = useMemo(() => (user ? toUser(user) : null), [user])
  if (!shellUser || target) return <FullPageLoader />
  return (
    <AppShell workspace={workspace} user={shellUser}>
      {children}
    </AppShell>
  )
}

/** The signed-in account inside a workspace (the gate guarantees it). */
export function useSessionUser() {
  const { user } = useAuth()
  if (!user) throw new Error("useSessionUser outside a workspace")
  return useMemo(() => toUser(user), [user])
}
