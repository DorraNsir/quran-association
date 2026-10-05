import { Building2, GraduationCap, Users, UsersRound } from "lucide-react"
import type { Metadata } from "next"

import { AttentionList } from "@/components/dashboard/attention-list"
import {
  GroupsOverview,
  RecentActivity,
  RecentStudents,
  TeacherWorkload,
} from "@/components/dashboard/overview-lists"
import { TodaySessions } from "@/components/dashboard/today-sessions"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard } from "@/components/shared/stat-card"
import { isRunning, weekdayOf } from "@/lib/domain"
import { countLabels, formatDate } from "@/lib/format"
import { labels } from "@/lib/i18n"
import {
  branches,
  currentUser,
  groupClasses,
  groups,
  lookups,
  MOCK_TODAY,
  recentActivity,
  rooms,
  students,
  teachers,
} from "@/lib/mock"

export const metadata: Metadata = { title: "لوحة القيادة" }

/** Registrations during the 30 days before the reference date. */
function registeredSince(days: number) {
  const from = new Date(MOCK_TODAY)
  from.setUTCDate(from.getUTCDate() - days)
  const iso = from.toISOString().slice(0, 10)
  return students.filter((s) => s.registrationDate >= iso).length
}

export default function DashboardPage() {
  const activeStudents = students.filter((s) => s.status === "ACTIVE").length
  const activeTeachers = teachers.filter((t) => t.status === "ACTIVE").length
  const activeGroups = groups.filter((g) => g.status === "ACTIVE").length
  const groupsById = new Map(groups.map((g) => [g.id, g]))
  const runningClasses = groupClasses.filter((c) => isRunning(c, groupsById)).length
  const activeBranches = branches.filter((b) => b.status === "ACTIVE")
  const activeRooms = rooms.filter(
    (r) => r.status === "ACTIVE" && activeBranches.some((b) => b.id === r.branchId)
  ).length
  const newStudents = registeredSince(30)

  return (
    <>
      <PageHeader
        title={`مرحبًا، ${currentUser.firstName}`}
        description={`${labels.weekday[weekdayOf(MOCK_TODAY)]} ${formatDate(MOCK_TODAY)} — ملخص نشاط الجمعية وما يحتاج إلى متابعتك.`}
      />

      <section aria-label="أرقام رئيسية" className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="الطلبة النشطون"
          value={activeStudents}
          icon={GraduationCap}
          href="/admin/students"
          hint={`من أصل ${students.length} مسجّلًا · ${newStudents} تسجيلات خلال 30 يومًا`}
        />
        <StatCard
          label="المعلمون النشطون"
          value={activeTeachers}
          icon={UsersRound}
          href="/admin/teachers"
          hint={`${teachers.length - activeTeachers} غير نشط`}
        />
        <StatCard
          label="المجموعات النشطة"
          value={activeGroups}
          icon={Users}
          href="/admin/groups"
          hint={`${countLabels.classes(runningClasses)} نشطة · ${groups.length - activeGroups} متوقفة أو مؤرشفة`}
        />
        <StatCard
          label="الفروع"
          value={branches.length}
          icon={Building2}
          href="/admin/branches"
          hint={`${activeBranches.length} نشطة · ${countLabels.rooms(activeRooms)} متاحة`}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <TodaySessions today={MOCK_TODAY} lookups={lookups} students={students} />
        <AttentionList lookups={lookups} students={students} />
        <GroupsOverview lookups={lookups} students={students} />
        <RecentStudents lookups={lookups} students={students} />
        <TeacherWorkload lookups={lookups} />
        <RecentActivity entries={recentActivity} />
      </div>
    </>
  )
}
