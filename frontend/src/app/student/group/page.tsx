import { BookOpen, CalendarDays, DoorOpen, MapPin, UsersRound } from "lucide-react"
import type { Metadata } from "next"

import { TeacherRoleBadge } from "@/components/shared/badges"
import { InfoList, SectionCard } from "@/components/shared/info-list"
import { PageHeader } from "@/components/shared/page-header"
import { ScheduleSummary } from "@/components/shared/schedule"
import { PersonCell } from "@/components/shared/user-avatar"
import { NoGroupClass, StudentNotFound } from "@/components/student/student-states"
import { getCurrentStudent } from "@/lib/auth/current-user"
import { fullName, schedulesOf } from "@/lib/domain"
import { lookups } from "@/lib/mock"
import { getStudentGroupClass } from "@/lib/student-access"

export const metadata: Metadata = { title: "مجموعتي" }

/** The student's class — resolved through GroupClass, so it is THIS branch's class and supervisor. */
export default async function StudentGroupPage() {
  const { student } = await getCurrentStudent()
  if (!student) return <StudentNotFound />
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
        <SectionCard title="الحلقة" icon={BookOpen}>
          <InfoList
            items={[
              { label: "المجموعة", value: view.group?.name, icon: BookOpen },
              { label: "الفرع", value: view.branch?.name, icon: MapPin },
              { label: "القاعة", value: view.room?.name, icon: DoorOpen },
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
            <ScheduleSummary schedule={schedule} detail={() => `${view.branch?.name ?? ""} · ${view.room?.name ?? ""}`} />
          )}
        </SectionCard>
      </div>
    </>
  )
}
