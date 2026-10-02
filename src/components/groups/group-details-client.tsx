"use client"

import { Pencil, Users } from "lucide-react"
import Link from "next/link"

import { ActionsMenu } from "@/components/shared/actions-menu"
import { StatusBadge } from "@/components/shared/badges"
import { DataTable, type Column } from "@/components/shared/data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { PhoneLink } from "@/components/shared/info-list"
import { PersonCell } from "@/components/shared/user-avatar"
import { Button } from "@/components/ui/button"
import { ageOn, fullName, type Lookups } from "@/lib/domain"
import { formatDate } from "@/lib/format"
import { MOCK_TODAY } from "@/lib/mock/reference-date"
import type { Group, Student } from "@/types/domain"

import { groupActions, useGroupDialogs } from "./use-group-dialogs"

export function GroupProfileActions({
  group,
  lookups,
  students,
}: {
  group: Group
  lookups: Lookups
  students: Student[]
}) {
  const { run, dialogs } = useGroupDialogs({ lookups, students })
  return (
    <>
      <Button onClick={() => run("edit", group)}>
        <Pencil />
        تعديل
      </Button>
      <ActionsMenu
        label="إجراءات أخرى"
        triggerVariant="outline"
        actions={groupActions(group, run, { includeView: false, includeEdit: false })}
      />
      {dialogs}
    </>
  )
}

export function GroupStudentsTable({ students }: { students: Student[] }) {
  const columns: Column<Student>[] = [
    {
      id: "student",
      header: "الطالب",
      cell: (s) => (
        <Link href={`/admin/students/${s.id}`} className="block hover:opacity-80">
          <PersonCell name={fullName(s)} photoUrl={s.photoUrl} secondary={`${ageOn(s.dateOfBirth, MOCK_TODAY)} سنة`} />
        </Link>
      ),
    },
    {
      id: "contact",
      header: "هاتف التواصل",
      cell: (s) => (
        <span className="inline-flex items-center gap-1.5">
          <PhoneLink phone={s.guardianPhone ?? s.phone} />
          {s.guardianPhone && <span className="text-xs text-muted-foreground">(الولي)</span>}
        </span>
      ),
    },
    {
      id: "registered",
      header: "تاريخ التسجيل",
      className: "hidden lg:table-cell",
      cell: (s) => <span className="text-muted-foreground">{formatDate(s.registrationDate)}</span>,
    },
    { id: "status", header: "الحالة", cell: (s) => <StatusBadge status={s.status} /> },
  ]

  return (
    <DataTable
      caption="طلبة المجموعة"
      columns={columns}
      rows={students}
      getRowId={(s) => s.id}
      pageSize={15}
      emptyState={
        <EmptyState
          icon={Users}
          title="لا يوجد طلبة في هذه المجموعة"
          description="أضف طلبة من خلال تعديل المجموعة أو من صفحة الطلبة."
        />
      }
      renderMobileCard={(s) => (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Link href={`/admin/students/${s.id}`} className="min-w-0 flex-1">
              <PersonCell
                name={fullName(s)}
                photoUrl={s.photoUrl}
                secondary={`${ageOn(s.dateOfBirth, MOCK_TODAY)} سنة`}
              />
            </Link>
            <StatusBadge status={s.status} />
          </div>
          <p className="ps-12 text-sm">
            <PhoneLink phone={s.guardianPhone ?? s.phone} />
            {s.guardianPhone && <span className="ms-1.5 text-xs text-muted-foreground">(الولي)</span>}
          </p>
        </div>
      )}
    />
  )
}
