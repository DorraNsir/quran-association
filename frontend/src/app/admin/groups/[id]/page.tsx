import {
  BookOpen,
  BookOpenCheck,
  CalendarClock,
  ClipboardCheck,
  Clock,
  DoorOpen,
  FolderOpen,
  LayoutGrid,
  MapPin,
  Phone,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { GroupAttendance } from "@/components/attendance/group-attendance"
import { GroupProfileActions, GroupStudentsTable } from "@/components/groups/group-details-client"
import { StatusBadge, TeacherRoleBadge } from "@/components/shared/badges"
import { ComingSoon } from "@/components/shared/empty-state"
import { PhoneLink, SectionCard } from "@/components/shared/info-list"
import { Breadcrumbs } from "@/components/shared/page-header"
import { MetaItem, ProfileHeader } from "@/components/shared/profile"
import { ProfileTabs } from "@/components/shared/profile-tabs"
import { ScheduleSummary, WeeklyScheduleGrid } from "@/components/shared/schedule"
import { StatCard } from "@/components/shared/stat-card"
import { PersonCell } from "@/components/shared/user-avatar"
import { Button } from "@/components/ui/button"
import {
  fullName,
  groupTeachers,
  indexLookups,
  roomName,
  schedulesOf,
  sessionPlace,
  studentsInGroup,
  weeklyMinutes,
} from "@/lib/domain"
import { formatDate, formatDuration } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { groups, lookups, MOCK_TODAY, schedules, students } from "@/lib/mock"
import { cn } from "@/lib/utils"
import type { Teacher, TeachingRole, WeeklySchedule } from "@/types/domain"

export function generateStaticParams() {
  return groups.map((g) => ({ id: g.id }))
}

export async function generateMetadata(props: PageProps<"/admin/groups/[id]">): Promise<Metadata> {
  const { id } = await props.params
  return { title: groups.find((g) => g.id === id)?.name ?? "المجموعة" }
}

function TeacherCard({ teacher, role }: { teacher: Teacher; role: TeachingRole }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-4",
        role === "SUPERVISOR" && "border-primary/40 bg-brand-soft/30"
      )}
    >
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

export default async function GroupDetailsPage(props: PageProps<"/admin/groups/[id]">) {
  const { id } = await props.params
  const group = groups.find((g) => g.id === id)
  if (!group) notFound()

  const { branchesById, roomsById, teachersById } = indexLookups(lookups)
  const branch = branchesById.get(group.branchId)
  const room = roomName(roomsById, group.roomId)
  const sessions = schedulesOf(group.id, schedules)
  /** Each session's room — shown even when it's the usual one, since this is the group's own page */
  const placeOf = (s: WeeklySchedule) =>
    sessionPlace(s, group, branchesById, roomsById) ?? roomName(roomsById, s.roomId)
  const { supervisor, assistants } = groupTeachers(group, teachersById)
  const members = studentsInGroup(group.id, students)
  const activeMembers = members.filter((s) => s.status === "ACTIVE")
  const minutes = weeklyMinutes(sessions)
  const recentMembers = [...members]
    .sort((a, b) => b.registrationDate.localeCompare(a.registrationDate))
    .slice(0, 5)

  const team = (
    <div className="grid gap-3 sm:grid-cols-2">
      {supervisor && <TeacherCard teacher={supervisor} role="SUPERVISOR" />}
      {assistants.map((t) => (
        <TeacherCard key={t.id} teacher={t} role="ASSISTANT" />
      ))}
      {assistants.length === 0 && (
        <div className="flex items-center justify-center rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          لا يوجد معلم مساعد لهذه المجموعة.
        </div>
      )}
    </div>
  )

  const weekly = (
    <WeeklyScheduleGrid
      entries={sessions.map((slot) => ({
        slot,
        title: group.name,
        subtitle: placeOf(slot),
        emphasis: true,
      }))}
    />
  )

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
            <MetaItem icon={MapPin}>{branch?.name}</MetaItem>
            <MetaItem icon={DoorOpen}>{room}</MetaItem>
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
                  <StatCard label="الطلبة النشطون" value={activeMembers.length} icon={Users}
                    hint={members.length > activeMembers.length ? `من أصل ${members.length}` : undefined} />
                  <StatCard label="فريق التدريس" value={1 + assistants.length} icon={UsersRound}
                    hint={`مشرف و${assistants.length} مساعد`} />
                  <StatCard label="الحصص أسبوعيًا" value={sessions.length} icon={CalendarClock} />
                  <StatCard label="الساعات أسبوعيًا" value={formatDuration(minutes)} icon={Clock} />
                </div>
                <div className="grid gap-6 lg:grid-cols-3">
                  <SectionCard title="فريق التدريس" icon={UsersRound} className="lg:col-span-2">
                    {team}
                  </SectionCard>
                  <SectionCard title="المواعيد" icon={CalendarClock}>
                    <ScheduleSummary schedule={sessions} detail={placeOf} />
                    <p className="mt-4 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="size-4" aria-hidden />
                      المكان المعتاد: {branch?.name} · {room}
                    </p>
                  </SectionCard>
                </div>
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
                      {recentMembers.map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                          <Link href={`/admin/students/${s.id}`} className="min-w-0 hover:opacity-80">
                            <PersonCell name={fullName(s)} photoUrl={s.photoUrl} size="sm" />
                          </Link>
                          <span className="text-xs whitespace-nowrap text-muted-foreground">
                            {formatDate(s.registrationDate)}
                          </span>
                        </li>
                      ))}
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
            content: <GroupStudentsTable students={members} />,
          },
          {
            value: "teachers",
            label: "المعلمون",
            icon: <UsersRound aria-hidden />,
            content: team,
          },
          {
            value: "schedule",
            label: "المواعيد",
            icon: <CalendarClock aria-hidden />,
            content: (
              <SectionCard
                title="البرنامج الأسبوعي"
                icon={CalendarClock}
                action={
                  <Button asChild variant="ghost" size="sm" className="text-primary">
                    <Link href={`/admin/calendar?group=${group.id}`}>عرض في الرزنامة</Link>
                  </Button>
                }
              >
                {weekly}
              </SectionCard>
            ),
          },
          {
            value: "attendance",
            label: "الحضور",
            icon: <ClipboardCheck aria-hidden />,
            content: (
              <GroupAttendance groupId={group.id} lookups={lookups} students={students} today={MOCK_TODAY} />
            ),
          },
          {
            value: "progress",
            label: "متابعة الحفظ",
            icon: <BookOpenCheck aria-hidden />,
            later: true,
            content: (
              <ComingSoon icon={BookOpenCheck} title="تقدم المجموعة في الحفظ"
                description="متابعة ما حفظه كل طالب ومقارنة تقدم أعضاء المجموعة." />
            ),
          },
          {
            value: "resources",
            label: "الموارد",
            icon: <FolderOpen aria-hidden />,
            later: true,
            content: (
              <ComingSoon icon={FolderOpen} title="موارد المجموعة"
                description={`ملفات وتسجيلات صوتية يشاركها ${labels.teachingRole.SUPERVISOR} مع طلبة المجموعة.`} />
            ),
          },
        ]}
      />
    </>
  )
}
