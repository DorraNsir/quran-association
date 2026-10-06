import { CalendarDays } from "lucide-react"
import type { Metadata } from "next"

import { SectionCard } from "@/components/shared/info-list"
import { PageHeader } from "@/components/shared/page-header"
import { WeeklyScheduleGrid } from "@/components/shared/schedule"
import { MySessions } from "@/components/student/student-space"
import { NoGroupClass, StudentNotFound } from "@/components/student/student-states"
import { getCurrentStudent } from "@/lib/auth/current-user"
import { schedulesOf } from "@/lib/domain"
import { lookups, MOCK_TODAY } from "@/lib/mock"
import { getStudentGroupClass } from "@/lib/student-access"

export const metadata: Metadata = { title: "جدولي" }

export default async function StudentSchedulePage() {
  const { student } = await getCurrentStudent()
  if (!student) return <StudentNotFound />
  const view = getStudentGroupClass(student, lookups)

  return (
    <>
      <PageHeader title="جدولي" description="مواعيد حلقتك الأسبوعية وحصصك القادمة." />
      {!view ? (
        <NoGroupClass />
      ) : (
        <div className="space-y-6">
          <SectionCard title="البرنامج الأسبوعي" icon={CalendarDays}>
            {/* A class can meet several times a week: one entry per weekly slot */}
            <WeeklyScheduleGrid
              emptyLabel="لم يتم تحديد جدول لهذه المجموعة بعد"
              entries={schedulesOf(view.groupClass.id, lookups.schedules).map((slot) => ({
                slot,
                title: view.group?.name ?? "—",
                subtitle: `${view.branch?.name ?? ""} · ${view.room?.name ?? ""}`,
                emphasis: true,
              }))}
            />
          </SectionCard>
          <MySessions student={student} view={view} lookups={lookups} today={MOCK_TODAY} />
        </div>
      )}
    </>
  )
}
