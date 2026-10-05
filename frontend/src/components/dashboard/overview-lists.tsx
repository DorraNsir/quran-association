import { BookOpen, History, UserPlus, UsersRound } from "lucide-react"
import Link from "next/link"

import { GroupBadge } from "@/components/shared/badges"
import { SectionCard } from "@/components/shared/info-list"
import { PersonCell } from "@/components/shared/user-avatar"
import { Button } from "@/components/ui/button"
import {
  countActiveStudentsByClass,
  describeClass,
  fullName,
  indexLookups,
  isRunning,
  studentClass,
  teacherAssignments,
  teacherWeeklySlots,
  weeklyMinutes,
  type Lookups,
} from "@/lib/domain"
import { formatDateTime, formatDuration, formatShortDate } from "@/lib/format"
import type { ActivityEntry, Student } from "@/types/domain"

function ViewAll({ href }: { href: string }) {
  return (
    <Button asChild variant="ghost" size="sm" className="text-primary">
      <Link href={href}>عرض الكل</Link>
    </Button>
  )
}

/** "How are students distributed, and who leads each class?" — one row per running class. */
export function GroupsOverview({ lookups, students }: { lookups: Lookups; students: Student[] }) {
  const indexes = indexLookups(lookups)
  const counts = countActiveStudentsByClass(students)
  const rows = lookups.groupClasses
    .filter((c) => isRunning(c, indexes.groupsById))
    .map((c) => ({ view: describeClass(c, indexes), count: counts.get(c.id) ?? 0 }))
    .sort((a, b) => b.count - a.count)
  const max = Math.max(1, ...rows.map((r) => r.count))

  return (
    <SectionCard title="نظرة على الحلقات النشطة" icon={BookOpen} className="lg:col-span-2" action={<ViewAll href="/admin/groups" />}>
      <div className="-mx-6 overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">الحلقات النشطة وعدد طلبتها</caption>
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th scope="col" className="px-6 pb-2 text-start font-medium">المجموعة</th>
              <th scope="col" className="px-2 pb-2 text-start font-medium">المدرس المشرف</th>
              <th scope="col" className="hidden px-2 pb-2 text-start font-medium sm:table-cell">الفرع</th>
              <th scope="col" className="px-6 pb-2 text-start font-medium">الطلبة النشطون</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map(({ view, count }) => {
              const { groupClass, group, supervisor, branch } = view
              return (
                <tr key={groupClass.id}>
                  <td className="px-6 py-2.5">
                    <Link href={`/admin/groups/${groupClass.groupId}`} className="font-medium hover:text-primary">
                      {group?.name}
                    </Link>
                  </td>
                  <td className="px-2 py-2.5 text-muted-foreground">{supervisor ? fullName(supervisor) : "—"}</td>
                  <td className="hidden px-2 py-2.5 text-muted-foreground sm:table-cell">{branch?.name}</td>
                  <td className="px-6 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-5 text-end tabular-nums">{count}</span>
                      <span className="hidden h-1.5 w-24 overflow-hidden sm:block rounded-full bg-muted" aria-hidden>
                        <span className="block h-full rounded-full bg-primary/70" style={{ width: `${(count / max) * 100}%` }} />
                      </span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}

/** "Who registered recently, and where were they placed?" */
export function RecentStudents({ lookups, students }: { lookups: Lookups; students: Student[] }) {
  const indexes = indexLookups(lookups)
  const recent = [...students]
    .sort((a, b) => b.registrationDate.localeCompare(a.registrationDate))
    .slice(0, 6)

  return (
    <SectionCard title="آخر التسجيلات" icon={UserPlus} action={<ViewAll href="/admin/students" />}>
      <ul className="divide-y">
        {recent.map((s) => {
          const group = studentClass(s, indexes)?.group
          return (
            <li key={s.id} className="flex items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
              <Link href={`/admin/students/${s.id}`} className="min-w-0 hover:opacity-80">
                <PersonCell name={fullName(s)} photoUrl={s.photoUrl} size="sm" secondary={formatShortDate(s.registrationDate)} />
              </Link>
              {group && <GroupBadge name={group.name} href={`/admin/groups/${group.id}`} className="shrink-0" />}
            </li>
          )
        })}
      </ul>
    </SectionCard>
  )
}

/** "Is teaching load balanced? Who is over- or under-assigned?" */
export function TeacherWorkload({ lookups }: { lookups: Lookups }) {
  const rows = lookups.teachers
    .filter((t) => t.status === "ACTIVE")
    .map((teacher) => {
      const { groupsById } = indexLookups(lookups)
      const assignments = teacherAssignments(teacher.id, lookups).filter((a) => isRunning(a.groupClass, groupsById))
      return {
        teacher,
        supervising: assignments.filter((a) => a.role === "SUPERVISOR").length,
        assisting: assignments.filter((a) => a.role === "ASSISTANT").length,
        minutes: weeklyMinutes(teacherWeeklySlots(teacher.id, lookups).map((e) => e.slot)),
      }
    })
    .sort((a, b) => b.minutes - a.minutes)
  const max = Math.max(1, ...rows.map((r) => r.minutes))

  return (
    <SectionCard title="العبء التدريسي للمعلمين" icon={UsersRound} className="lg:col-span-2" action={<ViewAll href="/admin/teachers" />}>
      <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {rows.map(({ teacher, supervising, assisting, minutes }) => (
          <li key={teacher.id} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <Link href={`/admin/teachers/${teacher.id}`} className="truncate font-medium hover:text-primary">
                {fullName(teacher)}
              </Link>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {minutes ? formatDuration(minutes) : "بدون حصص"}
              </span>
            </div>
            <div className="flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span className="h-full rounded-full bg-primary/70" style={{ width: `${(minutes / max) * 100}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              مشرف على {supervising} · مساعد في {assisting}
            </p>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}

/** "What changed recently in the administration?" */
export function RecentActivity({ entries }: { entries: ActivityEntry[] }) {
  return (
    <SectionCard title="آخر العمليات الإدارية" icon={History}>
      <ol className="relative space-y-4 border-s ps-4">
        {entries.map((entry) => (
          <li key={entry.id} className="relative">
            <span className="absolute -start-[1.3rem] top-1.5 size-2 rounded-full bg-primary/60 ring-4 ring-card" aria-hidden />
            <p className="text-sm">{entry.message}</p>
            <p className="text-xs text-muted-foreground">
              {formatDateTime(entry.at)} · {entry.actor}
            </p>
          </li>
        ))}
      </ol>
    </SectionCard>
  )
}
