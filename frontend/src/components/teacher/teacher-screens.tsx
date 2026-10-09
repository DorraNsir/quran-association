"use client"

import {
  BookOpen,
  BookOpenCheck,
  CalendarCheck2,
  CalendarDays,
  ClipboardCheck,
  DoorOpen,
  LayoutGrid,
  MapPin,
  NotebookPen,
  Phone,
  ShieldCheck,
  UserPlus,
} from "lucide-react"
import Link from "next/link"

import { StudentAttendanceHistory } from "@/components/attendance/student-attendance-history"
import { StudentMemorization } from "@/components/memorization/student-memorization"
import { StatusBadge } from "@/components/shared/badges"
import { InfoList, PhoneLink, SectionCard } from "@/components/shared/info-list"
import { NoAccess } from "@/components/shared/no-access"
import { Breadcrumbs, PageHeader } from "@/components/shared/page-header"
import { MetaItem, ProfileHeader } from "@/components/shared/profile"
import { ProfileTabs } from "@/components/shared/profile-tabs"
import { WeeklyScheduleGrid } from "@/components/shared/schedule"
import { WithTeacherWorkspace } from "@/components/shared/with-workspace"
import { todayInTunis, weekdayOf } from "@/lib/dates"
import { ageOn, fullName, indexLookups, studentClass, teacherWeeklySlots, weeklyMinutes } from "@/lib/domain"
import { formatDate, formatDuration } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { getTeacherGroupClasses } from "@/lib/teacher-access"

import { TeacherClassDetails, TeacherClasses } from "./teacher-classes"
import { TeacherDashboard } from "./teacher-dashboard"
import { TeacherMemorization } from "./teacher-memorization"
import { TeacherNotes } from "./teacher-notes"
import { TeacherWeekSessions } from "./teacher-sessions"
import { TeacherStudentsView } from "./teacher-students-view"

/*
 * Teacher Space screens. Everything comes from the signed-in teacher's
 * workspace bundle (GET /api/teacher/workspace: their classes, references
 * and current students) and the teacher endpoints — never from an id the
 * page could forge: the API checks every access again.
 */

export function TeacherHomeScreen() {
  const today = todayInTunis()
  return (
    <WithTeacherWorkspace>
      {({ teacher, lookups, students }) => (
        <>
          <PageHeader
            title={`مرحبًا، ${teacher.firstName}`}
            description={`${labels.weekday[weekdayOf(today)]} ${formatDate(today)} — حصصك ومهامك لهذا اليوم.`}
          />
          <TeacherDashboard teacherId={teacher.id} lookups={lookups} students={students} today={today} />
        </>
      )}
    </WithTeacherWorkspace>
  )
}

export function TeacherClassesScreen() {
  return (
    <>
      <PageHeader title="مجموعاتي" description="الحلقات التي تشرف عليها أو تساعد فيها، في كل فرع." />
      <WithTeacherWorkspace>
        {({ teacher, lookups, students }) => <TeacherClasses teacherId={teacher.id} lookups={lookups} students={students} today={todayInTunis()} />}
      </WithTeacherWorkspace>
    </>
  )
}

export function TeacherClassScreen({ id }: { id: string }) {
  return (
    <WithTeacherWorkspace>
      {({ teacher, lookups, students }) => {
        const assignment = getTeacherGroupClasses(teacher.id, lookups).find((a) => a.groupClass.id === id)
        if (!assignment) return <NoAccess backHref="/teacher/classes" backLabel="العودة إلى مجموعاتي" />
        return <TeacherClassDetails assignment={assignment} teacherId={teacher.id} lookups={lookups} students={students} today={todayInTunis()} />
      }}
    </WithTeacherWorkspace>
  )
}

export function TeacherScheduleScreen() {
  const today = todayInTunis()
  return (
    <>
      <PageHeader title="جدولي" description="برنامجك الأسبوعي في كل مجموعاتك، وحصص هذا الأسبوع." />
      <WithTeacherWorkspace>
        {({ teacher, lookups }) => {
          // Same weekly slots as the admin teacher profile: only this teacher's running classes
          const slots = teacherWeeklySlots(teacher.id, lookups)
          const minutes = weeklyMinutes(slots.map((s) => s.slot))
          return (
            <div className="space-y-6">
              <SectionCard
                title="البرنامج الأسبوعي"
                icon={CalendarDays}
                action={minutes > 0 && <span className="text-xs text-muted-foreground">{formatDuration(minutes)} أسبوعيًا</span>}
              >
                <WeeklyScheduleGrid
                  emptyLabel="لا توجد حصص مبرمجة لك"
                  entries={slots.map(({ slot, group, branch, room, groupClass, role }) => ({
                    slot,
                    title: group?.name ?? "—",
                    subtitle: `${labels.teachingRole[role]} · ${branch?.name ?? ""} · ${room?.name ?? ""}`,
                    href: `/teacher/classes/${groupClass.id}`,
                    emphasis: role === "SUPERVISOR",
                  }))}
                />
              </SectionCard>
              <SectionCard title="حصص هذا الأسبوع" icon={CalendarCheck2}>
                <TeacherWeekSessions today={today} />
              </SectionCard>
            </div>
          )
        }}
      </WithTeacherWorkspace>
    </>
  )
}

