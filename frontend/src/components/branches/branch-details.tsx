"use client"

import { BookOpen, Building2, CalendarClock, Clock, DoorOpen, MapPin, Phone, Users } from "lucide-react"
import Link from "next/link"

import { BranchProfileActions } from "@/components/branches/branch-profile-actions"
import { BranchRooms } from "@/components/branches/branch-rooms"
import { StatusBadge } from "@/components/shared/badges"
import { EmptyState } from "@/components/shared/empty-state"
import { PhoneLink, SectionCard } from "@/components/shared/info-list"
import { Breadcrumbs } from "@/components/shared/page-header"
import { MetaItem, ProfileHeader } from "@/components/shared/profile"
import { ScheduleSummary, WeeklyScheduleGrid } from "@/components/shared/schedule"
import { StatCard } from "@/components/shared/stat-card"
import { activeSchedulesIn, branchStats, describeClass, fullName, indexLookups, roomsLabel, schedulesOf } from "@/lib/domain"
import { formatDuration } from "@/lib/format"

import { NotFoundState } from "@/components/shared/not-found-state"
import { WithLookups } from "@/components/shared/with-lookups"
import type { Lookups } from "@/lib/domain"

export function BranchDetails({ id }: { id: string }) {
  return <WithLookups>{(lookups) => <BranchDetailsBody id={id} lookups={lookups} />}</WithLookups>
}

function BranchDetailsBody({ id, lookups }: { id: string; lookups: Lookups }) {
  const branch = lookups.branches.find((b) => b.id === id)
  if (!branch) return <NotFoundState title="الفرع غير موجود" backHref="/admin/branches" backLabel="العودة إلى الفروع" />

  const indexes = indexLookups(lookups)
  const stats = branchStats(branch.id, lookups)
  const slots = activeSchedulesIn({ branchId: branch.id }, lookups)
  // The classes located in this branch (a group may have other classes elsewhere)
  const branchClasses = lookups.groupClasses
    .filter((c) => c.branchId === branch.id && c.status !== "ARCHIVED")
    .map((c) => describeClass(c, indexes))

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
        <StatCard label="الأقسام النشطة" value={stats.activeClasses} icon={Users} />
        <StatCard label="الحصص أسبوعيًا" value={stats.weeklySessions} icon={CalendarClock} />
        <StatCard label="ساعات الاستعمال" value={formatDuration(stats.weeklyMinutes)} icon={Clock} hint="أسبوعيًا، كل القاعات" />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <BranchRooms branch={branch} lookups={lookups} />
        </div>
        <SectionCard title="الأقسام في هذا الفرع" icon={BookOpen} className="h-fit lg:col-span-2">
          {branchClasses.length === 0 ? (
            <EmptyState icon={Users} title="لا توجد أقسام" className="py-6" />
          ) : (
            <ul className="divide-y">
              {branchClasses.map((v) => (
                <li key={v.groupClass.id} className="space-y-1.5 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/admin/groups/${v.groupClass.groupId}`} className="font-medium hover:text-primary">
                      {v.group?.name}
                    </Link>
                    {v.groupClass.status !== "ACTIVE" && <StatusBadge status={v.groupClass.status} />}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    المدرس المشرف: {v.supervisor ? fullName(v.supervisor) : "—"} · {roomsLabel(v.rooms)}
                  </p>
                  <ScheduleSummary schedule={schedulesOf(v.groupClass.id, lookups.schedules)} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard title="استعمال القاعات خلال الأسبوع" icon={CalendarClock} className="mt-6">
        <WeeklyScheduleGrid
          entries={slots.flatMap((slot) => {
            const groupClass = indexes.classesById.get(slot.groupClassId)
            if (!groupClass) return []
            const v = describeClass(groupClass, indexes)
            return [{
              slot,
              title: v.group?.name ?? "—",
              subtitle: `${roomsLabel(v.rooms)} · ${v.supervisor ? fullName(v.supervisor) : ""}`,
              href: `/admin/groups/${groupClass.groupId}`,
              emphasis: true,
            }]
          })}
          emptyLabel="لا توجد حصص مبرمجة في هذا الفرع"
        />
      </SectionCard>
    </>
  )
}
