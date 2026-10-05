"use client"

import { LayoutGrid, List, MapPin, Plus, SearchX, Users } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { ActionsMenu } from "@/components/shared/actions-menu"
import { StatusBadge, TeacherRoleBadge } from "@/components/shared/badges"
import { DataTable, type Column } from "@/components/shared/data-table"
import { EmptyState } from "@/components/shared/empty-state"
import {
  ALL,
  FilterBar,
  FilterSelect,
  matchesText,
  SearchInput,
} from "@/components/shared/filters"
import { PageHeader } from "@/components/shared/page-header"
import { ScheduleSummary } from "@/components/shared/schedule"
import { PersonCell } from "@/components/shared/user-avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  countActiveStudentsByGroup,
  fullName,
  locationLabel,
  schedulesOf,
  sessionPlace,
  groupTeachers,
  indexLookups,
  type Lookups,
} from "@/lib/domain"
import { countLabels } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { Group, Student, WeeklySchedule } from "@/types/domain"

import { groupActions, useGroupDialogs } from "./use-group-dialogs"

type ViewMode = "cards" | "table"

export function GroupsView({
  lookups,
  initialStudents,
}: {
  lookups: Lookups
  initialStudents: Student[]
}) {
  const [groups, setGroups] = useState(lookups.groups)
  const [students, setStudents] = useState(initialStudents)
  const [schedules, setSchedules] = useState(lookups.schedules)
  const [query, setQuery] = useState("")
  const [branchId, setBranchId] = useState(ALL)
  const [status, setStatus] = useState(ALL)
  const [view, setView] = useState<ViewMode>("cards")

  const liveLookups = { ...lookups, groups, schedules }
  const { branchesById, roomsById, teachersById } = indexLookups(liveLookups)
  const sessionsOf = (g: Group) => schedulesOf(g.id, schedules)
  /** Sessions normally happen in the group's usual room; show the room only when it differs. */
  const placeOf = (g: Group) => (s: WeeklySchedule) => sessionPlace(s, g, branchesById, roomsById)
  const studentCounts = countActiveStudentsByGroup(students)

  const { run, dialogs } = useGroupDialogs({
    lookups: liveLookups,
    students,
    onChange: ({ group, studentIds, schedules: sessions }, isNew) => {
      setSchedules((prev) => [...prev.filter((s) => s.groupId !== group.id), ...sessions])
      setGroups((prev) => (isNew ? [...prev, group] : prev.map((g) => (g.id === group.id ? group : g))))
      setStudents((prev) =>
        prev.map((s) => (studentIds.includes(s.id) ? { ...s, groupId: group.id } : s))
      )
    },
  })

  const filtered = groups.filter((g) => {
    if (query.trim()) {
      const { supervisor, assistants } = groupTeachers(g, teachersById)
      const teacherNames = [supervisor, ...assistants].flatMap((t) => (t ? [fullName(t)] : []))
      const haystack = [g.name, g.audience, ...teacherNames].join(" ")
      if (!matchesText(haystack, query)) return false
    }
    if (branchId !== ALL && g.branchId !== branchId) return false
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
      id: "place",
      header: "الفرع والقاعة",
      className: "hidden lg:table-cell",
      cell: (g) => <span className="text-sm text-muted-foreground">{locationLabel(g, branchesById, roomsById)}</span>,
    },
    {
      id: "students",
      header: "الطلبة",
      cell: (g) => <span className="tabular-nums">{studentCounts.get(g.id) ?? 0}</span>,
    },
    {
      id: "supervisor",
      header: labels.teachingRole.SUPERVISOR,
      cell: (g) => {
        const t = teachersById.get(g.supervisorId)
        return t ? <PersonCell name={fullName(t)} size="sm" /> : "—"
      },
    },
    {
      id: "assistants",
      header: "المساعدون",
      className: "hidden xl:table-cell",
      cell: (g) => {
        const { assistants } = groupTeachers(g, teachersById)
        return assistants.length ? (
          <span className="text-sm">{assistants.map(fullName).join("، ")}</span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )
      },
    },
    { id: "schedule", header: "المواعيد", cell: (g) => <ScheduleSummary schedule={sessionsOf(g)} detail={placeOf(g)} /> },
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
        description="الحلقات حسب الفرع والقاعة، مع المعلم المشرف والمساعدين والمواعيد الأسبوعية."
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
        search={
          <SearchInput
            value={query}
            onChange={setQuery}
            label="البحث عن مجموعة"
            placeholder="ابحث باسم المجموعة أو المعلم"
          />
        }
      >
        <FilterSelect
          label="الفرع"
          allLabel="كل الفروع"
          value={branchId}
          onValueChange={setBranchId}
          options={lookups.branches.map((b) => ({ value: b.id, label: b.name }))}
        />
        <FilterSelect
          label="الحالة"
          allLabel="كل الحالات"
          value={status}
          onValueChange={setStatus}
          options={(["ACTIVE", "INACTIVE", "ARCHIVED"] as const).map((s) => ({
            value: s,
            label: labels.status[s],
          }))}
        />
        <div
          role="group"
          aria-label="طريقة العرض"
          className="col-span-2 hidden items-center rounded-lg border bg-background p-0.5 md:flex"
        >
          {(
            [
              { mode: "cards", icon: LayoutGrid, label: "بطاقات" },
              { mode: "table", icon: List, label: "جدول" },
            ] as const
          ).map(({ mode, icon: Icon, label }) => (
            <Button
              key={mode}
              type="button"
              size="sm"
              variant="ghost"
              aria-pressed={view === mode}
              className={cn(view === mode && "bg-muted text-foreground")}
              onClick={() => setView(mode)}
            >
              <Icon />
              {label}
            </Button>
          ))}
        </div>
      </FilterBar>

      {view === "table" ? (
        <div className="hidden md:block">
          <DataTable
            key={`${query}|${branchId}|${status}`}
            caption="قائمة المجموعات"
            columns={columns}
            rows={filtered}
            getRowId={(g) => g.id}
            emptyState={noResults}
          />
        </div>
      ) : null}

      <div className={cn(view === "table" && "md:hidden")}>
        {filtered.length === 0 ? (
          <Card className="p-0">{noResults}</Card>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((group) => (
              <li key={group.id}>
                <GroupCard
                  group={group}
                  location={locationLabel(group, branchesById, roomsById)}
                  schedule={
                    <ScheduleSummary schedule={sessionsOf(group)} detail={placeOf(group)} />
                  }
                  studentCount={studentCounts.get(group.id) ?? 0}
                  team={groupTeachers(group, teachersById)}
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
  location,
  schedule,
  studentCount,
  team,
  actions,
}: {
  group: Group
  location: string
  schedule: React.ReactNode
  studentCount: number
  team: ReturnType<typeof groupTeachers>
  actions: React.ReactNode
}) {
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
          <p className="text-xs text-muted-foreground">{group.audience}</p>
        </div>
        {actions}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <MapPin className="size-3.5" aria-hidden />
          {location}
        </span>
        <span className="inline-flex items-center gap-1">
          <Users className="size-3.5" aria-hidden />
          {countLabels.students(studentCount)}
        </span>
      </div>

      <div className="space-y-2 border-t px-4 py-3">
        {team.supervisor && (
          <div className="flex items-center justify-between gap-2">
            <PersonCell name={fullName(team.supervisor)} size="sm" />
            <TeacherRoleBadge role="SUPERVISOR" />
          </div>
        )}
        {team.assistants.map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-2">
            <PersonCell name={fullName(t)} size="sm" />
            <TeacherRoleBadge role="ASSISTANT" />
          </div>
        ))}
        {team.assistants.length === 0 && (
          <p className="text-xs text-muted-foreground">بدون معلم مساعد</p>
        )}
      </div>

      <div className="mt-auto border-t bg-muted/30 px-4 py-3">
        {schedule}
      </div>
    </Card>
  )
}
