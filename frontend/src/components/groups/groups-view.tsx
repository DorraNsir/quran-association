"use client"

import { DoorOpen, LayoutGrid, List, Plus, SearchX, ShieldCheck, Users } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { ActionsMenu } from "@/components/shared/actions-menu"
import { StatusBadge } from "@/components/shared/badges"
import { DataTable, type Column } from "@/components/shared/data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { ALL, FilterBar, FilterSelect, matchesText, SearchInput } from "@/components/shared/filters"
import { PageHeader } from "@/components/shared/page-header"
import { ScheduleSummary } from "@/components/shared/schedule"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  classesOf,
  countActiveStudentsByClass,
  describeClass,
  fullName,
  indexLookups,
  schedulesOf,
  type ClassView,
  type Lookups,
} from "@/lib/domain"
import { countLabels } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { Group, Student } from "@/types/domain"

import { groupActions, useGroupDialogs } from "./use-group-dialogs"

type ViewMode = "cards" | "table"

export function GroupsView({ lookups, students }: { lookups: Lookups; students: Student[] }) {
  const { groups, groupClasses, schedules } = lookups
  const [query, setQuery] = useState("")
  const [branchId, setBranchId] = useState(ALL)
  const [status, setStatus] = useState(ALL)
  const [view, setView] = useState<ViewMode>("cards")

  const live: Lookups = lookups
  const indexes = indexLookups(live)
  const counts = countActiveStudentsByClass(students)

  const { run, dialogs } = useGroupDialogs({ lookups: live, students })

  /** A group's classes, each resolved to its own place and team. */
  const classViews = (g: Group) => classesOf(g.id, groupClasses).map((c) => describeClass(c, indexes))
  const groupStudents = (g: Group) => classViews(g).reduce((n, v) => n + (counts.get(v.groupClass.id) ?? 0), 0)

  const filtered = groups.filter((g) => {
    const views = classViews(g)
    if (query.trim()) {
      const teacherNames = views.flatMap((v) => [v.supervisor, ...v.assistants]).flatMap((t) => (t ? [fullName(t)] : []))
      if (!matchesText([g.name, g.audience, ...teacherNames].join(" "), query)) return false
    }
    if (branchId !== ALL && !views.some((v) => v.groupClass.branchId === branchId)) return false
    if (status !== ALL && g.status !== status) return false
    return true
  })

  const hasActiveFilters = Boolean(query) || branchId !== ALL || status !== ALL
  const resetFilters = () => {
    setQuery("")
    setBranchId(ALL)
    setStatus(ALL)
  }

  const noResults = (
    <EmptyState
      icon={SearchX}
      title="لا توجد مجموعات مطابقة"
      description="جرّب كلمات بحث أخرى أو امسح عوامل التصفية."
      action={
        hasActiveFilters && (
          <Button variant="outline" size="sm" onClick={resetFilters}>
            {labels.common.resetFilters}
          </Button>
        )
      }
    />
  )

  const columns: Column<Group>[] = [
    {
      id: "name",
      header: "المجموعة",
      cell: (g) => (
        <Link href={`/admin/groups/${g.id}`} className="block hover:opacity-80">
          <p className="font-medium">{g.name}</p>
          <p className="text-xs text-muted-foreground">{g.audience}</p>
        </Link>
      ),
    },
    {
      id: "classes",
      header: `${labels.groupClass.plural} (الفرع — المدرس المشرف)`,
      cell: (g) => (
        <ul className="space-y-0.5 text-sm">
          {classViews(g).map((v) => (
            <li key={v.groupClass.id} className={cn(v.groupClass.status !== "ACTIVE" && "text-muted-foreground line-through")}>
              {v.branch?.name} — {v.supervisor ? fullName(v.supervisor) : "—"}
              <span className="text-xs text-muted-foreground"> · {countLabels.students(counts.get(v.groupClass.id) ?? 0)}</span>
            </li>
          ))}
          {classViews(g).length === 0 && <li className="text-muted-foreground">لا توجد حلقات بعد</li>}
        </ul>
      ),
    },
    { id: "students", header: "الطلبة", cell: (g) => <span className="tabular-nums">{groupStudents(g)}</span> },
    { id: "status", header: "الحالة", cell: (g) => <StatusBadge status={g.status} /> },
    {
      id: "actions",
      header: <span className="sr-only">{labels.common.actions}</span>,
      className: "w-12",
      cell: (g) => <ActionsMenu label={`إجراءات ${g.name}`} actions={groupActions(g, run)} />,
    },
  ]

  return (
    <>
      <PageHeader
        title="المجموعات"
        description="المجموعات البيداغوجية وحلقاتها: لكل حلقة فرعها وقاعتها ومدرسها المشرف وطلبتها ومواعيدها."
        actions={
          <Button onClick={() => run("create")}>
            <Plus />
            إنشاء مجموعة
          </Button>
        }
      />

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onReset={resetFilters}
        resultLabel={countLabels.groups(filtered.length)}
        search={<SearchInput value={query} onChange={setQuery} label="البحث عن مجموعة" placeholder="ابحث باسم المجموعة أو المعلم" />}
      >
        <FilterSelect label="الفرع" allLabel="كل الفروع" value={branchId} onValueChange={setBranchId}
          options={lookups.branches.map((b) => ({ value: b.id, label: b.name }))} />
        <FilterSelect label="الحالة" allLabel="كل الحالات" value={status} onValueChange={setStatus}
          options={(["ACTIVE", "INACTIVE", "ARCHIVED"] as const).map((s) => ({ value: s, label: labels.status[s] }))} />
        <div role="group" aria-label="طريقة العرض" className="col-span-2 hidden items-center rounded-lg border bg-background p-0.5 md:flex">
          {([{ mode: "cards", icon: LayoutGrid, label: "بطاقات" }, { mode: "table", icon: List, label: "جدول" }] as const).map(
            ({ mode, icon: Icon, label }) => (
              <Button key={mode} type="button" size="sm" variant="ghost" aria-pressed={view === mode}
                className={cn(view === mode && "bg-muted text-foreground")} onClick={() => setView(mode)}>
                <Icon />
                {label}
              </Button>
            )
          )}
        </div>
      </FilterBar>

      {view === "table" && (
        <div className="hidden md:block">
          <DataTable key={`${query}|${branchId}|${status}`} caption="قائمة المجموعات" columns={columns} rows={filtered}
            getRowId={(g) => g.id} emptyState={noResults} />
        </div>
      )}

      <div className={cn(view === "table" && "md:hidden")}>
        {filtered.length === 0 ? (
          <Card className="p-0">{noResults}</Card>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((group) => (
              <li key={group.id}>
                <GroupCard
                  group={group}
                  classes={classViews(group)}
                  counts={counts}
                  schedules={schedules}
                  actions={<ActionsMenu label={`إجراءات ${group.name}`} actions={groupActions(group, run)} />}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      {dialogs}
    </>
  )
}

function GroupCard({
  group,
  classes,
  counts,
  schedules,
  actions,
}: {
  group: Group
  classes: ClassView[]
  counts: Map<string, number>
  schedules: Lookups["schedules"]
  actions: React.ReactNode
}) {
  const total = classes.reduce((n, v) => n + (counts.get(v.groupClass.id) ?? 0), 0)
  return (
    <Card className="h-full gap-0 p-0">
      <div className="flex items-start justify-between gap-2 p-4 pb-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/admin/groups/${group.id}`} className="text-base font-semibold hover:text-primary">
              {group.name}
            </Link>
            <StatusBadge status={group.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            {group.audience} · {countLabels.classes(classes.length)} · {countLabels.students(total)}
          </p>
        </div>
        {actions}
      </div>

      <ul className="mt-auto divide-y border-t">
        {classes.length === 0 && <li className="px-4 py-3 text-xs text-muted-foreground">لا توجد حلقات بعد</li>}
        {classes.map((v) => (
          <li key={v.groupClass.id} className={cn("space-y-1.5 px-4 py-3", v.groupClass.status !== "ACTIVE" && "opacity-60")}>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <DoorOpen className="size-3.5 text-muted-foreground" aria-hidden />
                {v.branch?.name} · {v.room?.name}
              </span>
              {v.groupClass.status !== "ACTIVE" && <StatusBadge status={v.groupClass.status} />}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="size-3.5 text-primary" aria-hidden />
                {v.supervisor ? fullName(v.supervisor) : "—"}
                {v.assistants.length > 0 && ` + ${v.assistants.length}`}
              </span>
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" aria-hidden />
                {countLabels.students(counts.get(v.groupClass.id) ?? 0)}
              </span>
            </div>
            <ScheduleSummary schedule={schedulesOf(v.groupClass.id, schedules)} className="text-xs" />
          </li>
        ))}
      </ul>
    </Card>
  )
}
