"use client"

import { Building2, CalendarClock, DoorOpen, MapPin, Phone, Plus, SearchX, Users } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { ActionsMenu } from "@/components/shared/actions-menu"
import { StatusBadge } from "@/components/shared/badges"
import { EmptyState } from "@/components/shared/empty-state"
import {
  ALL,
  FilterBar,
  FilterSelect,
  matchesText,
  SearchInput,
} from "@/components/shared/filters"
import { PhoneLink } from "@/components/shared/info-list"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { branchStats, roomsOfBranch, type Lookups } from "@/lib/domain"
import { formatDuration } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { Branch } from "@/types/domain"

import { branchActions, useBranchDialogs } from "./use-branch-dialogs"

export function BranchesView({ lookups }: { lookups: Lookups }) {
  const [branches, setBranches] = useState(lookups.branches)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState(ALL)

  const liveLookups = { ...lookups, branches }
  const { run, dialogs } = useBranchDialogs({
    lookups: liveLookups,
    onChange: (saved, isNew) =>
      setBranches((prev) => (isNew ? [...prev, saved] : prev.map((b) => (b.id === saved.id ? saved : b)))),
  })

  const filtered = branches.filter((b) => {
    if (query.trim() && !matchesText(`${b.name} ${b.address}`, query)) return false
    if (status !== ALL && b.status !== status) return false
    return true
  })
  const hasActiveFilters = Boolean(query) || status !== ALL
  const resetFilters = () => {
    setQuery("")
    setStatus(ALL)
  }

  return (
    <>
      <PageHeader
        title="الفروع"
        description="المقرات التي تنشط فيها الجمعية وقاعاتها، وهي أساس برمجة حصص المجموعات."
        actions={
          <Button onClick={() => run("create")}>
            <Plus />
            إضافة فرع
          </Button>
        }
      />

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onReset={resetFilters}
        resultLabel={`${filtered.length} من ${branches.length} فروع`}
        search={
          <SearchInput value={query} onChange={setQuery} label="البحث عن فرع" placeholder="ابحث بالاسم أو العنوان" />
        }
      >
        <FilterSelect
          label="الحالة"
          allLabel="كل الحالات"
          value={status}
          onValueChange={setStatus}
          options={(["ACTIVE", "INACTIVE"] as const).map((s) => ({ value: s, label: labels.status[s] }))}
        />
      </FilterBar>

      {filtered.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={SearchX}
            title="لا توجد فروع مطابقة"
            description="جرّب كلمات بحث أخرى أو امسح عوامل التصفية."
            action={
              <Button variant="outline" size="sm" onClick={resetFilters}>
                {labels.common.resetFilters}
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {filtered.map((branch) => (
            <li key={branch.id}>
              <BranchCard
                branch={branch}
                lookups={liveLookups}
                actions={<ActionsMenu label={`إجراءات ${branch.name}`} actions={branchActions(branch, run)} />}
              />
            </li>
          ))}
        </ul>
      )}
      {dialogs}
    </>
  )
}

function BranchCard({
  branch,
  lookups,
  actions,
}: {
  branch: Branch
  lookups: Lookups
  actions: React.ReactNode
}) {
  const stats = branchStats(branch.id, lookups)
  const rooms = roomsOfBranch(branch.id, lookups.rooms)

  return (
    <Card className={cn("h-full gap-0 p-0", branch.status === "INACTIVE" && "bg-muted/30")}>
      <div className="flex items-start gap-3 p-4 pb-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-foreground">
          <Building2 className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/admin/branches/${branch.id}`} className="font-semibold hover:text-primary">
              {branch.name}
            </Link>
            <StatusBadge status={branch.status} />
          </div>
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <MapPin className="mt-px size-3.5 shrink-0" aria-hidden />
            {branch.address}
          </p>
          {branch.phone && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Phone className="size-3.5 shrink-0" aria-hidden />
              <PhoneLink phone={branch.phone} />
            </p>
          )}
        </div>
        {actions}
      </div>

      <dl className="grid grid-cols-3 border-y text-center">
        {[
          { icon: DoorOpen, label: "قاعات نشطة", value: `${stats.activeRooms}/${stats.rooms}` },
          { icon: Users, label: "مجموعات نشطة", value: stats.activeGroups },
          { icon: CalendarClock, label: "ساعات أسبوعيًا", value: stats.weeklyMinutes ? formatDuration(stats.weeklyMinutes) : "0" },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex flex-col-reverse gap-0.5 border-s px-2 py-3 first:border-s-0">
            <dt className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <Icon className="size-3.5" aria-hidden />
              {label}
            </dt>
            <dd className="font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-auto flex flex-wrap items-center gap-1.5 px-4 py-3">
        {rooms.length === 0 ? (
          <span className="text-xs text-muted-foreground">لا توجد قاعات بعد</span>
        ) : (
          rooms.map((room) => (
            <span
              key={room.id}
              className={cn(
                "rounded-md border px-2 py-0.5 text-xs",
                room.status === "INACTIVE" && "border-dashed text-muted-foreground line-through"
              )}
              title={room.status === "INACTIVE" ? `${room.name} — ${labels.status.INACTIVE}` : room.name}
            >
              {room.name}
            </span>
          ))
        )}
      </div>
    </Card>
  )
}
