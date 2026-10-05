import { CalendarCheck2, CalendarX2, MapPin, ShieldCheck, Users } from "lucide-react"
import Link from "next/link"

import { EmptyState } from "@/components/shared/empty-state"
import { SectionCard } from "@/components/shared/info-list"
import {
  countActiveStudentsByGroup,
  fullName,
  groupLocation,
  indexById,
  weekdayOf,
  type Lookups,
} from "@/lib/domain"
import { countLabels, formatDate } from "@/lib/format"
import { labels } from "@/lib/i18n"
import type { ISODate, Student } from "@/types/domain"

/** "Which groups meet today, where, and with whom?" */
export function TodaySessions({
  today,
  lookups,
  students,
}: {
  today: ISODate
  lookups: Lookups
  students: Student[]
}) {
  const day = weekdayOf(today)
  const branchesById = indexById(lookups.branches)
  const teachersById = indexById(lookups.teachers)
  const counts = countActiveStudentsByGroup(students)

  const sessions = lookups.groups
    .filter((g) => g.status === "ACTIVE")
    .flatMap((group) =>
      group.schedule.filter((slot) => slot.day === day).map((slot) => ({ group, slot }))
    )
    .sort((a, b) => a.slot.start.localeCompare(b.slot.start))

  return (
    <SectionCard
      title={`حصص اليوم — ${labels.weekday[day]} ${formatDate(today)}`}
      icon={CalendarCheck2}
      className="lg:col-span-2"
      action={
        <span className="text-xs text-muted-foreground">{countLabels.sessions(sessions.length)}</span>
      }
    >
      {sessions.length === 0 ? (
        <EmptyState icon={CalendarX2} title="لا توجد حصص اليوم" className="py-6" />
      ) : (
        <ol className="space-y-2">
          {sessions.map(({ group, slot }) => {
            const supervisor = teachersById.get(group.supervisorId)
            return (
              <li key={`${group.id}-${slot.start}`}>
                <Link
                  href={`/admin/groups/${group.id}`}
                  className="flex flex-col gap-2 rounded-lg border p-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="flex shrink-0 items-center gap-2 sm:w-28 sm:flex-col sm:items-start sm:gap-0">
                    <span dir="ltr" className="text-base font-semibold tabular-nums">{slot.start}</span>
                    <span dir="ltr" className="text-xs tabular-nums text-muted-foreground">→ {slot.end}</span>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1 sm:border-s sm:ps-4">
                    <p className="font-medium">
                      {group.name}
                      <span className="ms-2 text-xs font-normal text-muted-foreground">{group.audience}</span>
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3.5" aria-hidden />
                        {groupLocation(group, branchesById)}
                      </span>
                      {supervisor && (
                        <span className="inline-flex items-center gap-1">
                          <ShieldCheck className="size-3.5 text-primary" aria-hidden />
                          {fullName(supervisor)}
                          {group.assistantIds.length > 0 && ` + ${group.assistantIds.length}`}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Users className="size-3.5" aria-hidden />
                        {countLabels.students(counts.get(group.id) ?? 0)}
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ol>
      )}
    </SectionCard>
  )
}
