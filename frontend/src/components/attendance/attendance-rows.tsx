"use client"

import { CircleDashed, StickyNote } from "lucide-react"
import { useState } from "react"

import { TeacherRoleBadge } from "@/components/shared/badges"
import { PersonCell, UserAvatar } from "@/components/shared/user-avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fullName } from "@/lib/domain"
import type { AttendanceEntry } from "@/lib/attendance"
import { cn } from "@/lib/utils"
import type { AttendanceStatus, Student, Teacher, TeachingRole } from "@/types/domain"

import { StatusPicker } from "./status-picker"

/**
 * One student: name + four status buttons in a single tap. Unmarked rows
 * are visibly different so nobody believes the list is done when it isn't.
 * The note is secondary — hidden behind a small button unless filled.
 */
export function StudentAttendanceRow({
  student,
  entry,
  disabled,
  onStatus,
  onNote,
}: {
  student: Pick<Student, "id" | "firstName" | "lastName" | "photoUrl">
  entry?: AttendanceEntry
  disabled?: boolean
  onStatus: (status: AttendanceStatus) => void
  onNote: (note: string) => void
}) {
  const [noteOpen, setNoteOpen] = useState(Boolean(entry?.note))
  const name = fullName(student)
  const unmarked = !entry

  return (
    <li
      className={cn(
        "rounded-xl border bg-card p-3 transition-colors sm:p-4",
        unmarked && !disabled && "border-dashed border-warning/60 bg-warning-soft/30"
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
        <div className="flex min-w-0 items-center gap-3 lg:w-64 lg:shrink-0">
          <UserAvatar name={name} photoUrl={student.photoUrl} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{name}</p>
            {unmarked ? (
              <p className="flex items-center gap-1 text-xs text-warning">
                <CircleDashed className="size-3" aria-hidden />
                لم يُسجَّل بعد
              </p>
            ) : (
              entry.note && !noteOpen && <p className="truncate text-xs text-muted-foreground">{entry.note}</p>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("shrink-0 lg:order-last", entry?.note && "text-primary")}
            aria-label={`ملاحظة حول ${name}`}
            aria-expanded={noteOpen}
            disabled={disabled}
            onClick={() => setNoteOpen((open) => !open)}
          >
            <StickyNote />
          </Button>
        </div>
        {disabled ? null : (
          <StatusPicker
            label={`حضور ${name}`}
            value={entry?.status}
            onChange={onStatus}
            className="flex-1"
          />
        )}
      </div>
      {noteOpen && !disabled && (
        <Input
          className="mt-3"
          value={entry?.note ?? ""}
          onChange={(e) => onNote(e.target.value)}
          placeholder={entry ? "ملاحظة قصيرة (اختياري)، مثال: مريض" : "اختر الحالة أولًا ثم أضف ملاحظة"}
          disabled={!entry}
          aria-label={`ملاحظة حول ${name}`}
          maxLength={120}
        />
      )}
    </li>
  )
}

/** Assigned teachers' presence — same statuses, compact, no HR system. */
export function TeacherAttendanceList({
  teachers,
  entries,
  disabled,
  onStatus,
}: {
  teachers: { teacher: Teacher; role: TeachingRole }[]
  entries: Map<string, AttendanceEntry>
  disabled?: boolean
  onStatus: (teacherId: string, status: AttendanceStatus) => void
}) {
  return (
    <ul className="divide-y">
      {teachers.map(({ teacher, role }) => (
        <li key={teacher.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <PersonCell name={fullName(teacher)} photoUrl={teacher.photoUrl} size="sm" />
            <TeacherRoleBadge role={role} />
          </div>
          {!disabled && (
            <StatusPicker
              size="compact"
              label={`حضور ${fullName(teacher)}`}
              value={entries.get(teacher.id)?.status}
              onChange={(status) => onStatus(teacher.id, status)}
              className="md:w-[26rem]"
            />
          )}
        </li>
      ))}
    </ul>
  )
}
