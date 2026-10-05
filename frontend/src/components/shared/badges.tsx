import { BookOpen, ShieldCheck, UserRound } from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { labels } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { RecordStatus, TeachingRole } from "@/types/domain"

const statusStyles: Record<RecordStatus, string> = {
  ACTIVE: "bg-brand-soft text-brand-soft-foreground",
  INACTIVE: "bg-warning-soft text-warning",
  ARCHIVED: "bg-muted text-muted-foreground",
}

const statusDots: Record<RecordStatus, string> = {
  ACTIVE: "bg-primary",
  INACTIVE: "bg-warning",
  ARCHIVED: "bg-muted-foreground/60",
}

export function StatusBadge({
  status,
  className,
}: {
  status: RecordStatus
  className?: string
}) {
  return (
    <Badge className={cn("gap-1.5", statusStyles[status], className)}>
      <span aria-hidden className={cn("size-1.5 rounded-full", statusDots[status])} />
      {labels.status[status]}
    </Badge>
  )
}

/**
 * Supervisor vs assistant must be unmistakable:
 * supervisor = solid brand badge with shield, assistant = outlined neutral badge.
 */
export function TeacherRoleBadge({
  role,
  className,
}: {
  role: TeachingRole
  className?: string
}) {
  if (role === "SUPERVISOR") {
    return (
      <Badge className={cn("gap-1 bg-primary text-primary-foreground", className)}>
        <ShieldCheck aria-hidden />
        {labels.teachingRole.SUPERVISOR}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className={cn("gap-1 text-muted-foreground", className)}>
      <UserRound aria-hidden />
      {labels.teachingRole.ASSISTANT}
    </Badge>
  )
}

/** A group reference — links to the group page when an href is given. */
export function GroupBadge({
  name,
  href,
  role,
  className,
}: {
  name: string
  href?: string
  /** When shown in a teacher context, encode the responsibility visually too */
  role?: TeachingRole
  className?: string
}) {
  const content = (
    <>
      {role === "SUPERVISOR" ? (
        <ShieldCheck className="text-primary" aria-label={labels.teachingRole.SUPERVISOR} />
      ) : role === "ASSISTANT" ? (
        <UserRound className="text-muted-foreground" aria-label={labels.teachingRole.ASSISTANT} />
      ) : (
        <BookOpen className="text-primary" aria-hidden />
      )}
      {name}
    </>
  )
  const classes = cn(
    "h-6 gap-1.5 rounded-md border-border bg-background px-2 font-normal text-foreground",
    role === "SUPERVISOR" && "border-primary/30 bg-brand-soft/60",
    className
  )

  if (href) {
    return (
      <Badge asChild variant="outline" className={cn(classes, "hover:bg-muted")}>
        <Link href={href}>{content}</Link>
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className={classes}>
      {content}
    </Badge>
  )
}
