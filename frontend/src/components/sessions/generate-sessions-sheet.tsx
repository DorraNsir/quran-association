"use client"

import { AlertTriangle, CalendarPlus, Info } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { FormField, FormSection, FormSheet } from "@/components/shared/form"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useFormState } from "@/hooks/use-form-state"
import { useGenerateSessions, type GenerateSessionsResult } from "@/lib/api/sessions"
import { addDays, weekdayOf } from "@/lib/dates"
import { describeClass, fullName, indexLookups, isRunning, type Lookups } from "@/lib/domain"
import { countLabels, formatShortDate, formatTimeRange } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { useCurrentAcademicYear } from "@/lib/store/settings"
import type { AcademicYear, ISODate } from "@/types/domain"

/** The API generates at most 366 days at once. */
export const MAX_GENERATION_DAYS = 366
const ALL_CLASSES = "all"

const dayNumber = (date: ISODate) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 86_400_000

/**
 * Default period: from today (or the start of the academic year if it has
 * not begun) to the end of the current academic year; four weeks when no
 * academic year is configured. Past dates are only generated on request.
 */
export function defaultGenerationRange(today: ISODate, year?: Pick<AcademicYear, "startDate" | "endDate">) {
  const from = year && year.startDate > today ? year.startDate : today
  const end = year && year.endDate >= from ? year.endDate : addDays(from, 27)
  const to = dayNumber(end) - dayNumber(from) + 1 > MAX_GENERATION_DAYS ? addDays(from, MAX_GENERATION_DAYS - 1) : end
  return { from, to }
}

interface Values {
  from: ISODate
  to: ISODate
  groupClassId: string
}

/**
 * Creates the actual dated sessions from the weekly schedule (the recurring
 * plan) for a period — through the API's idempotent generator: existing
 * sessions (completed, cancelled, moved…) are never recreated or changed,
 * each new session takes the room of its own weekly slot, and occurrences
 * that would collide with another session are reported, not created.
 */
