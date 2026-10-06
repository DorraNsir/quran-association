"use client"

import {
  BookOpen,
  BookOpenCheck,
  CalendarClock,
  CalendarDays,
  DoorOpen,
  GraduationCap,
  History,
  MapPin,
  Repeat,
  UsersRound,
} from "lucide-react"
import Link from "next/link"

import { MemorizationValue } from "@/components/memorization/memorization-dialog"
import { StatusBadge, TeacherRoleBadge } from "@/components/shared/badges"
import { EmptyState } from "@/components/shared/empty-state"
import { InfoList, SectionCard } from "@/components/shared/info-list"
import { Breadcrumbs } from "@/components/shared/page-header"
import { MetaItem, ProfileHeader } from "@/components/shared/profile"
import { ScheduleSummary } from "@/components/shared/schedule"
import { PersonCell } from "@/components/shared/user-avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { summarize } from "@/lib/attendance"
import { weekdayOf } from "@/lib/dates"
import { fullName, schedulesOf, type Lookups, type TeacherAssignment } from "@/lib/domain"
import { countLabels, formatShortDate } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { defaultPeriod, indexMemorization, memorizationKey } from "@/lib/memorization"
import { useOperations } from "@/lib/store/operations"
import { getTeacherGroupClasses } from "@/lib/teacher-access"
import type { AcademicYear, ID, ISODate, Student } from "@/types/domain"

import { TeacherSessionList, useTeacherSessionRows } from "./teacher-sessions"

