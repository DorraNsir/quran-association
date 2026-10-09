"use client"

import { CalendarCheck2, CalendarRange, Pencil, Plus } from "lucide-react"
import { useState } from "react"

import { errorMessage } from "@/lib/api/errors"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { FormField, FormSection, FormSheet } from "@/components/shared/form"
import { SectionCard } from "@/components/shared/info-list"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { academicYearErrors, sortAcademicYears, type AcademicYearDraft } from "@/lib/academic-years"
import { formatDate, formatDateRange } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { SEMESTERS } from "@/lib/memorization"
import { QueryState } from "@/components/shared/query-state"
import { keys, useAcademicYears, useApiMutation } from "@/lib/api/academic"
import { api } from "@/lib/api/client"
import { todayInTunis } from "@/lib/dates"
import { cn } from "@/lib/utils"
import type { AcademicYear } from "@/types/domain"

import { SettingsShell } from "./settings-shell"

function yearState(year: AcademicYear, today: string) {
  if (year.isCurrent) return { label: "السنة الحالية", className: "bg-brand-soft text-brand-soft-foreground" }
  if (year.endDate < today) return { label: "سابقة", className: "bg-muted text-muted-foreground" }
  if (year.startDate > today) return { label: "قادمة", className: "bg-muted text-foreground" }
  return { label: "غير معتمدة", className: "bg-muted text-muted-foreground" }
}

/** Next "YYYY–YYYY" label and typical dates after the latest year (editable). */
function suggestDraft(years: AcademicYear[]): AcademicYearDraft {
  const latest = sortAcademicYears(years)[0]
  const first = latest ? Number(latest.endDate.slice(0, 4)) : Number(todayInTunis().slice(0, 4))
  return {
    label: `${first}–${first + 1}`,
    startDate: `${first}-09-15`,
    endDate: `${first + 1}-06-30`,
    semester2StartDate: `${first + 1}-02-01`,
  }
}

const draftOf = (year: AcademicYear): AcademicYearDraft => ({
  id: year.id,
  label: year.label,
  startDate: year.startDate,
  endDate: year.endDate,
  semester2StartDate: year.semesters.SEMESTER_2.startDate,
})

/** Settings that change which year is current refresh every view that defaults to it. */
const yearKeys = [keys.academicYears, ["platform-preferences"], ["admin-settings"]]

function AcademicYearSheet({ open, onOpenChange, year, academicYears }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  year?: AcademicYear
  academicYears: AcademicYear[]
}) {
  const save = useApiMutation(
    ({ label, startDate, endDate, semester2StartDate }: AcademicYearDraft) =>
      year
        ? api(`/admin/academic-years/${year.id}`, { method: "PATCH", body: { label: label.trim(), startDate, endDate, semester2StartDate } })
        : api("/admin/academic-years", { method: "POST", body: { label: label.trim(), startDate, endDate, semester2StartDate } }),
    yearKeys
  )
  const [draft, setDraft] = useState<AcademicYearDraft>(() => (year ? draftOf(year) : suggestDraft(academicYears)))
  const [submitted, setSubmitted] = useState(false)
  const errors = academicYearErrors(draft, academicYears)
  const shown = (key: keyof AcademicYearDraft) => (submitted ? errors[key] : undefined)
  const set = (key: keyof AcademicYearDraft, value: string) => setDraft((d) => ({ ...d, [key]: value }))

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={year ? `تعديل السنة الدراسية ${year.label}` : "إضافة سنة دراسية"}
      description="لكل سنة دراسية سداسيان: يبدأ الأول مع بداية السنة وينتهي في اليوم السابق لبداية الثاني."
      submitLabel={year ? "حفظ التعديلات" : "إضافة"}
      pending={save.isPending}
      error={save.isError ? errorMessage(save.error) : undefined}
      onSubmit={(e) => {
        e.preventDefault()
        setSubmitted(true)
        if (save.isPending || Object.values(errors).some(Boolean)) return
        save.mutate(draft, {
          onSuccess: () => {
            onOpenChange(false)
            toast.success(year ? "تم تعديل السنة الدراسية" : "تمت إضافة السنة الدراسية", {
              description: year?.isCurrent ? "تبقى السنة الحالية." : "يمكنك اعتمادها كسنة حالية متى شئت.",
            })
          },
        })
      }}
    >
      <FormSection title="السنة الدراسية">
        <FormField id="year-label" label="اسم السنة الدراسية" required error={shown("label")} description="مثال: 2027–2028" className="sm:col-span-2">
          <Input id="year-label" dir="ltr" className="text-end" value={draft.label} onChange={(e) => set("label", e.target.value)} aria-invalid={!!shown("label") || undefined} />
        </FormField>
        <FormField id="year-start" label="تاريخ البداية" required error={shown("startDate")}>
          <Input id="year-start" type="date" value={draft.startDate} onChange={(e) => set("startDate", e.target.value)} />
        </FormField>
        <FormField id="year-end" label="تاريخ النهاية" required error={shown("endDate")}>
          <Input id="year-end" type="date" min={draft.startDate} value={draft.endDate} onChange={(e) => set("endDate", e.target.value)} />
        </FormField>
        <FormField id="year-s2" label="بداية السداسي الثاني" required error={shown("semester2StartDate")} description="ينتهي السداسي الأول في اليوم السابق.">
          <Input id="year-s2" type="date" min={draft.startDate} max={draft.endDate} value={draft.semester2StartDate} onChange={(e) => set("semester2StartDate", e.target.value)} />
        </FormField>
      </FormSection>
    </FormSheet>
  )
}

