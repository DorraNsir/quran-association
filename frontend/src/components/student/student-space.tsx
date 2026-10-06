"use client"

import {
  BookOpen,
  BookOpenCheck,
  CalendarClock,
  CalendarX2,
  ChevronLeft,
  ClipboardCheck,
  ClipboardList,
  DoorOpen,
  FolderOpen,
  MapPin,
  Megaphone,
  ShieldCheck,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { AttendanceStatusBadge, SessionStatusBadge } from "@/components/attendance/attendance-badges"
import { AttendanceStats } from "@/components/attendance/attendance-stats"
import { AnnouncementItem } from "@/components/communication/announcements-views"
import { ResourceTypeBadge } from "@/components/communication/resource-badges"
import type { PublisherNames } from "@/components/communication/resources-views"
import { MemorizationValue } from "@/components/memorization/memorization-dialog"
import { AcademicYearSelect } from "@/components/memorization/period-selectors"
import { EmptyState } from "@/components/shared/empty-state"
import { SectionCard } from "@/components/shared/info-list"
import { PeriodFilter, resolvePeriod, type Period } from "@/components/shared/period-filter"
import { Card } from "@/components/ui/card"
import { summarize } from "@/lib/attendance"
import { getAnnouncementsForStudent, getResourcesForStudent } from "@/lib/communication"
import { isWithin, weekdayOf } from "@/lib/dates"
import { fullName, type ClassView, type Lookups } from "@/lib/domain"
import { countLabels, formatDate, formatRelativeDay, formatShortDate, formatTimeRange, formatWeekdayDate } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { defaultPeriod, SEMESTERS } from "@/lib/memorization"
import { useOperations } from "@/lib/store/operations"
import { getStudentAttendance, getStudentMemorization, getStudentSessions } from "@/lib/student-access"
import { cn } from "@/lib/utils"
import type { AcademicYear, ISODate, Session, Student } from "@/types/domain"

/*
 * Student Space — READ-ONLY views of the current student's own data.
 * Every list is derived through lib/student-access selectors; nothing here
 * reads TeacherNote, offers an edit action, or shows another student.
 */

/** The student's own sessions and attendance, live from the shared store. */
function useStudentRecords(student: Student, lookups: Lookups) {
  const state = useOperations()
  const sessions = getStudentSessions(student, state.sessions)
  const attendance = getStudentAttendance(student.id, state, lookups)
  return { sessions, attendance, memorization: state.memorizationProgress }
}

const nextSessionOf = (sessions: Session[], today: ISODate) =>
  sessions.find((s) => s.date >= today && s.status !== "CANCELLED")

/** "الحصة القادمة": when and where — or a clear empty state. */
function NextSession({ session, view, today }: { session?: Session; view?: ClassView; today: ISODate }) {
  if (!session) {
    return <p className="py-2 text-sm text-muted-foreground">لا توجد حصة قادمة حالياً</p>
  }
  return (
    <div className="flex items-center gap-4">
      <div className="flex size-16 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-soft text-brand-soft-foreground">
        <span className="text-xs">{session.date === today ? "اليوم" : labels.weekdayShort[weekdayOf(session.date)]}</span>
        <span className="text-lg font-semibold tabular-nums" dir="ltr">{session.start}</span>
      </div>
      <div className="min-w-0 space-y-1">
        <p className="font-semibold">{formatWeekdayDate(session.date)}</p>
        <p className="text-sm tabular-nums text-muted-foreground">
          <span dir="ltr" className="inline-block">{formatTimeRange(session.start, session.end)}</span> · {view?.group?.name}
        </p>
        <p className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden />{view?.branch?.name}</span>
          <span className="inline-flex items-center gap-1"><DoorOpen className="size-3.5" aria-hidden />{view?.room?.name}</span>
        </p>
      </div>
    </div>
  )
}

function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
      {children}
      <ChevronLeft className="size-4 ltr:rotate-180" aria-hidden />
    </Link>
  )
}

