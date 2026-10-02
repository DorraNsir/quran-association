import { AlertTriangle, CheckCircle2, ChevronLeft } from "lucide-react"
import Link from "next/link"

import { SectionCard } from "@/components/shared/info-list"
import { countActiveStudentsByGroup, fullName, indexById, type Lookups } from "@/lib/domain"
import { countLabels } from "@/lib/format"
import type { Student } from "@/types/domain"

interface Alert {
  id: string
  title: string
  detail: string
  href: string
}

/** Assistants become important past this group size. */
const LARGE_GROUP = 6

/** "What needs an admin decision?" — derived from the data, not hard-coded. */
export function AttentionList({ lookups, students }: { lookups: Lookups; students: Student[] }) {
  const teachersById = indexById(lookups.teachers)
  const counts = countActiveStudentsByGroup(students)
  const activeGroups = lookups.groups.filter((g) => g.status === "ACTIVE")
  const alerts: Alert[] = []

  for (const group of lookups.groups) {
    const supervisor = teachersById.get(group.supervisorId)
    if (group.status !== "ARCHIVED" && supervisor?.status === "INACTIVE") {
      alerts.push({
        id: `sup-${group.id}`,
        title: `${group.name}: المشرف غير نشط`,
        detail: `${fullName(supervisor)} موقوف حاليًا — يلزم تعيين مشرف بديل.`,
        href: `/admin/groups/${group.id}`,
      })
    }
  }

  for (const group of activeGroups) {
    const size = counts.get(group.id) ?? 0
    if (group.assistantIds.length === 0 && size >= LARGE_GROUP) {
      alerts.push({
        id: `asst-${group.id}`,
        title: `${group.name} بدون معلم مساعد`,
        detail: `${countLabels.students(size)} مع معلم مشرف فقط.`,
        href: `/admin/groups/${group.id}`,
      })
    }
  }

  const inactiveStudents = students.filter((s) => s.status === "INACTIVE").length
  if (inactiveStudents > 0) {
    alerts.push({
      id: "inactive-students",
      title: `${countLabels.students(inactiveStudents)} في حالة توقف`,
      detail: "تواصل مع الأولياء لتأكيد العودة أو الأرشفة.",
      href: "/admin/students",
    })
  }

  for (const branch of lookups.branches.filter((b) => b.status === "INACTIVE")) {
    const affected = lookups.groups.filter((g) => g.branchId === branch.id && g.status !== "ARCHIVED")
    if (affected.length > 0) {
      alerts.push({
        id: `branch-${branch.id}`,
        title: `${branch.name} مغلق مؤقتًا`,
        detail: `${countLabels.groups(affected.length)} مرتبطة بهذا الفرع.`,
        href: "/admin/groups",
      })
    }
  }

  return (
    <SectionCard title="تحتاج إلى متابعة" icon={AlertTriangle}>
      {alerts.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-primary" aria-hidden />
          لا توجد نقاط معلّقة.
        </p>
      ) : (
        <ul className="-mx-2 space-y-1">
          {alerts.map((alert) => (
            <li key={alert.id}>
              <Link
                href={alert.href}
                className="group flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-muted/60"
              >
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-warning" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{alert.title}</span>
                  <span className="block text-xs text-muted-foreground">{alert.detail}</span>
                </span>
                <ChevronLeft
                  className="mt-1 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 ltr:rotate-180"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}
