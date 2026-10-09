"use client"

import { DoorOpen, Pencil, Plus, Users } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { ActionsMenu } from "@/components/shared/actions-menu"
import { StatusBadge, TeacherRoleBadge } from "@/components/shared/badges"
import { DataTable, type Column } from "@/components/shared/data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { PhoneLink } from "@/components/shared/info-list"
import { ScheduleSummary } from "@/components/shared/schedule"
import { PersonCell } from "@/components/shared/user-avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  ageOn,
  classesOf,
  countActiveStudentsByClass,
  describeClass,
  fullName,
  indexLookups,
  schedulesOf,
  studentClass,
  type Lookups,
} from "@/lib/domain"
import { countLabels } from "@/lib/format"
import { todayInTunis } from "@/lib/dates"
import { cn } from "@/lib/utils"
import type { Group, Student } from "@/types/domain"

import { classActions, groupActions, useGroupDialogs } from "./use-group-dialogs"
import { useAdminDate } from "@/lib/store/settings"

export function GroupProfileActions({ group, lookups, students }: { group: Group; lookups: Lookups; students: Student[] }) {
  const { run, dialogs } = useGroupDialogs({ lookups, students })
  return (
    <>
      <Button onClick={() => run("add-class", group)}>
        <Plus />
        إضافة قسم
      </Button>
      <Button variant="outline" onClick={() => run("edit", group)}>
        <Pencil />
        تعديل المجموعة
      </Button>
      <ActionsMenu
        label="إجراءات أخرى"
        triggerVariant="outline"
        actions={groupActions(group, run, { includeView: false, includeEdit: false, includeAddClass: false })}
      />
      {dialogs}
    </>
  )
}

/** One card per class: same group, each with its own place, supervisor, students and schedule. */
export function GroupClassList({ group, lookups, students }: { group: Group; lookups: Lookups; students: Student[] }) {
  const { run, runClass, dialogs } = useGroupDialogs({ lookups, students })
  const indexes = indexLookups(lookups)
  const counts = countActiveStudentsByClass(students)
  const classes = classesOf(group.id, lookups.groupClasses).map((c) => describeClass(c, indexes))

  return (
    <>
      {classes.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={DoorOpen}
            title="لا توجد أقسام لهذه المجموعة بعد"
            description="أضف قسمًا لتحديد الفرع والمدرس المشرف والطلبة والمواعيد."
            action={
              <Button size="sm" onClick={() => run("add-class", group)}>
                <Plus />
                إضافة قسم
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {classes.map((v) => (
            <li key={v.groupClass.id}>
              <Card className={cn("h-full gap-0 p-0", v.groupClass.status !== "ACTIVE" && "bg-muted/30")}>
                <div className="flex items-start justify-between gap-2 border-b p-4">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold">
                      <DoorOpen className="size-4 text-primary" aria-hidden />
                      {v.branch?.name}
                      {v.groupClass.status !== "ACTIVE" && <StatusBadge status={v.groupClass.status} />}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {v.room?.name} · {countLabels.students(counts.get(v.groupClass.id) ?? 0)}
                    </p>
                  </div>
                  <ActionsMenu label={`إجراءات قسم ${v.branch?.name ?? ""}`} actions={classActions(group, v.groupClass, runClass)} />
                </div>
                <div className="space-y-2 p-4">
                  {v.supervisor && (
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/admin/teachers/${v.supervisor.id}`} className="min-w-0 hover:opacity-80">
                        <PersonCell name={fullName(v.supervisor)} photoUrl={v.supervisor.photoUrl} size="sm" />
                      </Link>
                      <TeacherRoleBadge role="SUPERVISOR" />
                    </div>
                  )}
                  {v.assistants.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-2">
                      <Link href={`/admin/teachers/${t.id}`} className="min-w-0 hover:opacity-80">
                        <PersonCell name={fullName(t)} photoUrl={t.photoUrl} size="sm" />
                      </Link>
                      <TeacherRoleBadge role="ASSISTANT" />
                    </div>
                  ))}
                </div>
                <div className="mt-auto border-t bg-muted/30 px-4 py-3">
                  <ScheduleSummary schedule={schedulesOf(v.groupClass.id, lookups.schedules)} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {dialogs}
    </>
  )
}

/** All students of the group, each with their class (branch + supervisor); filterable by class. */
export function GroupStudentsTable({ students, lookups, groupId }: { students: Student[]; lookups: Lookups; groupId: string }) {
  const adminDate = useAdminDate()
  const indexes = indexLookups(lookups)
  const classes = classesOf(groupId, lookups.groupClasses)
  const [classId, setClassId] = useState("all")
  const rows = students.filter((s) => classes.some((c) => c.id === s.groupClassId) && (classId === "all" || s.groupClassId === classId))
  /** "Branch — supervisor": what tells two classes of the same group apart */
  const classLabel = (groupClassId: string) => {
    const v = studentClass({ groupClassId }, indexes)
    return v ? `${v.branch?.name ?? ""} — ${v.supervisor ? fullName(v.supervisor) : "—"}` : "—"
  }

  const columns: Column<Student>[] = [
    {
      id: "student",
      header: "الطالب",
      cell: (s) => (
        <Link href={`/admin/students/${s.id}`} className="block hover:opacity-80">
          <PersonCell name={fullName(s)} photoUrl={s.photoUrl} secondary={`${ageOn(s.dateOfBirth, todayInTunis())} سنة`} />
        </Link>
      ),
    },
    { id: "class", header: "القسم (الفرع — المدرس المشرف)", cell: (s) => <span className="text-sm">{classLabel(s.groupClassId)}</span> },
    {
      id: "contact",
      header: "هاتف التواصل",
      className: "hidden lg:table-cell",
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
      className: "hidden xl:table-cell",
      cell: (s) => <span className="text-muted-foreground">{adminDate(s.registrationDate)}</span>,
    },
    { id: "status", header: "الحالة", cell: (s) => <StatusBadge status={s.status} /> },
  ]

  return (
    <div className="space-y-3">
      {classes.length > 1 && (
        <div role="tablist" aria-label="تصفية حسب القسم" className="flex flex-wrap gap-1">
          {[{ id: "all", label: `كل الأقسام (${classes.length})` }, ...classes.map((c) => ({ id: c.id, label: classLabel(c.id) }))].map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={classId === t.id} onClick={() => setClassId(t.id)}
              className={cn("rounded-full border px-3 py-1 text-sm transition-colors", classId === t.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>
              {t.label}
            </button>
          ))}
        </div>
      )}
      <DataTable
        key={classId}
        caption="طلبة المجموعة"
        columns={columns}
        rows={rows}
        getRowId={(s) => s.id}
        emptyState={<EmptyState icon={Users} title="لا يوجد طلبة" description="أضف طلبة من خلال تعديل القسم أو من صفحة الطلبة." />}
        renderMobileCard={(s) => (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <Link href={`/admin/students/${s.id}`} className="min-w-0 flex-1">
                <PersonCell name={fullName(s)} photoUrl={s.photoUrl} secondary={classLabel(s.groupClassId)} />
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
    </div>
  )
}
