import { CalendarCheck2, CalendarDays } from "lucide-react"
import type { Metadata } from "next"

import { SectionCard } from "@/components/shared/info-list"
import { PageHeader } from "@/components/shared/page-header"
import { WeeklyScheduleGrid } from "@/components/shared/schedule"
import { TeacherWeekSessions } from "@/components/teacher/teacher-sessions"
import { getCurrentTeacher } from "@/lib/auth/current-user"
import { teacherWeeklySlots, weeklyMinutes } from "@/lib/domain"
import { formatDuration } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { lookups, MOCK_TODAY, students } from "@/lib/mock"
import { getTeacherStudents } from "@/lib/teacher-access"

export const metadata: Metadata = { title: "جدولي" }

export default async function TeacherSchedulePage() {
  const { teacherId } = await getCurrentTeacher()
  // Same weekly slots as the admin teacher profile: only this teacher's running classes
  const slots = teacherWeeklySlots(teacherId, lookups)
  const minutes = weeklyMinutes(slots.map((s) => s.slot))

  return (
    <>
      <PageHeader title="جدولي" description="برنامجك الأسبوعي في كل مجموعاتك، وحصص هذا الأسبوع." />
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
          <TeacherWeekSessions teacherId={teacherId} lookups={lookups} students={getTeacherStudents(teacherId, lookups, students)} today={MOCK_TODAY} />
        </SectionCard>
      </div>
    </>
  )
}
