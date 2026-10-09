"use client"

import {
  BookOpen,
  BookOpenCheck,
  CalendarClock,
  ClipboardCheck,
  DoorOpen,
  FolderOpen,
  LayoutGrid,
  Phone,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react"
import Link from "next/link"

import { GroupAttendance } from "@/components/attendance/group-attendance"
import { GroupMemorization } from "@/components/memorization/group-memorization"
import { GroupFees } from "@/components/payments/payments-views"
import { GroupClassList, GroupProfileActions, GroupStudentsTable } from "@/components/groups/group-details-client"
import { StatusBadge, TeacherRoleBadge } from "@/components/shared/badges"
import { ComingSoon } from "@/components/shared/empty-state"
import { PhoneLink, SectionCard } from "@/components/shared/info-list"
import { Breadcrumbs } from "@/components/shared/page-header"
import { MetaItem, ProfileHeader } from "@/components/shared/profile"
import { ProfileTabs } from "@/components/shared/profile-tabs"
import { WeeklyScheduleGrid } from "@/components/shared/schedule"
import { StatCard } from "@/components/shared/stat-card"
import { PersonCell } from "@/components/shared/user-avatar"
import { Button } from "@/components/ui/button"
import { classesOf, classTeacherIds, describeClass, fullName, indexLookups, roomsLabel, schedulesOf, studentClass, studentsInGroup } from "@/lib/domain"
import { countLabels, formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Student, Teacher, TeachingRole } from "@/types/domain"

import { NotFoundState } from "@/components/shared/not-found-state"
import { WithLookupsAndStudents } from "@/components/shared/with-admin-data"
import { todayInTunis } from "@/lib/dates"
import type { Lookups } from "@/lib/domain"

function TeacherCard({ teacher, role }: { teacher: Teacher; role: TeachingRole }) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-lg border p-4", role === "SUPERVISOR" && "border-primary/40 bg-brand-soft/30")}>
      <div className="flex items-start justify-between gap-2">
        <Link href={`/admin/teachers/${teacher.id}`} className="min-w-0 hover:opacity-80">
          <PersonCell name={fullName(teacher)} photoUrl={teacher.photoUrl} secondary={teacher.qualification} />
        </Link>
        <TeacherRoleBadge role={role} />
      </div>
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Phone className="size-3.5" aria-hidden />
        <PhoneLink phone={teacher.phone} />
      </p>
    </div>
  )
}

export function GroupDetails({ id }: { id: string }) {
  return (
    <WithLookupsAndStudents>
      {(lookups, students) => <GroupDetailsBody id={id} lookups={lookups} students={students} />}
    </WithLookupsAndStudents>
  )
}