export function GenerateSessionsSheet({
  open,
  onOpenChange,
  lookups,
  today,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  lookups: Lookups
  today: ISODate
}) {
  const year = useCurrentAcademicYear()
  const generate = useGenerateSessions()
  const [result, setResult] = useState<GenerateSessionsResult | null>(null)
  const indexes = indexLookups(lookups)
  const running = lookups.groupClasses.filter((c) => isRunning(c, indexes.groupsById))
  const classLabel = (id: string) => {
    const c = indexes.classesById.get(id)
    const view = c && describeClass(c, indexes)
    return view ? `${view.group?.name ?? "—"} — ${view.branch?.name ?? ""}` : "—"
  }

  const form = useFormState<Values>(
    "generate-sessions",
    { ...defaultGenerationRange(today, year), groupClassId: ALL_CLASSES },
    (v) => ({
      from: v.from ? undefined : "اختر تاريخ البداية",
      to: !v.to
        ? "اختر تاريخ النهاية"
        : v.from && v.to < v.from
          ? "يجب أن يكون تاريخ النهاية بعد تاريخ البداية"
          : v.from && dayNumber(v.to) - dayNumber(v.from) + 1 > MAX_GENERATION_DAYS
            ? "لا يمكن توليد أكثر من سنة (366 يومًا) في مرة واحدة"
            : undefined,
    })
  )

  const submit = form.handleSubmit(async (v) => {
    const res = await generate.mutateAsync({
      from: v.from,
      to: v.to,
      groupClassId: v.groupClassId === ALL_CLASSES ? undefined : v.groupClassId,
    })
    const summary =
      res.created > 0
        ? `تم إنشاء ${countLabels.sessions(res.created)}`
        : "لم تُنشأ حصص جديدة: كل الحصص موجودة مسبقًا لهذه الفترة"
    const problems = res.skippedConflicts.length + res.skippedInactiveSupervisorClassIds.length
    if (problems > 0) {
      // Keep the sheet open: the admin must see what could not be created
      toast.warning(summary)
      setResult(res)
    } else {
      toast.success(summary)
      setResult(null)
      onOpenChange(false)
    }
  })

  return (
    <FormSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setResult(null)
        onOpenChange(next)
      }}
      title="توليد الحصص"
      description="تُنشأ الحصص المؤرخة من المواعيد الأسبوعية للأقسام النشطة، كلٌّ في قاعة موعدها ومع معلمي القسم."
      onSubmit={submit}
      submitLabel="توليد الحصص"
      pending={form.pending}
      error={form.serverError}
    >
      <FormSection title="الفترة">
        <FormField label="من" required {...form.field("from")}>
          <Input type="date" dir="ltr" {...form.inputProps("from")} />
        </FormField>
        <FormField label="إلى" required {...form.field("to")}>
          <Input type="date" dir="ltr" {...form.inputProps("to")} />
        </FormField>
        <FormField label="القسم" className="sm:col-span-2" {...form.field("groupClassId")}>
          <Select value={form.values.groupClassId} onValueChange={(id) => form.setField("groupClassId", id)}>
            <SelectTrigger id={form.field("groupClassId").id} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value={ALL_CLASSES}>كل الأقسام النشطة</SelectItem>
              {running.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {classLabel(c.id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <div className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground sm:col-span-2">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <p>
            يمكن إعادة التوليد بأمان: الحصة الموجودة لنفس الموعد والتاريخ (منجزة أو ملغاة أو معدّلة) لا تُكرَّر ولا تُغيَّر.
            {year && ` السنة الدراسية الحالية: ${formatShortDate(year.startDate)} — ${formatShortDate(year.endDate)}.`}
          </p>
        </div>
      </FormSection>

      {result && (
        <Alert variant="destructive" className="sm:col-span-2">
          <AlertTriangle aria-hidden />
          <AlertTitle>
            {result.created > 0 ? `تم إنشاء ${countLabels.sessions(result.created)}` : "لم تُنشأ حصص جديدة"}
            {result.skippedExisting > 0 && ` · ${countLabels.sessions(result.skippedExisting)} موجودة مسبقًا`}
          </AlertTitle>
          <AlertDescription>
            {result.skippedConflicts.length > 0 && (
              <>
                <p>لم تُنشأ هذه الحصص لتعارضها مع حصص قائمة (عدّل الحصة القائمة أو الموعد الأسبوعي ثم أعد التوليد):</p>
                <ul className="mt-1 list-inside list-disc space-y-0.5">
                  {result.skippedConflicts.slice(0, 20).map((c) => (
                    <li key={`${c.weeklyScheduleId}|${c.date}`}>
                      {classLabel(c.groupClassId)} · {labels.weekdayShort[weekdayOf(c.date)]} {formatShortDate(c.date)}{" "}
                      <span dir="ltr" className="tabular-nums">{formatTimeRange(c.startTime, c.endTime)}</span> ·{" "}
                      {c.reason === "ROOM" ? "القاعة محجوزة" : "معلم مرتبط بحصة أخرى"}
                    </li>
                  ))}
                </ul>
                {result.skippedConflicts.length > 20 && <p>و{result.skippedConflicts.length - 20} أخرى.</p>}
              </>
            )}
            {result.skippedInactiveSupervisorClassIds.length > 0 && (
              <p className="mt-2">
                أقسام لم تُولَّد حصصها لأن مدرسها المشرف غير نشط (عيّن مشرفًا نشطًا أولًا):{" "}
                {result.skippedInactiveSupervisorClassIds
                  .map((id) => {
                    const c = indexes.classesById.get(id)
                    const supervisor = c && indexes.teachersById.get(c.supervisorId)
                    return `${classLabel(id)}${supervisor ? ` (${fullName(supervisor)})` : ""}`
                  })
                  .join("، ")}
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}
    </FormSheet>
  )
}

/** The page action that opens the generator (admin only). */
export function GenerateSessionsButton({
  lookups,
  today,
  variant = "default",
}: {
  lookups: Lookups
  today: ISODate
  variant?: "default" | "outline"
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button type="button" variant={variant} onClick={() => setOpen(true)}>
        <CalendarPlus />
        توليد الحصص
      </Button>
      {open && <GenerateSessionsSheet open={open} onOpenChange={setOpen} lookups={lookups} today={today} />}
    </>
  )
}