export function TeacherStudentsScreen() {
  return (
    <>
      <PageHeader title="طلابي" description="طلبة مجموعاتك فقط، مع آخر سورة محفوظة ونسبة الحضور." />
      <WithTeacherWorkspace>
        {({ teacher, lookups, students }) => <TeacherStudentsView teacherId={teacher.id} lookups={lookups} students={students} today={todayInTunis()} />}
      </WithTeacherWorkspace>
    </>
  )
}

export function TeacherMemorizationScreen() {
  return (
    <>
      <PageHeader title="متابعة الحفظ" description="آخر سورة حفظها كل طالب من طلبتك، حسب السنة الدراسية والسداسي." />
      <WithTeacherWorkspace>
        {({ teacher, lookups, students }) => <TeacherMemorization teacherId={teacher.id} lookups={lookups} students={students} today={todayInTunis()} />}
      </WithTeacherWorkspace>
    </>
  )
}

export function TeacherNotesScreen() {
  return (
    <>
      <PageHeader title="ملاحظاتي" description="ملاحظاتك الخاصة حول تقدّم طلبتك وسلوكهم. لا يطّلع عليها الطلبة ولا الأولياء." />
      <WithTeacherWorkspace>
        {({ teacher, lookups, students }) => (
          <TeacherNotes teacherId={teacher.id} lookups={lookups} students={students.filter((s) => s.status === "ACTIVE")} today={todayInTunis()} />
        )}
      </WithTeacherWorkspace>
    </>
  )
}

const TABS = ["overview", "attendance", "memorization", "notes"]

/** A student of one of the teacher's current classes — anyone else is "no access". */
export function TeacherStudentScreen({ id, tab }: { id: string; tab?: string }) {
  const today = todayInTunis()
  return (
    <WithTeacherWorkspace>
      {({ teacher, lookups, students }) => {
        const student = students.find((s) => s.id === id)
        if (!student) return <NoAccess backHref="/teacher/students" backLabel="العودة إلى طلابي" />
        const view = studentClass(student, indexLookups(lookups))
        const name = fullName(student)
        return (
          <>
            <Breadcrumbs className="mb-4" items={[{ label: "طلابي", href: "/teacher/students" }, { label: name }]} />
            <ProfileHeader
              name={name}
              photoUrl={student.photoUrl}
              badges={student.status !== "ACTIVE" && <StatusBadge status={student.status} />}
              meta={
                <>
                  {view && (
                    <MetaItem icon={BookOpen}>
                      <Link href={`/teacher/classes/${view.groupClass.id}`} className="hover:text-primary">
                        {view.group?.name} — {view.branch?.name}
                      </Link>
                    </MetaItem>
                  )}
                  {student.dateOfBirth && <MetaItem icon={CalendarDays}>{ageOn(student.dateOfBirth, today)} سنة</MetaItem>}
                </>
              }
            />
            <ProfileTabs
              defaultValue={tab && TABS.includes(tab) ? tab : undefined}
              tabs={[
                {
                  value: "overview",
                  label: "نظرة عامة",
                  icon: <LayoutGrid aria-hidden />,
                  content: (
                    <SectionCard title="المعلومات" icon={LayoutGrid}>
                      <InfoList
                        items={[
                          { label: "المجموعة", value: view?.group?.name, icon: BookOpen },
                          { label: "الفرع", value: view?.branch?.name, icon: MapPin },
                          { label: "القاعة", value: view?.room?.name, icon: DoorOpen },
                          { label: "المدرس المشرف", value: view?.supervisor && fullName(view.supervisor), icon: ShieldCheck },
                          ...(student.phone ? [{ label: "هاتف الطالب", value: <PhoneLink phone={student.phone} />, icon: Phone }] : []),
                          { label: "هاتف الولي", value: student.guardianPhone && <PhoneLink phone={student.guardianPhone} />, icon: Phone },
                          { label: "تاريخ التسجيل", value: formatDate(student.registrationDate), icon: UserPlus },
                        ]}
                      />
                    </SectionCard>
                  ),
                },
                {
                  value: "attendance",
                  label: "الحضور",
                  icon: <ClipboardCheck aria-hidden />,
                  content: <StudentAttendanceHistory studentId={student.id} workspace="teacher" />,
                },
                {
                  value: "memorization",
                  label: "متابعة الحفظ",
                  icon: <BookOpenCheck aria-hidden />,
                  content: <StudentMemorization studentId={student.id} lookups={lookups} students={students} today={today} scope="teacher" />,
                },
                {
                  value: "notes",
                  label: "ملاحظاتي",
                  icon: <NotebookPen aria-hidden />,
                  content: <TeacherNotes teacherId={teacher.id} lookups={lookups} students={students} today={today} studentId={student.id} />,
                },
              ]}
            />
          </>
        )
      }}
    </WithTeacherWorkspace>
  )
}