/**
 * Current academic year + the academic-year list. Works on THE Part 4
 * collection: switching the current year only moves the isCurrent flag —
 * memorization, payments, sessions, attendance… keep their own year.
 */
export function AcademicYearSettings() {
  const query = useAcademicYears()
  const [sheet, setSheet] = useState<{ key: number; open: boolean; year?: AcademicYear }>({ key: 0, open: false })
  const openSheet = (year?: AcademicYear) => setSheet((s) => ({ key: s.key + 1, open: true, year }))
  return (
    <SettingsShell
      section="academic-year"
      description="السنة الدراسية الحالية هي المعتمدة افتراضيًا في متابعة الحفظ والمدفوعات وفلاتر الفترات."
      actions={
        <Button onClick={() => openSheet()}>
          <Plus />
          إضافة سنة دراسية
        </Button>
      }
    >
      <QueryState query={query} empty={query.data?.length === 0} emptyIcon={CalendarRange} emptyTitle="لا توجد سنوات دراسية بعد"
        emptyDescription="أضف السنة الدراسية الأولى ثم اعتمدها كسنة حالية.">
        {query.data && <AcademicYearsPanel academicYears={query.data} onEdit={openSheet} />}
      </QueryState>
      <AcademicYearSheet key={sheet.key} open={sheet.open} onOpenChange={(open) => setSheet((s) => ({ ...s, open }))} year={sheet.year}
        academicYears={query.data ?? []} />
    </SettingsShell>
  )
}

function AcademicYearsPanel({ academicYears, onEdit }: { academicYears: AcademicYear[]; onEdit: (year: AcademicYear) => void }) {
  const today = todayInTunis()
  const current = academicYears.find((y) => y.isCurrent)
  const years = sortAcademicYears(academicYears)
  const setCurrent = useApiMutation((id: string) => api(`/admin/academic-years/${id}/set-current`, { method: "POST" }), yearKeys)
  const [selected, setSelected] = useState(current?.id ?? years[0]?.id ?? "")
  const [confirming, setConfirming] = useState<AcademicYear | null>(null)
  const candidate = academicYears.find((y) => y.id === selected)

  return (
    <>
      <SectionCard title="السنة الدراسية الحالية" icon={CalendarCheck2}>
        <div className="space-y-4">
          {current ? (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-2xl font-semibold tabular-nums" dir="ltr">{current.label}</p>
              <p className="text-sm text-muted-foreground">{formatDateRange(current.startDate, current.endDate)}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">لم تُعتمد أي سنة دراسية حالية بعد.</p>
          )}
          <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <label htmlFor="current-year" className="text-sm font-medium">تغيير السنة الحالية</label>
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger id="current-year" className="w-full sm:w-64"><SelectValue /></SelectTrigger>
                <SelectContent position="popper">
                  {years.map((y) => (
                    <SelectItem key={y.id} value={y.id}>
                      <span dir="ltr">{y.label}</span>
                      {y.isCurrent && <span className="text-xs text-muted-foreground">(الحالية)</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" disabled={!candidate || candidate.isCurrent} onClick={() => candidate && setConfirming(candidate)}>
              اعتماد كسنة حالية
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="السنوات الدراسية" icon={CalendarRange}>
        <ul className="divide-y">
          {years.map((year) => {
            const state = yearState(year, today)
            return (
              <li key={year.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <span dir="ltr" className="tabular-nums">{year.label}</span>
                    <Badge className={cn("font-normal", state.className)}>{state.label}</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDate(year.startDate)} — {formatDate(year.endDate)}</p>
                  <ul className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                    {SEMESTERS.map((s) => (
                      <li key={s}>{labels.semester[s]}: {formatDateRange(year.semesters[s].startDate, year.semesters[s].endDate)}</li>
                    ))}
                  </ul>
                </div>
                <div className="flex gap-2">
                  {!year.isCurrent && (
                    <Button size="sm" variant="outline" onClick={() => setConfirming(year)}>اعتماد كسنة حالية</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => onEdit(year)} aria-label={`تعديل ${year.label}`}>
                    <Pencil />
                    تعديل
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          لا تُحذف السنوات الدراسية السابقة: تبقى مرتبطة بسجلات الحفظ والمدفوعات والحصص المسجّلة فيها.
        </p>
      </SectionCard>

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={`اعتماد ${confirming?.label ?? ""} سنةً دراسية حالية؟`}
        description="ستُفتح شاشات متابعة الحفظ والمدفوعات وفلاتر الفترات على هذه السنة افتراضيًا، وتُسجَّل معاليم الطلبة المقبولين فيها. لا تُحذف ولا تُعدَّل أي بيانات مسجّلة في السنوات الأخرى."
        confirmLabel="اعتماد"
        onConfirm={async () => {
          if (!confirming) return
          await setCurrent.mutateAsync(confirming.id)
          setSelected(confirming.id)
          toast.success(`أصبحت ${confirming.label} السنة الدراسية الحالية`)
          setConfirming(null)
        }}
      />
    </>
  )
}
