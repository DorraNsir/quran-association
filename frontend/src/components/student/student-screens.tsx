"use client"

import { BookOpen, CalendarDays, DoorOpen, MapPin, Phone, ShieldCheck, UserPlus, UserRound, UsersRound } from "lucide-react"

import { TeacherRoleBadge } from "@/components/shared/badges"
import { InfoList, PhoneLink, SectionCard } from "@/components/shared/info-list"
import { PageHeader } from "@/components/shared/page-header"
import { ProfileHeader } from "@/components/shared/profile"
import { ScheduleSummary, WeeklyScheduleGrid } from "@/components/shared/schedule"
import { PersonCell } from "@/components/shared/user-avatar"
import { WithStudentWorkspace } from "@/components/shared/with-workspace"
import { todayInTunis, weekdayOf } from "@/lib/dates"
import { ageOn, fullName, roomsLabel, schedulesOf } from "@/lib/domain"
import { formatDate } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { getStudentGroupClass } from "@/lib/student-access"

import { MyAttendance, MyMemorization, MySessions, StudentDashboard } from "./student-space"
import { NoGroupClass } from "./student-states"

/*
 * Student Space screens: everything comes from the signed-in student's
 * workspace bundle (GET /api/student/workspace — their profile and their
 * CURRENT class only) and the /api/student/* endpoints.
 */

export function StudentHomeScreen() {
  const today = todayInTunis()
  return (
    <WithStudentWorkspace>
      {({ student, lookups }) => (
        <>
          <PageHeader title={`السلام عليكم ${student.firstName}`} description={`${labels.weekday[weekdayOf(today)]} ${formatDate(today)}`} />
          <StudentDashboard student={student} view={getStudentGroupClass(student, lookups)} today={today} />
        </>
      )}
    </WithStudentWorkspace>
  )
}

