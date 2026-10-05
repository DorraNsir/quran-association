import { GroupBadge } from "@/components/shared/badges"
import { classesOf, type TeacherAssignment } from "@/lib/domain"
import { labels } from "@/lib/i18n"
import type { GroupClass } from "@/types/domain"

/**
 * Classes a teacher works in, split by responsibility so the supervisor /
 * assistant distinction is readable at a glance (label + badge style + icon).
 * When a group has several classes, the branch is added to tell them apart.
 */
export function TeacherAssignments({
  assignments,
  groupClasses,
}: {
  assignments: TeacherAssignment[]
  groupClasses: GroupClass[]
}) {
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
          {items.map(({ groupClass, group, branch }) => {
            const several = classesOf(groupClass.groupId, groupClasses).length > 1
            const name = `${group?.name ?? "—"}${several ? ` · ${branch?.name ?? ""}` : ""}`
            return (
              <dd key={groupClass.id}>
                <GroupBadge name={name} href={`/admin/groups/${groupClass.groupId}`} role={role} />
              </dd>
            )
          })}
        </div>
      ))}
    </dl>
  )
}
