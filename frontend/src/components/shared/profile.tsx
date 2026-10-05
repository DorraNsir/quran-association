import type { LucideIcon } from "lucide-react"

import { UserAvatar } from "@/components/shared/user-avatar"
import { Card } from "@/components/ui/card"

/** Identity banner at the top of a profile/details page. */
export function ProfileHeader({
  name,
  photoUrl,
  avatar,
  badges,
  meta,
  actions,
}: {
  name: string
  photoUrl?: string
  /** Replaces the avatar (e.g. an icon tile for groups) */
  avatar?: React.ReactNode
  badges?: React.ReactNode
  meta?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <Card className="mb-6 flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
      {avatar ?? <UserAvatar name={name} photoUrl={photoUrl} size="xl" />}
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{name}</h1>
          {badges}
        </div>
        {meta && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
            {meta}
          </div>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </Card>
  )
}

export function MetaItem({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-4 shrink-0" aria-hidden />
      {children}
    </span>
  )
}
