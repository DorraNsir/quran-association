import type { SessionUser } from "@/lib/api/session"

import { canUseWorkspace, landingPath } from "./session-user"

/**
 * A safe post-login destination: an internal workspace path the account
 * may open (no open redirect: no scheme, no "//host"), else its landing.
 */
export function destinationAfterLogin(user: SessionUser, next: string | null): string {
  if (next && /^\/(admin|teacher|student)(\/|$|\?)/.test(next) && !next.startsWith("//")) {
    const workspace = next.split(/[/?]/)[1] as "admin" | "teacher" | "student"
    if (canUseWorkspace(user, workspace)) return next
  }
  return landingPath(user) ?? "/login?noworkspace=1"
}