/** Answers "where, when, with whom, how am I doing?" — in that order on phones. */
export function StudentDashboard({
  student,
  view,
  lookups,
  academicYears,
  publishers,
  today,
}: {
  student: Student
  view?: ClassView
  lookups: Lookups
  academicYears: AcademicYear[]
  publishers: PublisherNames
  today: ISODate
}) {
  const { sessions, attendance, memorization } = useStudentRecords(student, lookups)
  const { resources, resourceTargets, announcements, announcementTargets } = useOperations()
  // Same visibility helpers as the resources / announcements pages and their notifications
  const latestResources = getResourcesForStudent(student, resources, resourceTargets, lookups.groupClasses).slice(0, 3)
  const latestAnnouncements = getAnnouncementsForStudent(student, announcements, announcementTargets, today).slice(0, 3)
  const next = nextSessionOf(sessions, today)
  const summary = summarize(attendance.map((e) => e.record))
  const period = defaultPeriod(academicYears, today)
  const year = academicYears.find((y) => y.id === period.academicYearId)
  const current = getStudentMemorization(memorization, student.id, period.academicYearId, period.semester)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard title="الحصة القادمة" icon={CalendarClock}>
        <NextSession session={next} view={view} today={today} />
      </SectionCard>

      <SectionCard title="مجموعتي" icon={BookOpen} action={<CardLink href="/student/group">عرض المجموعة</CardLink>}>
        {view ? (
          <div className="space-y-1.5">
            <p className="text-lg font-semibold">{view.group?.name}</p>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <ShieldCheck className="size-4 text-primary" aria-hidden />
              المدرس المشرف: <span className="font-medium text-foreground">{view.supervisor ? fullName(view.supervisor) : "—"}</span>
            </p>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-4" aria-hidden />
              {view.branch?.name} · {view.room?.name}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">لم يتم إسنادك إلى مجموعة حالياً</p>
        )}
      </SectionCard>

      <SectionCard title="آخر سورة محفوظة" icon={BookOpenCheck} action={<CardLink href="/student/memorization">عرض التفاصيل</CardLink>}>
        <div className="space-y-1">
          {current ? (
            <MemorizationValue surah={current.lastMemorizedSurah} className="text-xl" />
          ) : (
            <p className="text-sm text-muted-foreground">لم يتم تحديد آخر سورة محفوظة بعد</p>
          )}
          <p className="text-xs text-muted-foreground">
            {labels.semester[period.semester]} · <span dir="ltr">{year?.label}</span>
            {current && <> · آخر تحديث {formatDate(current.updatedAt)}</>}
          </p>
        </div>
      </SectionCard>

      <SectionCard title="نسبة الحضور" icon={ClipboardCheck} action={<CardLink href="/student/attendance">عرض سجل الحضور</CardLink>}>
        {summary.recorded === 0 ? (
          <p className="text-sm text-muted-foreground">لا يوجد سجل حضور بعد</p>
        ) : (
          <div className="space-y-3">
            <p className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">{summary.rate === null ? "—" : `${summary.rate}%`}</span>
              <span className="text-sm text-muted-foreground tabular-nums">
                {summary.present + summary.late} / {countLabels.sessions(summary.recorded)}
              </span>
            </p>
            <ul className="flex flex-wrap gap-2" aria-label="آخر الحصص">
              {attendance.slice(0, 4).map(({ record, session }) => (
                <li key={record.id} className="flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs">
                  <span className="text-muted-foreground">{formatShortDate(session.date)}</span>
                  <AttendanceStatusBadge status={record.status} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </SectionCard>

      <SectionCard title="أحدث الموارد" icon={FolderOpen} action={<CardLink href="/student/resources">كل الموارد</CardLink>}>
        {latestResources.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد موارد متاحة حالياً</p>
        ) : (
          <ul className="space-y-1">
            {latestResources.map((r) => (
              <li key={r.id}>
                <Link href={`/student/resources/${r.id}`} className="-mx-2 flex items-center justify-between gap-3 rounded-lg p-2 hover:bg-muted">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {publishers[r.publishedByUserId] ?? "—"} · {formatRelativeDay(r.createdAt, today)}
                    </span>
                  </span>
                  <ResourceTypeBadge type={r.type} className="shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="آخر الإعلانات" icon={Megaphone} action={<CardLink href="/student/announcements">كل الإعلانات</CardLink>}>
        {latestAnnouncements.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد إعلانات حالياً</p>
        ) : (
          <ul className="space-y-1">
            {latestAnnouncements.map((a) => (
              <li key={a.id}>
                <AnnouncementItem announcement={a} href={`/student/announcements/${a.id}`} today={today} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}

/** Upcoming and recent sessions of the student's class (cancellations shown, nothing actionable). */
export function MySessions({ student, view, lookups, today }: { student: Student; view?: ClassView; lookups: Lookups; today: ISODate }) {
  const { sessions } = useStudentRecords(student, lookups)
  const upcoming = sessions.filter((s) => s.date >= today).slice(0, 4)
  const recent = sessions.filter((s) => s.date < today).slice(-4).reverse()

  const list = (items: Session[], empty: string) =>
    items.length === 0 ? (
      <EmptyState icon={CalendarX2} title={empty} className="py-6" />
    ) : (
      <ul className="divide-y">
        {items.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="font-medium">
                {labels.weekday[weekdayOf(s.date)]} {formatDate(s.date)}
                {s.date === today && <span className="ms-1.5 text-xs text-primary">اليوم</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                <span dir="ltr" className="inline-block tabular-nums">{formatTimeRange(s.start, s.end)}</span> · {view?.branch?.name} · {view?.room?.name}
              </p>
            </div>
            {s.status !== "SCHEDULED" && <SessionStatusBadge status={s.status} />}
          </li>
        ))}
      </ul>
    )

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <SectionCard title="الحصص القادمة" icon={CalendarClock}>{list(upcoming, "لا توجد حصة قادمة حالياً")}</SectionCard>
      <SectionCard title="آخر الحصص" icon={ClipboardList}>{list(recent, "لا توجد حصص سابقة")}</SectionCard>
    </div>
  )
}

/** Summary (same formula as everywhere) and session-by-session history — read-only. */
export function MyAttendance({ student, lookups, today }: { student: Student; lookups: Lookups; today: ISODate }) {
  const { attendance } = useStudentRecords(student, lookups)
  const [period, setPeriod] = useState<Period>({ preset: "year" })
  const range = resolvePeriod(period, today)
  const entries = attendance.filter((e) => isWithin(e.session.date, range))
  const summary = summarize(entries.map((e) => e.record))

  return (
    <div className="space-y-5">
      <PeriodFilter value={period} onChange={setPeriod} />
      <AttendanceStats summary={summary} extra={{ label: "إجمالي الحصص", value: summary.recorded }} />

      <Card className="gap-0 p-0">
        {entries.length === 0 ? (
          <EmptyState icon={ClipboardList} title="لا يوجد سجل حضور بعد" />
        ) : (
          <ol className="divide-y">
            {entries.map(({ record, session, groupName, branchName }) => (
              <li key={record.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {labels.weekday[weekdayOf(session.date)]} {formatDate(session.date)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {groupName} ({branchName}) ·{" "}
                    <span dir="ltr" className="inline-block tabular-nums">{formatTimeRange(session.start, session.end)}</span>
                  </p>
                </div>
                <AttendanceStatusBadge status={record.status} className="shrink-0" />
              </li>
            ))}
          </ol>
        )}
      </Card>
      {entries.length > 0 && (
        <p className="text-xs text-muted-foreground">نسبة الحضور = (حاضر + متأخر) ÷ (الحصص المسجّلة − الغياب المبرر).</p>
      )}
    </div>
  )
}

/** Last memorized surah per semester of the chosen year — consult only, no update action. */
export function MyMemorization({
  student,
  lookups,
  academicYears,
  today,
}: {
  student: Student
  lookups: Lookups
  academicYears: AcademicYear[]
  today: ISODate
}) {
  const { memorization } = useStudentRecords(student, lookups)
  const initial = defaultPeriod(academicYears, today)
  const [academicYearId, setAcademicYearId] = useState(initial.academicYearId)

  return (
    <div className="space-y-5">
      <AcademicYearSelect value={academicYearId} onChange={setAcademicYearId} years={academicYears} />
      <ul className="grid gap-4 sm:grid-cols-2">
        {SEMESTERS.map((semester) => {
          const record = getStudentMemorization(memorization, student.id, academicYearId, semester)
          const isCurrent = academicYearId === initial.academicYearId && semester === initial.semester
          return (
            <li key={semester}>
              <Card className={cn("h-full gap-3 p-5", isCurrent && "border-primary/40")}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold">{labels.semester[semester]}</h2>
                  {isCurrent && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand-soft-foreground">السداسي الحالي</span>}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">آخر سورة محفوظة</p>
                  <MemorizationValue surah={record?.lastMemorizedSurah} className="text-2xl" />
                </div>
                <p className="text-xs text-muted-foreground">
                  {record ? `آخر تحديث: ${formatDate(record.updatedAt)}` : "لم يتم تحديد آخر سورة محفوظة بعد"}
                </p>
              </Card>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-muted-foreground">يُحدِّث المعلم آخر سورة محفوظة بعد كل مراجعة.</p>
    </div>
  )
}
