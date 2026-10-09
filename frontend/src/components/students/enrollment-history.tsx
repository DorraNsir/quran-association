"use client"

import { History } from "lucide-react"
import Link from "next/link"

import { SectionCard } from "@/components/shared/info-list"
import { QueryState } from "@/components/shared/query-state"
import { useStudentEnrollments } from "@/lib/api/hooks/people"
import { formatDate } from "@/lib/format"

/** Class membership history (API: half-open periods; the current one has no end). */
export function EnrollmentHistory({ studentId }: { studentId: string }) {
  const enrollments = useStudentEnrollments(studentId)
  const rows = [...(enrollments.data ?? [])].sort((a, b) => b.startDate.localeCompare(a.startDate))
  return (
    <SectionCard title="سجل الأقسام" icon={History}>
      <QueryState query={enrollments} empty={rows.length === 0} emptyTitle="لا يوجد سجل بعد">
        <ul className="divide-y">
          {rows.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm first:pt-0 last:pb-0">
              <Link href={`/admin/groups/${e.groupClass.group.id}`} className="font-medium hover:text-primary">
                {e.groupClass.group.name} — {e.groupClass.branch.name}
              </Link>
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatDate(e.startDate)} ← {e.endDate ? formatDate(e.endDate) : "حاليًا"}
              </span>
            </li>
          ))}
        </ul>
      </QueryState>
    </SectionCard>
  )
}
