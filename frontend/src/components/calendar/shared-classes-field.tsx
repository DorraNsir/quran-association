"use client"

import { Info, UsersRound } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import { countActiveStudentsByClass, indexLookups, isRunning, type Lookups } from "@/lib/domain"
import { countLabels } from "@/lib/format"
import type { GroupClass, ID, Student } from "@/types/domain"

/**
 * Classes that may join a lesson of `host` («حصة مشتركة»): running classes
 * with the SAME supervisor in the SAME branch (the API checks it again).
 */
export function shareableClasses(host: GroupClass | undefined, lookups: Lookups) {
  if (!host) return []
  const { groupsById } = indexLookups(lookups)
  return lookups.groupClasses.filter(
    (c) => c.id !== host.id && c.supervisorId === host.supervisorId && c.branchId === host.branchId && isRunning(c, groupsById)
  )
}

/**
 * «أقسام مشتركة (اختياري)»: other classes taught in the SAME lesson — one
 * session, one room, one supervisor; every student stays in their own class
 * and program. No class selected = a normal lesson.
 */
export function SharedClassesField({
  id,
  host,
  value,
  onChange,
  lookups,
  students,
}: {
  id: string
  host: GroupClass | undefined
  value: ID[]
  onChange: (ids: ID[]) => void
  lookups: Lookups
  students?: Student[]
}) {
  const { classesById, groupsById } = indexLookups(lookups)
  const counts = students ? countActiveStudentsByClass(students) : undefined
  // Already selected classes stay listed (e.g. to remove one that no longer qualifies)
  const options = [
    ...shareableClasses(host, lookups),
    ...value.flatMap((v) => {
      const c = classesById.get(v)
      return c && !shareableClasses(host, lookups).some((s) => s.id === v) ? [c] : []
    }),
  ]

  return (
    <fieldset className="space-y-2 sm:col-span-2" aria-describedby={`${id}-hint`}>
      <legend className="flex items-center gap-1.5 text-sm font-medium">
        <UsersRound className="size-4 text-primary" aria-hidden />
        أقسام مشتركة (اختياري)
      </legend>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        حصة واحدة مع أقسام أخرى لنفس المعلم المشرف في نفس الفرع. يبقى كل طالب في قسمه ومجموعته.
      </p>
      {!host ? (
        <p className="text-xs text-muted-foreground">اختر القسم أولًا.</p>
      ) : options.length === 0 ? (
        <p className="flex items-center gap-1.5 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <Info className="size-3.5 shrink-0" aria-hidden />
          لا توجد أقسام أخرى لنفس المعلم المشرف في هذا الفرع.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {options.map((c) => {
            const checked = value.includes(c.id)
            const inputId = `${id}-${c.id}`
            return (
              <li key={c.id} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                <Checkbox
                  id={inputId}
                  checked={checked}
                  onCheckedChange={(on) => onChange(on ? [...value, c.id] : value.filter((v) => v !== c.id))}
                />
                <label htmlFor={inputId} className="flex flex-1 cursor-pointer items-center justify-between gap-2 text-sm">
                  <span className="font-medium">{groupsById.get(c.groupId)?.name ?? "—"}</span>
                  {counts && <span className="text-xs text-muted-foreground">{countLabels.students(counts.get(c.id) ?? 0)}</span>}
                </label>
              </li>
            )
          })}
        </ul>
      )}
    </fieldset>
  )
}
