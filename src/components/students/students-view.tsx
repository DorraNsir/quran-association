"use client"

import { GraduationCap, Plus, SearchX } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { ActionsMenu } from "@/components/shared/actions-menu"
import { GroupBadge, StatusBadge } from "@/components/shared/badges"
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
import { Button } from "@/components/ui/button"
import { ageOn, fullName, indexLookups, type Lookups } from "@/lib/domain"
import { countLabels, formatDate } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { MOCK_TODAY } from "@/lib/mock/reference-date"
import type { Student, StudentStatus } from "@/types/domain"

import { studentActions, useStudentDialogs } from "./use-student-dialogs"

const STATUSES: StudentStatus[] = ["ACTIVE", "INACTIVE", "ARCHIVED"]

export function StudentsView({
  initialStudents,
  initialGroupId,
  lookups,
}: {
  initialStudents: Student[]
  initialGroupId?: string
  lookups: Lookups
}) {
  const [students, setStudents] = useState(initialStudents)
  const [query, setQuery] = useState("")
  const [groupId, setGroupId] = useState(initialGroupId ?? ALL)
  const [branchId, setBranchId] = useState(ALL)
  const [status, setStatus] = useState(ALL)

  const { branchesById, groupsById } = indexLookups(lookups)
  const { run, dialogs } = useStudentDialogs({
    lookups,
    onChange: (saved, isNew) =>
      setStudents((prev) =>
        isNew ? [saved, ...prev] : prev.map((s) => (s.id === saved.id ? saved : s))
      ),
  })

  const digits = query.replace(/\D/g, "")
  const filtered = students.filter((s) => {
    if (query.trim()) {
      const byName = matchesText(fullName(s), query)
      const byPhone =
        digits.length >= 2 &&
        [s.phone, s.guardianPhone].some((p) => p?.includes(digits))
      if (!byName && !byPhone) return false
    }
    if (groupId !== ALL && s.groupId !== groupId) return false
    if (branchId !== ALL && groupsById.get(s.groupId)?.branchId !== branchId) return false
    if (status !== ALL && s.status !== status) return false
    return true
  })

  const hasActiveFilters = Boolean(query) || [groupId, branchId, status].some((v) => v !== ALL)
  const resetFilters = () => {
    setQuery("")
    setGroupId(ALL)
    setBranchId(ALL)
    setStatus(ALL)
  }

  const groupOf = (s: Student) => groupsById.get(s.groupId)
  const branchOf = (s: Student) => {
    const group = groupOf(s)
    return group ? branchesById.get(group.branchId) : undefined
  }

  const columns: Column<Student>[] = [
    {
      id: "student",
      header: "الطالب",
      cell: (s) => (
        <Link href={`/admin/students/${s.id}`} className="block rounded-md hover:opacity-80">
          <PersonCell
            name={fullName(s)}
            photoUrl={s.photoUrl}
            secondary={`${ageOn(s.dateOfBirth, MOCK_TODAY)} سنة`}
          />
        </Link>
      ),
    },
    { id: "phone", header: "الهاتف", cell: (s) => <PhoneLink phone={s.phone} /> },
    {
      id: "guardian",
      header: "هاتف الولي",
      cell: (s) => <PhoneLink phone={s.guardianPhone} />,
    },
    {
      id: "group",
      header: "المجموعة",
      cell: (s) => {
        const group = groupOf(s)
        return group ? <GroupBadge name={group.name} href={`/admin/groups/${group.id}`} /> : "—"
      },
    },
    {
      id: "branch",
      header: "الفرع",
      className: "hidden xl:table-cell",
      cell: (s) => <span className="text-muted-foreground">{branchOf(s)?.name ?? "—"}</span>,
    },
    {
      id: "registered",
      header: "تاريخ التسجيل",
      className: "hidden lg:table-cell",
      cell: (s) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDate(s.registrationDate)}
        </span>
      ),
    },
    { id: "status", header: "الحالة", cell: (s) => <StatusBadge status={s.status} /> },
    {
      id: "actions",
      header: <span className="sr-only">{labels.common.actions}</span>,
      className: "w-12",
      cell: (s) => (
        <ActionsMenu label={`إجراءات ${fullName(s)}`} actions={studentActions(s, run)} />
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="الطلبة"
        description="جميع المنخرطين في حلقات الجمعية، أطفالًا وكهولًا، مع مجموعاتهم وأرقام التواصل."
        actions={
          <Button onClick={() => run("create")}>
            <Plus />
            إضافة طالب
          </Button>
        }
      />

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onReset={resetFilters}
        resultLabel={countLabels.students(filtered.length)}
        search={
          <SearchInput
            value={query}
            onChange={setQuery}
            label="البحث عن طالب"
            placeholder="ابحث بالاسم أو رقم الهاتف"
          />
        }
      >
        <FilterSelect
          label="المجموعة"
          allLabel="كل المجموعات"
          value={groupId}
          onValueChange={setGroupId}
          options={lookups.groups.map((g) => ({ value: g.id, label: g.name }))}
        />
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
          options={STATUSES.map((s) => ({ value: s, label: labels.status[s] }))}
        />
      </FilterBar>

      <DataTable
        key={`${query}|${groupId}|${branchId}|${status}`}
        caption="قائمة الطلبة"
        columns={columns}
        rows={filtered}
        getRowId={(s) => s.id}
        emptyState={
          students.length === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title="لا يوجد طلبة بعد"
              description="ابدأ بإضافة أول طالب وتعيينه في مجموعة."
            />
          ) : (
            <EmptyState
              icon={SearchX}
              title="لا توجد نتائج مطابقة"
              description="جرّب كلمات بحث أخرى أو امسح عوامل التصفية."
              action={
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  {labels.common.resetFilters}
                </Button>
              }
            />
          )
        }
        renderMobileCard={(s) => {
          const group = groupOf(s)
          return (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/admin/students/${s.id}`} className="min-w-0 flex-1">
                  <PersonCell
                    name={fullName(s)}
                    photoUrl={s.photoUrl}
                    secondary={`${ageOn(s.dateOfBirth, MOCK_TODAY)} سنة · ${branchOf(s)?.name ?? ""}`}
                  />
                </Link>
                <ActionsMenu label={`إجراءات ${fullName(s)}`} actions={studentActions(s, run)} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={s.status} />
                {group && <GroupBadge name={group.name} href={`/admin/groups/${group.id}`} />}
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">الهاتف</dt>
                  <dd><PhoneLink phone={s.phone} /></dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">هاتف الولي</dt>
                  <dd><PhoneLink phone={s.guardianPhone} /></dd>
                </div>
              </dl>
            </div>
          )
        }}
      />
      {dialogs}
    </>
  )
}
