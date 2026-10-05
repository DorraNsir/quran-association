import { GroupBadge } from "@/components/shared/badges"
import type { TeacherAssignment } from "@/lib/domain"
import { labels } from "@/lib/i18n"

/**
 * Groups a teacher works in, split by responsibility so the supervisor /
 * assistant distinction is readable at a glance (label + badge style + icon).
 */
export function TeacherAssignments({ assignments }: { assignments: TeacherAssignment[] }) {
  if (assignments.length === 0) {
    return <span className="text-sm text-muted-foreground">بدون مجموعات</span>
  }

  const rows = (["SUPERVISOR", "ASSISTANT"] as const)
    .map((role) => ({ role, items: assignments.filter((a) => a.role === role) }))
    .filter((row) => row.items.length > 0)

  return (
    <dl className="space-y-1.5">
      {rows.map(({ role, items }) => (
        <div key={role} className="flex flex-wrap items-center gap-1.5">
          <dt className="w-24 shrink-0 text-xs text-muted-foreground">
            {role === "SUPERVISOR" ? "مشرف على" : "مساعد في"}
            <span className="sr-only"> ({labels.teachingRole[role]})</span>
          </dt>
          {items.map(({ group }) => (
            <dd key={group.id}>
              <GroupBadge name={group.name} href={`/admin/groups/${group.id}`} role={role} />
            </dd>
          ))}
        </div>
      ))}
    </dl>
  )
}
