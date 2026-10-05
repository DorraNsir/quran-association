import { AlertTriangle, CheckCircle2, ChevronLeft } from "lucide-react"
import Link from "next/link"

import { SectionCard } from "@/components/shared/info-list"
import { countActiveStudentsByClass, describeClass, fullName, indexLookups, isRunning, type ClassView, type Lookups } from "@/lib/domain"
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
  const indexes = indexLookups(lookups)
  const counts = countActiveStudentsByClass(students)
  const alerts: Alert[] = []
  // Checked per class: each class has its own supervisor, assistants and size
  const classes = lookups.groupClasses.map((c) => describeClass(c, indexes))
  const name = (v: ClassView) => `${v.group?.name ?? ""} (${v.branch?.name ?? ""})`

  for (const v of classes) {
    if (v.groupClass.status !== "ARCHIVED" && v.supervisor?.status === "INACTIVE") {
      alerts.push({
        id: `sup-${v.groupClass.id}`,
        title: `${name(v)}: المشرف غير نشط`,
        detail: `${fullName(v.supervisor)} موقوف حاليًا — يلزم تعيين مشرف بديل.`,
        href: `/admin/groups/${v.groupClass.groupId}`,
      })
    }
  }

  for (const v of classes.filter((c) => isRunning(c.groupClass, indexes.groupsById))) {
    const size = counts.get(v.groupClass.id) ?? 0
    if (v.assistants.length === 0 && size >= LARGE_GROUP) {
      alerts.push({
        id: `asst-${v.groupClass.id}`,
        title: `${name(v)} بدون معلم مساعد`,
        detail: `${countLabels.students(size)} مع المدرس المشرف فقط.`,
        href: `/admin/groups/${v.groupClass.groupId}`,
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
    const affected = classes.filter((v) => v.groupClass.branchId === branch.id && v.groupClass.status !== "ARCHIVED")
    if (affected.length > 0) {
      alerts.push({
        id: `branch-${branch.id}`,
        title: `${branch.name} مغلق مؤقتًا`,
        detail: `${countLabels.classes(affected.length)} مرتبطة بهذا الفرع.`,
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
