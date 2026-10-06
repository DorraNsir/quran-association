import {
  Award,
  BookOpen,
  CalendarClock,
  CalendarDays,
  Contact,
  Mail,
  MapPin,
  Phone,
  UserRound,
  Users,
} from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { StatusBadge, TeacherRoleBadge } from "@/components/shared/badges"
import { EmptyState } from "@/components/shared/empty-state"
import { InfoList, PhoneLink, SectionCard } from "@/components/shared/info-list"
import { Breadcrumbs } from "@/components/shared/page-header"
import { MetaItem, ProfileHeader } from "@/components/shared/profile"
import { ScheduleSummary, WeeklyScheduleGrid } from "@/components/shared/schedule"
import { TeacherProfileActions } from "@/components/teachers/teacher-profile-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  countActiveStudentsByClass,
  fullName,
  schedulesOf,
  teacherAssignments,
  teacherWeeklySlots,
  weeklyMinutes,
} from "@/lib/domain"
import { countLabels, formatDate, formatDuration } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { lookups, schedules, students, teachers, users } from "@/lib/mock"
import { cn } from "@/lib/utils"

export function generateStaticParams() {
  return teachers.map((t) => ({ id: t.id }))
}

export async function generateMetadata(props: PageProps<"/admin/teachers/[id]">): Promise<Metadata> {
  const { id } = await props.params
  const teacher = teachers.find((t) => t.id === id)
  return { title: teacher ? fullName(teacher) : "ملف المعلم" }
}

export default async function TeacherProfilePage(props: PageProps<"/admin/teachers/[id]">) {
  const { id } = await props.params
  const teacher = teachers.find((t) => t.id === id)
  if (!teacher) notFound()

  const name = fullName(teacher)
  const studentCounts = countActiveStudentsByClass(students)
  // Assignments are per class: the same group can appear twice with different branches
  const assignments = teacherAssignments(teacher.id, lookups)
  const supervising = assignments.filter((a) => a.role === "SUPERVISOR").length
  const assisting = assignments.length - supervising
  const weeklySlots = teacherWeeklySlots(teacher.id, lookups)
  const minutes = weeklyMinutes(weeklySlots.map((e) => e.slot))
  const isAdmin = users.some((u) => u.teacherId === teacher.id && u.roles.includes("ADMIN"))

  return (
    <>
      <Breadcrumbs
        className="mb-4"
        items={[{ label: "المعلمون", href: "/admin/teachers" }, { label: name }]}
      />
      <ProfileHeader
        name={name}
        photoUrl={teacher.photoUrl}
        badges={
          <>
            <StatusBadge status={teacher.status} />
            {isAdmin && <Badge variant="secondary">{labels.role.ADMIN}</Badge>}
          </>
        }
        meta={
          <>
            {teacher.qualification && <MetaItem icon={Award}>{teacher.qualification}</MetaItem>}
            <MetaItem icon={Phone}>
              <PhoneLink phone={teacher.phone} />
            </MetaItem>
            <MetaItem icon={CalendarDays}>منذ {formatDate(teacher.joinedAt)}</MetaItem>
          </>
        }
        actions={<TeacherProfileActions teacher={teacher} lookups={lookups} />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SectionCard title="المجموعات المسندة" icon={BookOpen}>
            {assignments.length === 0 ? (
              <EmptyState
                icon={Users}
                title="لا توجد مجموعات مسندة"
                description="يمكن تعيين المعلم مشرفًا أو مساعدًا من صفحة المجموعة."
                className="py-6"
              />
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {assignments.map(({ groupClass, group, branch, room, role }) => (
                  <li key={groupClass.id}>
                    <Link
                      href={`/admin/groups/${groupClass.groupId}`}
                      className={cn(
                        "flex h-full flex-col gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50",
                        role === "SUPERVISOR" && "border-primary/40 bg-brand-soft/30"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">{group?.name}</p>
                          <p className="text-xs text-muted-foreground">{group?.audience}</p>
                        </div>
                        <TeacherRoleBadge role={role} />
                      </div>
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="size-3.5" aria-hidden />
                        {branch?.name} · {room?.name}
                        {groupClass.status !== "ACTIVE" && ` · ${labels.status[groupClass.status]}`}
                      </p>
                      <div className="flex items-end justify-between gap-2 border-t pt-3">
                        <ScheduleSummary schedule={schedulesOf(groupClass.id, schedules)} />
                        <span className="text-xs whitespace-nowrap text-muted-foreground">
                          {countLabels.students(studentCounts.get(groupClass.id) ?? 0)}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

        </div>

        <div className="space-y-6">
          <SectionCard title="العبء التدريسي" icon={Users}>
            <dl className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: "مشرف على", value: supervising },
                { label: "مساعد في", value: assisting },
                { label: "ساعات أسبوعيًا", value: minutes ? formatDuration(minutes) : "0" },
              ].map((item) => (
                <div key={item.label} className="flex flex-col-reverse rounded-lg bg-muted/60 p-3">
                  <dt className="text-xs text-muted-foreground">{item.label}</dt>
                  <dd className="text-lg font-semibold tabular-nums">{item.value}</dd>
                </div>
              ))}
            </dl>
          </SectionCard>

          <SectionCard title="المعلومات الشخصية" icon={UserRound}>
            <InfoList
              className="sm:grid-cols-1"
              items={[
                { label: "الاسم واللقب", value: name },
                { label: "الجنس", value: labels.gender[teacher.gender] },
                { label: "المؤهل", value: teacher.qualification },
                { label: "تاريخ الالتحاق", value: formatDate(teacher.joinedAt) },
              ]}
            />
          </SectionCard>

          <SectionCard title="التواصل" icon={Contact}>
            <InfoList
              className="sm:grid-cols-1"
              items={[
                { label: "الهاتف", value: <PhoneLink phone={teacher.phone} />, icon: Phone },
                {
                  label: "البريد الإلكتروني",
                  value: teacher.email && (
                    <a href={`mailto:${teacher.email}`} dir="ltr" className="hover:text-primary hover:underline">
                      {teacher.email}
                    </a>
                  ),
                  icon: Mail,
                },
              ]}
            />
          </SectionCard>
        </div>
      </div>

      <SectionCard
        title="البرنامج الأسبوعي"
        icon={CalendarClock}
        className="mt-6"
        action={
          <Button asChild variant="ghost" size="sm" className="text-primary">
            <Link href={`/admin/calendar?teacher=${teacher.id}`}>عرض في الرزنامة</Link>
          </Button>
        }
      >
        <WeeklyScheduleGrid
          entries={weeklySlots.map(({ slot, group, branch, room, groupClass, role }) => ({
            slot,
            title: group?.name ?? "—",
            subtitle: `${labels.teachingRole[role]} · ${branch?.name ?? ""} · ${room?.name ?? ""}`,
            href: `/admin/groups/${groupClass.groupId}`,
            emphasis: role === "SUPERVISOR",
          }))}
        />
      </SectionCard>
    </>
  )
}
