"use client"

import { Plus, SearchX, ShieldCheck, UserRound } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { ActionsMenu } from "@/components/shared/actions-menu"
import { StatusBadge } from "@/components/shared/badges"
import { DataTable, type Column } from "@/components/shared/data-table"
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
import { PersonCell } from "@/components/shared/user-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { fullName, teacherAssignments, teacherWeeklySlots, weeklyMinutes, type Lookups } from "@/lib/domain"
import { countLabels, formatDuration } from "@/lib/format"
import { labels } from "@/lib/i18n"
import type { ID, Teacher } from "@/types/domain"

import { TeacherAssignments } from "./teacher-assignments"
import { teacherActions, useTeacherDialogs } from "./use-teacher-dialogs"

export function TeachersView({
  lookups,
  adminTeacherIds,
}: {
  lookups: Lookups
  /** Teachers whose user account also has the ADMIN role */
  adminTeacherIds: ID[]
}) {
  const { teachers } = lookups
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState(ALL)
  const [branchId, setBranchId] = useState(ALL)

  const { run, dialogs } = useTeacherDialogs({ lookups })

  const assignmentsOf = (t: Teacher) => teacherAssignments(t.id, lookups)
  const weeklyLoad = (t: Teacher) =>
    weeklyMinutes(teacherWeeklySlots(t.id, lookups).map((e) => e.slot))

  const digits = query.replace(/\D/g, "")
  const filtered = teachers.filter((t) => {
    if (query.trim()) {
      const byName = matchesText(fullName(t), query)
      const byPhone = digits.length >= 2 && t.phone.includes(digits)
      if (!byName && !byPhone) return false
    }
    if (status !== ALL && t.status !== status) return false
    if (branchId !== ALL && !assignmentsOf(t).some((a) => a.groupClass.branchId === branchId)) {
      return false
    }
    return true
  })

  const hasActiveFilters = Boolean(query) || status !== ALL || branchId !== ALL
  const resetFilters = () => {
    setQuery("")
    setStatus(ALL)
    setBranchId(ALL)
  }

  const identity = (t: Teacher) => (
    <Link href={`/admin/teachers/${t.id}`} className="block min-w-0 rounded-md hover:opacity-80">
      <PersonCell
        name={fullName(t)}
        photoUrl={t.photoUrl}
        secondary={
          <>
            {adminTeacherIds.includes(t.id) && (
              <Badge variant="secondary" className="me-1.5 h-4 px-1.5 text-[0.65rem]">
                {labels.role.ADMIN}
              </Badge>
            )}
            {t.qualification}
          </>
        }
      />
    </Link>
  )

  const columns: Column<Teacher>[] = [
    { id: "teacher", header: "المعلم", className: "max-w-64", cell: identity },
    { id: "phone", header: "الهاتف", cell: (t) => <PhoneLink phone={t.phone} /> },
    {
      id: "groups",
      header: "المجموعات والمسؤولية",
      cell: (t) => <TeacherAssignments assignments={assignmentsOf(t)} groupClasses={lookups.groupClasses} />,
    },
    {
      id: "load",
      header: "الحصص أسبوعيًا",
      className: "hidden xl:table-cell",
      cell: (t) => {
        const minutes = weeklyLoad(t)
        return minutes ? (
          <span className="whitespace-nowrap tabular-nums">{formatDuration(minutes)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )
      },
    },
    { id: "status", header: "الحالة", cell: (t) => <StatusBadge status={t.status} /> },
    {
      id: "actions",
      header: <span className="sr-only">{labels.common.actions}</span>,
      className: "w-12",
      cell: (t) => <ActionsMenu label={`إجراءات ${fullName(t)}`} actions={teacherActions(t, run)} />,
    },
  ]

  return (
    <>
      <PageHeader
        title="المعلمون"
        description="المعلمون المتطوعون والمتعاقدون، ومسؤولية كل منهم داخل المجموعات."
        actions={
          <Button onClick={() => run("create")}>
            <Plus />
            إضافة معلم
          </Button>
        }
      />

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onReset={resetFilters}
        resultLabel={countLabels.teachers(filtered.length)}
        search={
          <SearchInput
            value={query}
            onChange={setQuery}
            label="البحث عن معلم"
            placeholder="ابحث بالاسم أو رقم الهاتف"
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
          options={(["ACTIVE", "INACTIVE"] as const).map((s) => ({ value: s, label: labels.status[s] }))}
        />
      </FilterBar>

      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="size-3.5 text-primary" aria-hidden />
          {labels.teachingRole.SUPERVISOR}: مسؤول عن المجموعة ومتابعتها
        </span>
        <span className="inline-flex items-center gap-1.5">
          <UserRound className="size-3.5" aria-hidden />
          {labels.teachingRole.ASSISTANT}: يساعد المشرف في الحصص
        </span>
      </div>

      <DataTable
        key={`${query}|${status}|${branchId}`}
        caption="قائمة المعلمين"
        columns={columns}
        rows={filtered}
        getRowId={(t) => t.id}
        emptyState={
          <EmptyState
            icon={SearchX}
            title="لا توجد نتائج مطابقة"
            description="جرّب كلمات بحث أخرى أو امسح عوامل التصفية."
            action={
              hasActiveFilters && (
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  {labels.common.resetFilters}
                </Button>
              )
            }
          />
        }
        renderMobileCard={(t) => (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">{identity(t)}</div>
              <ActionsMenu label={`إجراءات ${fullName(t)}`} actions={teacherActions(t, run)} />
            </div>
            <div className="flex items-center gap-3 text-sm">
              <StatusBadge status={t.status} />
              <PhoneLink phone={t.phone} />
            </div>
            <TeacherAssignments assignments={assignmentsOf(t)} groupClasses={lookups.groupClasses} />
          </div>
        )}
      />
      {dialogs}
    </>
  )
}