export function StudentGroupScreen() {
  return (
    <WithStudentWorkspace>
      {({ student, lookups }) => {
        const view = getStudentGroupClass(student, lookups)
        if (!view) {
          return (
            <>
              <PageHeader title="مجموعتي" />
              <NoGroupClass />
            </>
          )
        }
        const schedule = schedulesOf(view.groupClass.id, lookups.schedules)
        // Teachers: name and role only — no contact details or other assignments
        const team = [
          ...(view.supervisor ? [{ teacher: view.supervisor, role: "SUPERVISOR" as const }] : []),
          ...view.assistants.map((teacher) => ({ teacher, role: "ASSISTANT" as const })),
        ]
        return (
          <>
            <PageHeader title={view.group?.name ?? "مجموعتي"} description={view.group?.audience} />
            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard title="القسم" icon={BookOpen}>
                <InfoList
                  items={[
                    { label: "المجموعة", value: view.group?.name, icon: BookOpen },
                    { label: "الفرع", value: view.branch?.name, icon: MapPin },
                    { label: "القاعة", value: roomsLabel(view.rooms), icon: DoorOpen },
                  ]}
                />
              </SectionCard>
              <SectionCard title="معلمو المجموعة" icon={UsersRound}>
                {team.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لم يُحدَّد المعلمون بعد.</p>
                ) : (
                  <ul className="space-y-3">
                    {team.map(({ teacher, role }) => (
                      <li key={teacher.id} className="flex items-center justify-between gap-2">
                        <PersonCell name={fullName(teacher)} size="sm" />
                        <TeacherRoleBadge role={role} />
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
              <SectionCard title="البرنامج الأسبوعي" icon={CalendarDays} className="lg:col-span-2">
                {schedule.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لم يتم تحديد جدول لهذه المجموعة بعد</p>
                ) : (
                  <ScheduleSummary schedule={schedule} detail={(slot) => `${view.branch?.name ?? ""} · ${view.rooms.find((r) => r.id === slot.roomId)?.name ?? ""}`} />
                )}
              </SectionCard>
            </div>
          </>
        )
      }}
    </WithStudentWorkspace>
  )
}

export function StudentScheduleScreen() {
  return (
    <>
      <PageHeader title="جدولي" description="مواعيد قسمك الأسبوعية وحصصك القادمة." />
      <WithStudentWorkspace>
        {({ student, lookups }) => {
          const view = getStudentGroupClass(student, lookups)
          if (!view) return <NoGroupClass />
          return (
            <div className="space-y-6">
              <SectionCard title="البرنامج الأسبوعي" icon={CalendarDays}>
                {/* A class can meet several times a week: one entry per weekly slot */}
                <WeeklyScheduleGrid
                  emptyLabel="لم يتم تحديد جدول لهذه المجموعة بعد"
                  entries={schedulesOf(view.groupClass.id, lookups.schedules).map((slot) => ({
                    slot,
                    title: view.group?.name ?? "—",
                    subtitle: `${view.branch?.name ?? ""} · ${view.rooms.find((r) => r.id === slot.roomId)?.name ?? ""}`,
                    emphasis: true,
                  }))}
                />
              </SectionCard>
              <MySessions view={view} today={todayInTunis()} />
            </div>
          )
        }}
      </WithStudentWorkspace>
    </>
  )
}

export function StudentAttendanceScreen() {
  return (
    <>
      <PageHeader title="سجل الحضور" description="حضورك في حصص مجموعتك كما سجّله المعلم." />
      <MyAttendance />
    </>
  )
}

export function StudentMemorizationScreen() {
  return (
    <>
      <PageHeader title="متابعة الحفظ" description="آخر سورة حفظتها في كل سداسي، كما سجّلها المعلم." />
      <WithStudentWorkspace>{({ student }) => <MyMemorization student={student} today={todayInTunis()} />}</WithStudentWorkspace>
    </>
  )
}

/** Basic, read-only personal information. No ids, no admin metadata, no teacher notes. */
export function StudentProfileScreen() {
  const today = todayInTunis()
  return (
    <WithStudentWorkspace>
      {({ student, email, lookups }) => {
        const view = getStudentGroupClass(student, lookups)
        return (
          <>
            <ProfileHeader name={fullName(student)} photoUrl={student.photoUrl} meta={<span>{labels.role.STUDENT}</span>} />
            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard title="معلوماتي" icon={UserRound}>
                <InfoList
                  items={[
                    { label: "الاسم", value: student.firstName, icon: UserRound },
                    { label: "اللقب", value: student.lastName, icon: UserRound },
                    ...(student.dateOfBirth
                      ? [{ label: "تاريخ الولادة", value: `${formatDate(student.dateOfBirth)} (${ageOn(student.dateOfBirth, today)} سنة)`, icon: CalendarDays }]
                      : []),
                    ...(student.phone ? [{ label: "الهاتف", value: <PhoneLink phone={student.phone} />, icon: Phone }] : []),
                    ...(email ? [{ label: "البريد الإلكتروني", value: <span dir="ltr">{email}</span>, icon: UserRound }] : []),
                    { label: "تاريخ التسجيل", value: formatDate(student.registrationDate), icon: UserPlus },
                  ]}
                />
              </SectionCard>
              <SectionCard title="دراستي" icon={BookOpen}>
                <InfoList
                  className="sm:grid-cols-1"
                  items={[
                    { label: "المجموعة", value: view?.group?.name ?? "لم يتم إسنادك إلى مجموعة حالياً", icon: BookOpen },
                    { label: "الفرع", value: view?.branch?.name, icon: MapPin },
                    { label: "المدرس المشرف", value: view?.supervisor && fullName(view.supervisor), icon: ShieldCheck },
                  ]}
                />
              </SectionCard>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">لتعديل معلوماتك تواصل مع إدارة الجمعية.</p>
          </>
        )
      }}
    </WithStudentWorkspace>
  )
}
