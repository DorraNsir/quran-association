"use client"

import {
  BookOpen,
  BookOpenCheck,
  CalendarCheck2,
  CalendarDays,
  CircleDashed,
  ClipboardCheck,
  GraduationCap,
  Megaphone,
  NotebookPen,
} from "lucide-react"
import Link from "next/link"

import { AnnouncementItem, useReaderAnnouncements } from "@/components/communication/announcements-views"
import { AttendancePeriodStats } from "@/components/attendance/attendance-period-stats"
import { SectionCard } from "@/components/shared/info-list"
import { StatCard } from "@/components/shared/stat-card"
import { Button } from "@/components/ui/button"
import { useAttendanceOpen } from "@/hooks/use-attendance-open"
import { canTakeAttendance } from "@/lib/attendance"
import { weekdayOf } from "@/lib/dates"
import type { Lookups } from "@/lib/domain"
import { formatDate, formatShortDate } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { defaultPeriod, indexMemorization, memorizationKey } from "@/lib/memorization"
import { useClassesMemorization } from "@/lib/api/memorization"
import { getTeacherGroupClasses } from "@/lib/teacher-access"
import { attendanceOpensLabel } from "@/lib/session-actions"
import { cn } from "@/lib/utils"
import type { ID, ISODate, Student } from "@/types/domain"

import { isAttendancePending, TeacherSessionList, useTeacherSessionRows } from "./teacher-sessions"
import { useAcademicYears } from "@/lib/store/settings"

/** No lesson waiting: the clock hook stays idle. */
const NO_SESSION = { status: "CANCELLED", date: "", start: "" } as const