function GroupDetailsBody({ id, lookups, students }: { id: string; lookups: Lookups; students: Student[] }) {
  const today = todayInTunis()
  const { schedules } = lookups
  const group = lookups.groups.find((g) => g.id === id)
  if (!group) return <NotFoundState title="المجموعة غير موجودة" backHref="/admin/groups" backLabel="العودة إلى المجموعات" />

  const indexes = indexLookups(lookups)
  const classes = classesOf(group.id, lookups.groupClasses).map((c) => describeClass(c, indexes))
  const running = classes.filter((v) => v.groupClass.status === "ACTIVE")
  const members = studentsInGroup(group.id, students, lookups.groupClasses)
  const activeMembers = members.filter((s) => s.status === "ACTIVE")
  const teacherCount = new Set(running.flatMap((v) => classTeacherIds(v.groupClass))).size
  const weeklySlots = running.flatMap((v) => schedulesOf(v.groupClass.id, schedules).map((slot) => ({ slot, view: v })))
  const recentMembers = [...members].sort((a, b) => b.registrationDate.localeCompare(a.registrationDate)).slice(0, 5)
  /** Tells two classes of the same group apart */
  const classTag = (v: (typeof classes)[number]) => `${v.branch?.name ?? ""} — ${v.supervisor ? fullName(v.supervisor) : "—"}`

  return (
    <>
      <Breadcrumbs className="mb-4" items={[{ label: "المجموعات", href: "/admin/groups" }, { label: group.name }]} />
      <ProfileHeader
        name={group.name}
        avatar={
          <span className="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand-soft-foreground">
            <BookOpen className="size-8" aria-hidden />
          </span>
        }
        badges={<StatusBadge status={group.status} />}
        meta={
          <>
            <MetaItem icon={Users}>{group.audience}</MetaItem>
            <MetaItem icon={DoorOpen}>{countLabels.classes(classes.length)}</MetaItem>
            <MetaItem icon={UsersRound}>{countLabels.students(activeMembers.length)} نشطين</MetaItem>
          </>
        }
        actions={<GroupProfileActions group={group} lookups={lookups} students={students} />}
      />

      <ProfileTabs
        tabs={[
          {
            value: "overview",
            label: "نظرة عامة",
            icon: <LayoutGrid aria-hidden />,
            content: (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <StatCard label="الأقسام" value={classes.length} icon={DoorOpen}
                    hint={running.length < classes.length ? `${running.length} نشطة` : undefined} />
                  <StatCard label="الطلبة النشطون" value={activeMembers.length} icon={Users}
                    hint={classes.length > 1 ? "في كل الأقسام" : undefined} />
                  <StatCard label="المعلمون" value={teacherCount} icon={UsersRound} />
                  <StatCard label="الحصص أسبوعيًا" value={weeklySlots.length} icon={CalendarClock} />
                </div>

                <GroupFees group={group} today={today} />

                <section aria-labelledby="classes-heading" className="space-y-3">
                  <h2 id="classes-heading" className="flex items-center gap-2 text-sm font-semibold">
                    <DoorOpen className="size-4 text-primary" aria-hidden />
                    أقسام المجموعة
                  </h2>
                  <GroupClassList group={group} lookups={lookups} students={students} />
                </section>

                <SectionCard
                  title="آخر المنضمين"
                  icon={UserPlus}
                  action={
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/admin/students?group=${group.id}`}>كل الطلبة</Link>
                    </Button>
                  }
                >
                  {recentMembers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">لا يوجد طلبة بعد.</p>
                  ) : (
                    <ul className="divide-y">
                      {recentMembers.map((s) => {
                        const v = studentClass(s, indexes)
                        return (
                          <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                            <Link href={`/admin/students/${s.id}`} className="min-w-0 hover:opacity-80">
                              <PersonCell name={fullName(s)} photoUrl={s.photoUrl} size="sm"
                                secondary={v ? classTag(v) : undefined} />
                            </Link>
                            <span className="text-xs whitespace-nowrap text-muted-foreground">{formatDate(s.registrationDate)}</span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </SectionCard>
              </div>
            ),
          },
          {
            value: "students",
            label: `الطلبة (${members.length})`,
            icon: <Users aria-hidden />,
            content: <GroupStudentsTable students={students} lookups={lookups} groupId={group.id} />,
          },
          {
            value: "teachers",
            label: "المعلمون",
            icon: <UsersRound aria-hidden />,
            content: (
              <div className="space-y-6">
                {classes.map((v) => (
                  <SectionCard key={v.groupClass.id} title={`قسم ${v.branch?.name ?? ""} · ${roomsLabel(v.rooms)}`} icon={DoorOpen}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {v.supervisor && <TeacherCard teacher={v.supervisor} role="SUPERVISOR" />}
                      {v.assistants.map((t) => (
                        <TeacherCard key={t.id} teacher={t} role="ASSISTANT" />
                      ))}
                      {v.assistants.length === 0 && (
                        <div className="flex items-center justify-center rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                          لا يوجد معلم مساعد في هذا القسم.
                        </div>
                      )}
                    </div>
                  </SectionCard>
                ))}
              </div>
            ),
          },
          {
            value: "schedule",
            label: "المواعيد",
            icon: <CalendarClock aria-hidden />,
            content: (
              <SectionCard
                title="البرنامج الأسبوعي لكل الأقسام"
                icon={CalendarClock}
                action={
                  <Button asChild variant="ghost" size="sm" className="text-primary">
                    <Link href={`/admin/calendar?group=${group.id}`}>عرض في الرزنامة</Link>
                  </Button>
                }
              >
                <WeeklyScheduleGrid
                  entries={weeklySlots.map(({ slot, view }) => ({
                    slot,
                    title: view.branch?.name ?? group.name,
                    subtitle: `${roomsLabel(view.rooms)} · ${view.supervisor ? fullName(view.supervisor) : ""}`,
                    emphasis: true,
                  }))}
                />
              </SectionCard>
            ),
          },
          {
            value: "attendance",
            label: "الحضور",
            icon: <ClipboardCheck aria-hidden />,
            content: <GroupAttendance groupId={group.id} lookups={lookups} students={students} today={today} />,
          },
          {
            value: "memorization",
            label: "متابعة الحفظ",
            icon: <BookOpenCheck aria-hidden />,
            content: (
              <GroupMemorization groupId={group.id} lookups={lookups} students={students} today={today} />
            ),
          },
          {
            value: "resources",
            label: "الموارد",
            icon: <FolderOpen aria-hidden />,
            later: true,
            content: <ComingSoon icon={FolderOpen} title="موارد المجموعة" description="ملفات وتسجيلات صوتية يشاركها المدرسون مع طلبة الأقسام." />,
          },
        ]}
      />
    </>
  )
}
