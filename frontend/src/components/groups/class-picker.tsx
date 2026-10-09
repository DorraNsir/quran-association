"use client"

import { DoorOpen, ShieldCheck, Users } from "lucide-react"
import { useState } from "react"

import { ScheduleSummary } from "@/components/shared/schedule"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  classesOf,
  countActiveStudentsByClass,
  describeClass,
  fullName,
  indexLookups,
  isRunning,
  schedulesOf,
  type Lookups,
} from "@/lib/domain"
import { countLabels } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { ID, Student } from "@/types/domain"

/**
 * Assigns a student (or a session) to the right class: pick the pedagogical
 * group, then one of its classes — each shown by branch, room, supervisor
 * and schedule. The class is the only thing stored, so branch and
 * supervisor can never be combined inconsistently.
 */
export function ClassPicker({
  id,
  value,
  onChange,
  lookups,
  students,
  excludeClassId,
  invalid,
}: {
  id: string
  /** Selected groupClassId */
  value: string
  onChange: (groupClassId: ID) => void
  lookups: Lookups
  /** Used to show each class's size */
  students?: Student[]
  /** e.g. the student's current class when moving them */
  excludeClassId?: ID
  invalid?: boolean
}) {
  const indexes = indexLookups(lookups)
  const { classesById, groupsById } = indexes
  const [groupId, setGroupId] = useState(classesById.get(value)?.groupId ?? "")
  const counts = students ? countActiveStudentsByClass(students) : null

  const selectable = (classId: ID) => {
    const c = classesById.get(classId)
    return Boolean(c) && (isRunning(c, groupsById) || classId === value)
  }
  const groups = lookups.groups.filter((g) =>
    classesOf(g.id, lookups.groupClasses).some((c) => selectable(c.id) && c.id !== excludeClassId)
  )
  const classes = classesOf(groupId, lookups.groupClasses).filter((c) => selectable(c.id))

  function selectGroup(next: ID) {
    setGroupId(next)
    const options = classesOf(next, lookups.groupClasses).filter((c) => selectable(c.id) && c.id !== excludeClassId)
    // A group with a single class needs no second choice
    onChange(options.length === 1 ? options[0].id : "")
  }

  return (
    <div className="space-y-3">
      <Select value={groupId} onValueChange={selectGroup}>
        <SelectTrigger id={id} className="w-full" aria-invalid={invalid && !groupId ? true : undefined}>
          <SelectValue placeholder="اختر المجموعة" />
        </SelectTrigger>
        <SelectContent position="popper">
          {groups.map((g) => (
            <SelectItem key={g.id} value={g.id}>
              {g.name}
              <span className="text-xs text-muted-foreground">— {g.audience}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {groupId && (
        <div role="radiogroup" aria-label={`${labels.groupClass.plural} — ${groupsById.get(groupId)?.name ?? ""}`} className="grid gap-2">
          {classes.length > 1 && (
            <p className="text-xs text-muted-foreground">
              لهذه المجموعة {countLabels.classes(classes.length)} — اختر قسم الطالب:
            </p>
          )}
          {classes.map((groupClass) => {
            const view = describeClass(groupClass, indexes)
            const checked = value === groupClass.id
            const disabled = groupClass.id === excludeClassId
            return (
              <button
                key={groupClass.id}
                type="button"
                role="radio"
                aria-checked={checked}
                disabled={disabled}
                onClick={() => onChange(groupClass.id)}
                className={cn(
                  "flex flex-col gap-1.5 rounded-lg border p-3 text-start text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  checked ? "border-primary bg-brand-soft/50 ring-1 ring-primary" : "hover:bg-muted/50",
                  disabled && "cursor-not-allowed opacity-60",
                  invalid && !value && "border-destructive/50"
                )}
              >
                <span className="flex items-center justify-between gap-2 font-medium">
                  {view.branch?.name}
                  {disabled && <span className="text-xs font-normal text-muted-foreground">القسم الحالي</span>}
                </span>
                <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <ShieldCheck className="size-3.5 text-primary" aria-hidden />
                    {view.supervisor ? fullName(view.supervisor) : "—"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <DoorOpen className="size-3.5" aria-hidden />
                    {view.room?.name}
                  </span>
                  {counts && (
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3.5" aria-hidden />
                      {countLabels.students(counts.get(groupClass.id) ?? 0)}
                    </span>
                  )}
                </span>
                <ScheduleSummary schedule={schedulesOf(groupClass.id, lookups.schedules)} className="text-xs" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