/** "What do I teach today, what is left to record?" — the teacher's day at a glance. */
export function TeacherDashboard({
  teacherId,
  lookups,
  students,
  today,
}: {
  teacherId: ID
  lookups: Lookups
  /** The teacher's own students */
  students: Student[]
  today: ISODate
}) {
  const academicYears = useAcademicYears()
  const { rows } = useTeacherSessionRows(today)
  const classes = getTeacherGroupClasses(teacherId, lookups)
  const active = students.filter((s) => s.status === "ACTIVE")
  const latestAnnouncements = useReaderAnnouncements("teacher", 2)

  const todayRows = rows.filter((r) => r.session.date === today)
  // Today's next lesson not started yet: one clock re-checks it, so the
  // attendance shortcut turns on at its start minute (no page reload)
  const nextToday = todayRows.find((r) => r.session.status !== "CANCELLED" && !canTakeAttendance(r.session))
  const { now } = useAttendanceOpen(nextToday?.session ?? NO_SESSION)
  const pending = rows.filter((r) => isAttendancePending(r, now)).reverse()
  const next = rows.find((r) => r.session.date > today && r.session.status !== "CANCELLED")

  const period = defaultPeriod(academicYears, today)
  const year = academicYears.find((y) => y.id === period.academicYearId)
  const memo = useClassesMemorization("teacher", classes.map((a) => a.groupClass.id), {
    academicYearId: period.academicYearId || undefined,
    semester: period.semester,
  })
  const byKey = indexMemorization(memo.records)
  const missing = (list: Student[]) =>
    list.filter((s) => !byKey.has(memorizationKey(s.id, period.academicYearId, period.semester))).length
  const missingTotal = missing(active)

  // The most useful attendance shortcut: today's latest STARTED session, else
  // the oldest pending one; before today's first start, the action waits (disabled)
  const startedToday = todayRows.filter((r) => canTakeAttendance(r.session, now))
  const attendanceTarget = startedToday[startedToday.length - 1] ?? pending[pending.length - 1]
  const waitingTarget = attendanceTarget ? undefined : todayRows.find((r) => r.session.status !== "CANCELLED")

  return (
    <div className="space-y-6">
      <section aria-label="أرقام رئيسية" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="مجموعاتي" value={classes.length} icon={BookOpen} href="/teacher/classes" />
        <StatCard label="طلابي" value={active.length} icon={GraduationCap} href="/teacher/students" />
        <StatCard label="حضور غير مسجَّل" value={pending.length} icon={CircleDashed} href="/teacher/sessions?tab=pending"
          className={cn(pending.length > 0 && "border-warning/40")} />
        <StatCard label="حفظ دون تحديد" value={missingTotal} icon={BookOpenCheck} href="/teacher/memorization"
          hint={labels.semester[period.semester]} className={cn(missingTotal > 0 && "border-warning/40")} />
      </section>

      <section aria-label="إجراءات سريعة" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {attendanceTarget && (
          <Button asChild size="lg" className="col-span-2 sm:col-span-1">
            <Link href={`/teacher/sessions/${attendanceTarget.session.id}/attendance`}>
              <ClipboardCheck />
              تسجيل الحضور — {attendanceTarget.group?.name}
            </Link>
          </Button>
        )}
        {waitingTarget && (
          <span className="col-span-2 inline-flex flex-col items-start gap-1 sm:col-span-1">
            <Button size="lg" disabled aria-describedby="dashboard-attendance-opens">
              <ClipboardCheck />
              تسجيل الحضور — {waitingTarget.group?.name}
            </Button>
            <span id="dashboard-attendance-opens" className="text-xs text-muted-foreground">
              {attendanceOpensLabel(waitingTarget.session, formatShortDate, now)}
            </span>
          </span>
        )}
        <Button asChild size="lg" variant="outline">
          <Link href="/teacher/memorization">
            <BookOpenCheck />
            تحديث الحفظ
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/teacher/notes">
            <NotebookPen />
            ملاحظاتي
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="hidden sm:inline-flex">
          <Link href="/teacher/schedule">
            <CalendarDays />
            جدولي
          </Link>
        </Button>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title={`حصص اليوم — ${labels.weekday[weekdayOf(today)]} ${formatDate(today)}`}
          icon={CalendarCheck2}
        >
          <TeacherSessionList rows={todayRows} today={today} showDate={false} emptyTitle="لا توجد حصص لك اليوم" />
          {todayRows.length === 0 && next && (
            <div className="mt-3 space-y-2 border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground">الحصة القادمة</p>
              <TeacherSessionList rows={[next]} today={today} emptyTitle="" />
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="مهام الحضور"
          icon={ClipboardCheck}
          action={
            pending.length > 0 && (
              <Button asChild variant="ghost" size="sm" className="text-primary">
                <Link href="/teacher/sessions?tab=pending">الكل ({pending.length})</Link>
              </Button>
            )
          }
        >
          <TeacherSessionList rows={pending.slice(0, 4)} today={today} emptyTitle="الحضور مسجَّل لكل حصصك" />
        </SectionCard>
      </div>

      <SectionCard title="حضوري" icon={ClipboardCheck}>
        <AttendancePeriodStats subject={{ kind: "teacher", scope: "teacher" }} />
      </SectionCard>

      <SectionCard
        title="متابعة الحفظ"
        icon={BookOpenCheck}
        action={
          <span className="text-xs text-muted-foreground">
            <span dir="ltr">{year?.label}</span> · {labels.semester[period.semester]}
          </span>
        }
      >
        {classes.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد مجموعات مسندة إليك.</p>
        ) : (
          <ul className="divide-y">
            {classes.map((a) => {
              const roster = active.filter((s) => s.groupClassId === a.groupClass.id)
              const left = missing(roster)
              const done = roster.length - left
              return (
                <li key={a.groupClass.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
                  <Link href={`/teacher/classes/${a.groupClass.id}`} className="min-w-0 flex-1 hover:opacity-80">
                    <p className="font-medium">{a.group?.name} <span className="text-sm font-normal text-muted-foreground">— {a.branch?.name}</span></p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <div className="h-full rounded-full bg-primary" style={{ width: `${roster.length ? (done / roster.length) * 100 : 0}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums">{done}/{roster.length}</span>
                    </div>
                  </Link>
                  {left > 0 ? (
                    <span className="text-sm text-warning">{left} دون تحديد</span>
                  ) : (
                    <span className="text-sm text-primary">مكتمل</span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </SectionCard>

      {latestAnnouncements.length > 0 && (
        <SectionCard
          title="آخر الإعلانات"
          icon={Megaphone}
          action={
            <Button asChild variant="ghost" size="sm" className="text-primary">
              <Link href="/teacher/announcements">كل الإعلانات</Link>
            </Button>
          }
        >
          <ul className="grid gap-1 sm:grid-cols-2 sm:gap-4">
            {latestAnnouncements.map((a) => (
              <li key={a.id}>
                <AnnouncementItem announcement={a} href={`/teacher/announcements/${a.id}`} today={today} />
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  )
}
