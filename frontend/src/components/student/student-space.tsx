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
import { StudentAttendanceHistory } from "@/components/attendance/student-attendance-history"
import { AnnouncementItem, useReaderAnnouncements } from "@/components/communication/announcements-views"
import { ResourceTypeBadge } from "@/components/communication/resource-badges"
import { MemorizationValue } from "@/components/memorization/memorization-dialog"
import { AcademicYearSelect } from "@/components/memorization/period-selectors"
import { EmptyState } from "@/components/shared/empty-state"
import { SectionCard } from "@/components/shared/info-list"
import { QueryState } from "@/components/shared/query-state"
import { Card } from "@/components/ui/card"
import { useStudentAttendanceRecords, useStudentAttendanceSummary } from "@/lib/api/attendance"
import { useStudentMemorization } from "@/lib/api/memorization"
import { toResourceView, useResources } from "@/lib/api/resources"
import { toSession, useSessionRange } from "@/lib/api/sessions"
import { addDays, weekdayOf } from "@/lib/dates"
import { type ClassView, fullName, roomsLabel } from "@/lib/domain"
import { countLabels, formatDate, formatRelativeDay, formatShortDate, formatTimeRange, formatWeekdayDate } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { defaultPeriod, SEMESTERS } from "@/lib/memorization"
import { getStudentMemorization } from "@/lib/student-access"
import { cn } from "@/lib/utils"
import type { ISODate, Session, Student } from "@/types/domain"
import { useAcademicYears, useCurrentAcademicYear } from "@/lib/store/settings"

/*
 * Student Space — READ-ONLY views of the current student's own data, from
 * the /api/student/* endpoints (scope = the signed-in account, never an id
 * from the page). Nothing here reads TeacherNote, offers an edit action, or
 * shows another student.
 */

/** Sessions of the student's current class around today (30 days back, 30 ahead). */
function useMySessions(today: ISODate) {
  const query = useSessionRange("student", { from: addDays(today, -30), to: addDays(today, 30) })
  // Each session keeps its own room (the room of its weekly slot when it was planned)
  return { sessions: (query.data ?? []).map((s): MySession => ({ ...toSession(s), roomName: s.room.name })), query }
}

type MySession = Session & { roomName: string }

const nextSessionOf = (sessions: MySession[], today: ISODate) =>
  sessions.find((s) => s.date >= today && s.status !== "CANCELLED")

/** "الحصة القادمة": when and where — or a clear empty state. */
function NextSession({ session, view, today }: { session?: MySession; view?: ClassView; today: ISODate }) {
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
          <span className="inline-flex items-center gap-1"><DoorOpen className="size-3.5" aria-hidden />{session.roomName}</span>
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
export function StudentDashboard({ student, view, today }: { student: Student; view?: ClassView; today: ISODate }) {
  const academicYears = useAcademicYears()
  const currentYear = useCurrentAcademicYear()
  const { sessions } = useMySessions(today)
  const memorization = useStudentMemorization("student").data ?? []
  // The API resolves what this student may see (same rule as their notifications)
  const latestResources = (useResources("student", {}, 1, 3).data?.data ?? []).map(toResourceView)
  const latestAnnouncements = useReaderAnnouncements("student", 3)
  const yearRange = currentYear ? { from: currentYear.startDate, to: currentYear.endDate } : {}
  const summaryQuery = useStudentAttendanceSummary("student", undefined, yearRange)
  const recent = useStudentAttendanceRecords("student", undefined, yearRange, 1, 4).data?.data ?? []
  const summary = summaryQuery.data ?? { recorded: 0, present: 0, absent: 0, late: 0, excused: 0, rate: null }
  const next = nextSessionOf(sessions, today)
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
              {view.branch?.name} · {roomsLabel(view.rooms)}
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
              {recent.map((record) => (
                <li key={record.sessionId} className="flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs">
                  <span className="text-muted-foreground">{formatShortDate(record.date)}</span>
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
                      {r.publisher} · {formatRelativeDay(r.createdAt, today)}
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
export function MySessions({ view, today }: { view?: ClassView; today: ISODate }) {
  const { sessions, query } = useMySessions(today)
  const upcoming = sessions.filter((s) => s.date >= today).slice(0, 4)
  const recent = sessions.filter((s) => s.date < today).slice(-4).reverse()

  const list = (items: MySession[], empty: string) =>
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
                <span dir="ltr" className="inline-block tabular-nums">{formatTimeRange(s.start, s.end)}</span> · {view?.branch?.name} · {s.roomName}
              </p>
            </div>
            {s.status !== "SCHEDULED" && <SessionStatusBadge status={s.status} />}
          </li>
        ))}
      </ul>
    )

  return (
    <QueryState query={query}>
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="الحصص القادمة" icon={CalendarClock}>{list(upcoming, "لا توجد حصة قادمة حالياً")}</SectionCard>
        <SectionCard title="آخر الحصص" icon={ClipboardList}>{list(recent, "لا توجد حصص سابقة")}</SectionCard>
      </div>
    </QueryState>
  )
}

/** Summary (same formula as everywhere) and session-by-session history — read-only (GET /api/student/attendance). */
export function MyAttendance() {
  return <StudentAttendanceHistory workspace="student" />
}

/** Last memorized surah per semester of the chosen year — consult only, no update action. */
export function MyMemorization({ student, today }: { student: Student; today: ISODate }) {
  const academicYears = useAcademicYears()
  const query = useStudentMemorization("student")
  const memorization = query.data ?? []
  const initial = defaultPeriod(academicYears, today)
  const [pickedYearId, setAcademicYearId] = useState<string>()
  const academicYearId = pickedYearId ?? initial.academicYearId

  if (!query.data) return <QueryState query={query}>{null}</QueryState>
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
