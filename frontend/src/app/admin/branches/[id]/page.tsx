import { BookOpen, Building2, CalendarClock, Clock, DoorOpen, MapPin, Phone, Users } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { BranchProfileActions } from "@/components/branches/branch-profile-actions"
import { BranchRooms } from "@/components/branches/branch-rooms"
import { StatusBadge } from "@/components/shared/badges"
import { EmptyState } from "@/components/shared/empty-state"
import { PhoneLink, SectionCard } from "@/components/shared/info-list"
import { Breadcrumbs } from "@/components/shared/page-header"
import { MetaItem, ProfileHeader } from "@/components/shared/profile"
import { ScheduleSummary, WeeklyScheduleGrid } from "@/components/shared/schedule"
import { StatCard } from "@/components/shared/stat-card"
import {
  activeSessionsIn,
  branchStats,
  fullName,
  indexLookups,
  roomName,
} from "@/lib/domain"
import { formatDuration } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { branches, lookups } from "@/lib/mock"

export function generateStaticParams() {
  return branches.map((b) => ({ id: b.id }))
}

export async function generateMetadata(props: PageProps<"/admin/branches/[id]">): Promise<Metadata> {
  const { id } = await props.params
  return { title: branches.find((b) => b.id === id)?.name ?? "الفرع" }
}

export default async function BranchDetailsPage(props: PageProps<"/admin/branches/[id]">) {
  const { id } = await props.params
  const branch = branches.find((b) => b.id === id)
  if (!branch) notFound()

  const { roomsById, groupsById, teachersById } = indexLookups(lookups)
  const stats = branchStats(branch.id, lookups)
  const sessions = activeSessionsIn({ branchId: branch.id }, lookups)
  // Groups meeting here: by usual location, or with at least one session here
  const groupIds = new Set([
    ...lookups.groups.filter((g) => g.branchId === branch.id && g.status !== "ARCHIVED").map((g) => g.id),
    ...sessions.map((s) => s.groupId),
  ])
  const branchGroups = [...groupIds].flatMap((gid) => {
    const g = groupsById.get(gid)
    return g ? [g] : []
  })

  return (
    <>
      <Breadcrumbs className="mb-4" items={[{ label: "الفروع", href: "/admin/branches" }, { label: branch.name }]} />
      <ProfileHeader
        name={branch.name}
        avatar={
          <span className="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand-soft-foreground">
            <Building2 className="size-8" aria-hidden />
          </span>
        }
        badges={<StatusBadge status={branch.status} />}
        meta={
          <>
            <MetaItem icon={MapPin}>{branch.address}</MetaItem>
            {branch.phone && (
              <MetaItem icon={Phone}>
                <PhoneLink phone={branch.phone} />
              </MetaItem>
            )}
          </>
        }
        actions={<BranchProfileActions branch={branch} lookups={lookups} />}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="القاعات النشطة" value={`${stats.activeRooms}/${stats.rooms}`} icon={DoorOpen} />
        <StatCard label="المجموعات النشطة" value={stats.activeGroups} icon={Users} />
        <StatCard label="الحصص أسبوعيًا" value={stats.weeklySessions} icon={CalendarClock} />
        <StatCard label="ساعات الاستعمال" value={formatDuration(stats.weeklyMinutes)} icon={Clock} hint="أسبوعيًا، كل القاعات" />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <BranchRooms branch={branch} lookups={lookups} />
        </div>
        <SectionCard title="المجموعات في هذا الفرع" icon={BookOpen} className="h-fit lg:col-span-2">
          {branchGroups.length === 0 ? (
            <EmptyState icon={Users} title="لا توجد مجموعات" className="py-6" />
          ) : (
            <ul className="divide-y">
              {branchGroups.map((group) => {
                const supervisor = teachersById.get(group.supervisorId)
                const here = sessions.filter((s) => s.groupId === group.id)
                return (
                  <li key={group.id} className="space-y-1.5 py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/admin/groups/${group.id}`} className="font-medium hover:text-primary">
                        {group.name}
                      </Link>
                      {group.status !== "ACTIVE" && <StatusBadge status={group.status} />}
                    </div>
                    {supervisor && (
                      <p className="text-xs text-muted-foreground">
                        {labels.teachingRole.SUPERVISOR}: {fullName(supervisor)}
                      </p>
                    )}
                    <ScheduleSummary schedule={here} detail={(s) => roomName(roomsById, s.roomId)} />
                  </li>
                )
              })}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard title="استعمال القاعات خلال الأسبوع" icon={CalendarClock} className="mt-6">
        <WeeklyScheduleGrid
          entries={sessions.map((slot) => ({
            slot,
            title: groupsById.get(slot.groupId)?.name ?? "—",
            subtitle: roomName(roomsById, slot.roomId),
            href: `/admin/groups/${slot.groupId}`,
            emphasis: true,
          }))}
          emptyLabel="لا توجد حصص مبرمجة في هذا الفرع"
        />
      </SectionCard>
    </>
  )
}
