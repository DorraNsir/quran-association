"use client"

import { FormField } from "@/components/shared/form"
import { MultiSelect } from "@/components/shared/multi-select"
import { Badge } from "@/components/ui/badge"
import { groupClassLabel } from "@/lib/communication"
import type { Lookups } from "@/lib/domain"
import { getTeacherGroupClasses } from "@/lib/teacher-access"
import type { ID } from "@/types/domain"

export interface ClassOption {
  value: ID
  label: string
}

/**
 * The classes a teacher may address: the ones they are CURRENTLY assigned to
 * (supervisor or assistant) and that are active — the API's rule
 * (ANNOUNCEMENT_CLASS_ACCESS_DENIED / ANNOUNCEMENT_TARGET_INVALID otherwise).
 * Never another teacher's class carried in the workspace bundle.
 */
export function eligibleClasses(teacherId: ID, lookups: Lookups): ClassOption[] {
  return getTeacherGroupClasses(teacherId, lookups)
    .filter((a) => a.groupClass.status === "ACTIVE")
    .map((a) => ({ value: a.groupClass.id, label: groupClassLabel(a.groupClass, lookups) }))
}

/**
 * Explicit choice of the target classes (several allowed), with a summary of
 * who will receive it — there is no default audience. `locked` (after
 * publication the API refuses any change of classes) shows them read-only.
 */
export function ClassAudienceField({
  classes,
  selected,
  onChange,
  error,
  locked,
}: {
  classes: ClassOption[]
  selected: ID[]
  onChange: (ids: ID[]) => void
  error?: string
  /** Read-only labels (a published announcement keeps its classes) */
  locked?: string[]
}) {
  if (locked)
    return (
      <ul className="flex flex-wrap gap-1" aria-label="الفصول المستهدفة">
        {locked.map((label) => (
          <li key={label}>
            <Badge variant="outline" className="h-auto whitespace-normal py-0.5 text-start font-normal">
              {label}
            </Badge>
          </li>
        ))}
      </ul>
    )
  const labels = classes.filter((c) => selected.includes(c.value)).map((c) => c.label)
  return (
    <>
      <FormField id="tann-classes" label="الفصول" required error={error}>
        <MultiSelect
          id="tann-classes"
          options={classes}
          selected={selected}
          onChange={onChange}
          placeholder="اختر الفصول"
          searchPlaceholder="ابحث عن فصل…"
          countLabel={(n) => `${n} فصل مختار`}
          invalid={Boolean(error)}
        />
      </FormField>
      {labels.length > 0 && (
        <p className="text-sm text-muted-foreground" data-testid="tann-audience">
          سيصل الإعلان إلى طلبة ومعلمي: {labels.join("، ")}
        </p>
      )}
    </>
  )
}
