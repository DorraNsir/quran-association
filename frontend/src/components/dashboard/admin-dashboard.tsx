"use client"

import { useQuery } from "@tanstack/react-query"
import { AlertTriangle, Building2, ClipboardList, GraduationCap, Users, UsersRound } from "lucide-react"
import Link from "next/link"

import { useSessionUser } from "@/components/auth/workspace-gate"
import { SectionCard } from "@/components/shared/info-list"
import { PageHeader } from "@/components/shared/page-header"
import { QueryState } from "@/components/shared/query-state"
import { StatCard } from "@/components/shared/stat-card"
import { WithLookupsAndStudents } from "@/components/shared/with-admin-data"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api/client"
import { todayInTunis, weekdayOf } from "@/lib/dates"
import { countLabels, formatDate } from "@/lib/format"
import { labels } from "@/lib/i18n"

import { AttentionList } from "./attention-list"
import { GroupsOverview, RecentStudents, TeacherWorkload } from "./overview-lists"
import { TodaySessions } from "./today-sessions"

/** GET /api/admin/dashboard — counts computed by the API. */
interface DashboardStats {
  today: string
  students: { total: number; active: number; registeredLast30Days: number }
  teachers: { total: number; active: number }
  groups: { total: number; active: number; runningClasses: number }
  branches: { total: number; active: number; activeRooms: number }
  registrationRequests: { pending: number }
  sessions: { today: number; needsAttention: number }
}

export function AdminDashboard() {
  const user = useSessionUser()
  const today = todayInTunis()
  const stats = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: ({ signal }) => api<DashboardStats>("/admin/dashboard", { signal }),
  })
  const s = stats.data

  return (
    <>
      <PageHeader
        title={`مرحبًا، ${user.firstName}`}
        description={`${labels.weekday[weekdayOf(today)]} ${formatDate(today)} — ملخص نشاط الجمعية وما يحتاج إلى متابعتك.`}
      />

      <QueryState query={stats}>
        {s && (
          <section aria-label="أرقام رئيسية" className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="الطلبة النشطون" value={s.students.active} icon={GraduationCap} href="/admin/students"
              hint={`من أصل ${s.students.total} مسجّلًا · ${s.students.registeredLast30Days} تسجيلات خلال 30 يومًا`} />
            <StatCard label="المعلمون النشطون" value={s.teachers.active} icon={UsersRound} href="/admin/teachers"
              hint={`${s.teachers.total - s.teachers.active} غير نشط`} />
            <StatCard label="المجموعات النشطة" value={s.groups.active} icon={Users} href="/admin/groups"
              hint={`الأقسام النشطة: ${s.groups.runningClasses} · ${s.groups.total - s.groups.active} متوقفة أو مؤرشفة`} />
            <StatCard label="الفروع" value={s.branches.total} icon={Building2} href="/admin/branches"
              hint={`${s.branches.active} نشطة · ${countLabels.rooms(s.branches.activeRooms)} متاحة`} />
          </section>
        )}
      </QueryState>

      <WithLookupsAndStudents>
        {(lookups, students) => (
          <div className="grid gap-6 lg:grid-cols-3">
            <TodaySessions today={today} lookups={lookups} />
            <AttentionList lookups={lookups} students={students} />
            <GroupsOverview lookups={lookups} students={students} />
            <RecentStudents lookups={lookups} students={students} />
            <TeacherWorkload lookups={lookups} />
            <SectionCard title="طلبات وحصص تنتظر قرارًا" icon={ClipboardList}>
              <ul className="space-y-3 text-sm">
                <li className="flex items-center justify-between gap-2">
                  <span>طلبات تسجيل قيد الانتظار</span>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/admin/registration-requests">{s?.registrationRequests.pending ?? "…"}</Link>
                  </Button>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5">
                    <AlertTriangle className="size-4 text-warning" aria-hidden />
                    حصص قادمة تحتاج إلى قرار
                  </span>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/admin/sessions?tab=upcoming">{s?.sessions.needsAttention ?? "…"}</Link>
                  </Button>
                </li>
              </ul>
            </SectionCard>
          </div>
        )}
      </WithLookupsAndStudents>
    </>
  )
}