/** The teacher's classes as cards: where, when, how many students, what's next. */
export function TeacherClasses({
  teacherId,
  lookups,
  students,
  today,
}: {
  teacherId: ID
  lookups: Lookups
  students: Student[]
  today: ISODate
}) {
  const rows = useTeacherSessionRows(teacherId, lookups, students, today)
  const classes = getTeacherGroupClasses(teacherId, lookups)

  if (classes.length === 0) {
    return (
      <Card className="p-0">
        <EmptyState icon={BookOpen} title="لا توجد مجموعات مسندة إليك" description="تُسند المجموعات من طرف الإدارة." />
      </Card>
    )
  }

  return (
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {classes.map((a) => {
        const id = a.groupClass.id
        const count = students.filter((s) => s.groupClassId === id && s.status === "ACTIVE").length
        const next = rows.find((r) => r.session.groupClassId === id && r.session.date >= today && r.session.status !== "CANCELLED")
        return (
          <li key={id}>
            <Link href={`/teacher/classes/${id}`} className="block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <Card className="h-full gap-3 p-5 transition-colors hover:border-primary/40">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-base font-semibold">{a.group?.name}</p>
                    <p className="text-xs text-muted-foreground">{a.group?.audience}</p>
                  </div>
                  <TeacherRoleBadge role={a.role} />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5"><MapPin className="size-4" aria-hidden />{a.branch?.name}</span>
                  <span className="inline-flex items-center gap-1.5"><DoorOpen className="size-4" aria-hidden />{a.room?.name}</span>
                  <span className="inline-flex items-center gap-1.5"><GraduationCap className="size-4" aria-hidden />{countLabels.students(count)}</span>
                </div>
                <ScheduleSummary schedule={schedulesOf(id, lookups.schedules)} />
                <p className="mt-auto flex items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground">
                  <CalendarClock className="size-3.5" aria-hidden />
                  {next ? (
                    <>
                      الحصة القادمة:{" "}
                      <span className="font-medium text-foreground">
                        {next.session.date === today ? "اليوم" : `${labels.weekday[weekdayOf(next.session.date)]} ${formatShortDate(next.session.date)}`}
                      </span>
                      <span dir="ltr" className="tabular-nums">{next.session.start}</span>
                    </>
                  ) : (
                    "لا توجد حصص قادمة"
                  )}
                </p>
              </Card>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/** One of the teacher's classes: team, schedule, students and sessions. */
export function TeacherClassDetails({
  assignment,
  lookups,
  students,
  academicYears,
  today,
  teacherId,
}: {
  assignment: TeacherAssignment
  lookups: Lookups
  /** The teacher's own students */
  students: Student[]
  academicYears: AcademicYear[]
  today: ISODate
  teacherId: ID
}) {
  const { groupClass, group, branch, room, supervisor, assistants } = assignment
  const { memorizationProgress } = useOperations()
  const sessionRows = useTeacherSessionRows(teacherId, lookups, students, today).filter((r) => r.session.groupClassId === groupClass.id)
  const roster = students
    .filter((s) => s.groupClassId === groupClass.id && s.status === "ACTIVE")
    .sort((a, b) => fullName(a).localeCompare(fullName(b), "ar"))
  const period = defaultPeriod(academicYears, today)
  const byKey = indexMemorization(memorizationProgress)

  const upcoming = sessionRows.filter((r) => r.session.date >= today && r.session.status !== "CANCELLED").slice(0, 3)
  const recent = sessionRows.filter((r) => r.session.date < today).slice(-5).reverse()
  const rateOf = (studentId: ID) =>
    summarize(sessionRows.flatMap((r) => r.records.filter((rec) => rec.studentId === studentId))).rate

  return (
    <>
      <Breadcrumbs className="mb-4" items={[{ label: "مجموعاتي", href: "/teacher/classes" }, { label: `${group?.name ?? ""} — ${branch?.name ?? ""}` }]} />
      <ProfileHeader
        name={group?.name ?? "—"}
        avatar={
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand-soft-foreground sm:size-20">
            <BookOpen className="size-6 sm:size-8" aria-hidden />
          </span>
        }
        badges={
          <>
            <TeacherRoleBadge role={assignment.role} />
            {groupClass.status !== "ACTIVE" && <StatusBadge status={groupClass.status} />}
          </>
        }
        meta={
          <>
            <MetaItem icon={MapPin}>{branch?.name}</MetaItem>
            <MetaItem icon={DoorOpen}>{room?.name}</MetaItem>
            <MetaItem icon={GraduationCap}>{countLabels.students(roster.length)}</MetaItem>
          </>
        }
        actions={
          <Button asChild variant="outline">
            <Link href="/teacher/memorization">
              <BookOpenCheck />
              متابعة الحفظ
            </Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SectionCard
            title="الطلبة"
            icon={GraduationCap}
            action={<span className="text-xs text-muted-foreground">آخر سورة محفوظة · {labels.semester[period.semester]}</span>}
          >
            {roster.length === 0 ? (
              <EmptyState icon={GraduationCap} title="لا يوجد طلبة في هذه المجموعة" className="py-6" />
            ) : (
              <ul className="divide-y">
                {roster.map((student) => {
                  const record = byKey.get(memorizationKey(student.id, period.academicYearId, period.semester))
                  const rate = rateOf(student.id)
                  return (
                    <li key={student.id}>
                      <Link href={`/teacher/students/${student.id}`} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                        <div className="min-w-0 flex-1">
                          <PersonCell name={fullName(student)} photoUrl={student.photoUrl} size="sm"
                            secondary={<MemorizationValue surah={record?.lastMemorizedSurah} />} />
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          الحضور: <span className="font-medium text-foreground tabular-nums">{rate === null ? "—" : `${rate}%`}</span>
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="الحصص القادمة" icon={CalendarDays}>
            <TeacherSessionList rows={upcoming} today={today} emptyTitle="لا توجد حصص قادمة" />
          </SectionCard>
          <SectionCard
            title="آخر الحصص"
            icon={History}
            action={
              <Button asChild variant="ghost" size="sm" className="text-primary">
                <Link href="/teacher/sessions?tab=all">كل الحصص</Link>
              </Button>
            }
          >
            <TeacherSessionList rows={recent} today={today} emptyTitle="لا توجد حصص سابقة" />
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="الحلقة" icon={BookOpen}>
            <InfoList
              className="sm:grid-cols-1"
              items={[
                { label: "الفئة", value: group?.audience, icon: UsersRound },
                { label: "الفرع", value: branch?.name, icon: MapPin },
                { label: "القاعة", value: room?.name, icon: DoorOpen },
                { label: "البرنامج الأسبوعي", value: <ScheduleSummary schedule={schedulesOf(groupClass.id, lookups.schedules)} />, icon: Repeat },
              ]}
            />
          </SectionCard>
          <SectionCard title="الفريق" icon={UsersRound}>
            <ul className="space-y-3">
              {[...(supervisor ? [{ teacher: supervisor, role: "SUPERVISOR" as const }] : []), ...assistants.map((teacher) => ({ teacher, role: "ASSISTANT" as const }))].map(
                ({ teacher, role }) => (
                  <li key={teacher.id} className="flex items-center justify-between gap-2">
                    <PersonCell name={fullName(teacher)} size="sm" secondary={teacher.id === teacherId ? "أنت" : undefined} />
                    <TeacherRoleBadge role={role} />
                  </li>
                )
              )}
            </ul>
          </SectionCard>
        </div>
      </div>
    </>
  )
}
