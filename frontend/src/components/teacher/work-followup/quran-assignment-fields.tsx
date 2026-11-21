"use client"

import { BookOpenText, X } from "lucide-react"

import { ChoiceGroup } from "@/components/shared/choice-group"
import { SurahCombobox } from "@/components/quran/surah-combobox"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  ayahCount,
  FIRST_PAGE,
  LAST_PAGE,
  modesForItem,
  pageEnd,
  pageStart,
  withSurah,
  type AssignmentDraft,
  type AssignmentError,
  type AssignmentMode,
  type WorkType,
} from "@/lib/quran-reference/work-assignment"
import { surahByNumber } from "@/lib/quran/surahs"
import { cn } from "@/lib/utils"

export const MODE_LABEL: Record<AssignmentMode, string> = {
  free: "نص حر",
  wholeSurah: "سورة كاملة",
  ayahs: "بالآيات",
  pages: "بالصفحات",
  surahs: "من سورة إلى سورة",
  surah: "سورة كاملة",
}

const name = (n: number) => surahByNumber(n)?.nameAr ?? String(n)

/**
 * The structured part of a work item (حفظ / مراجعة / اختبار / عرضة): a format, then surahs from the
 * searchable combobox, verses limited to the surah's count, or printed pages of the Qalun Mushaf.
 * حفظ: «سورة كاملة» (the surah only) · «بالآيات» (ending verse optional) · «بالصفحات» (ending page
 * optional). Only the current format's fields are shown and sent.
 * Every limit comes from the generated Quran reference; the server re-validates on save.
 */
export function QuranAssignmentFields({
  id,
  type,
  draft,
  onChange,
  error,
  disabled,
  allowFree = false,
}: {
  /** An item saved as free text (legacy): «نص حر» stays offered so it can be kept as written */
  allowFree?: boolean
  id: string
  type: WorkType
  draft: AssignmentDraft
  onChange: (draft: AssignmentDraft) => void
  /** Shown only after a save attempt */
  error?: AssignmentError | null
  disabled?: boolean
}) {
  const modes = modesForItem(type, allowFree)
  const invalid = (field: AssignmentError["field"]) => error?.field === field || undefined
  const set = (patch: Partial<AssignmentDraft>) => onChange({ ...draft, ...patch })
  const number = (key: keyof AssignmentDraft, label: string, opts: { max?: number; min?: number; clearLabel?: string }) => (
    <div className="space-y-1">
      <label htmlFor={`${id}-${key}`} className="text-xs text-muted-foreground">
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <Input
          id={`${id}-${key}`}
          type="number"
          inputMode="numeric"
          min={opts.min ?? 1}
          max={opts.max}
          step={1}
          dir="ltr"
          className="w-28"
          disabled={disabled}
          value={draft[key] as string}
          aria-invalid={invalid(key as AssignmentError["field"])}
          onChange={(e) => set({ [key]: e.target.value })}
        />
        {/* An optional end: one click to clear it (back to a single verse / page) */}
        {opts.clearLabel && draft[key] !== "" && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground"
            aria-label={opts.clearLabel}
            title={opts.clearLabel}
            disabled={disabled}
            onClick={() => set({ [key]: "" })}
          >
            <X />
          </Button>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-3">
      <ChoiceGroup<AssignmentMode>
        label="طريقة تحديد العمل"
        value={draft.mode}
        onChange={(mode) => set({ mode })}
        className={cn(modes.length === 3 ? "grid-cols-3" : "grid-cols-2", modes.length > 3 && "sm:grid-cols-4")}
        choices={modes.map((m) => ({ value: m, label: MODE_LABEL[m] }))}
      />

      {(draft.mode === "ayahs" || draft.mode === "surah" || draft.mode === "wholeSurah") && (
        <div className="space-y-1">
          <label htmlFor={`${id}-surah`} className="text-xs text-muted-foreground">
            السورة
          </label>
          <SurahCombobox
            id={`${id}-surah`}
            value={draft.fromSurah ?? undefined}
            invalid={invalid("fromSurah")}
            onChange={(s) => onChange(withSurah(draft, s))}
          />
          {draft.fromSurah && (
            <p className="text-xs text-muted-foreground">
              {draft.mode === "wholeSurah" ? `سورة ${name(draft.fromSurah)} كاملة — ` : ""}عدد آيات السورة: {ayahCount(draft.fromSurah)}
            </p>
          )}
        </div>
      )}

      {draft.mode === "ayahs" && draft.fromSurah && (
        <div className="flex flex-wrap gap-3">
          {number("fromAyah", "من الآية", { max: ayahCount(draft.fromSurah) })}
          {number("toAyah", "إلى الآية (اختياري)", { max: ayahCount(draft.fromSurah), clearLabel: "إزالة آية النهاية" })}
        </div>
      )}

      {draft.mode === "surahs" && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor={`${id}-from-surah`} className="text-xs text-muted-foreground">
                من سورة
              </label>
              <SurahCombobox id={`${id}-from-surah`} value={draft.fromSurah ?? undefined} invalid={invalid("fromSurah")} onChange={(s) => set({ fromSurah: s, fromAyah: "" })} />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${id}-to-surah`} className="text-xs text-muted-foreground">
                إلى سورة (اختياري)
              </label>
              {/* Optional: without it, the starting surah alone */}
              <div className="flex items-center gap-1.5">
                <SurahCombobox id={`${id}-to-surah`} value={draft.toSurah ?? undefined} invalid={invalid("toSurah")} onChange={(s) => set({ toSurah: s, toAyah: "" })} />
                {draft.toSurah && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 text-muted-foreground"
                    aria-label="إزالة سورة النهاية"
                    title="إزالة سورة النهاية"
                    disabled={disabled}
                    onClick={() => set({ toSurah: null, toAyah: "" })}
                  >
                    <X />
                  </Button>
                )}
              </div>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={draft.precise} onCheckedChange={(v) => set({ precise: v === true, fromAyah: "", toAyah: "" })} disabled={disabled} />
            تحديد الآيات (اختياري)
          </label>
          {/* Without an ending surah the verses belong to the starting surah */}
          {draft.precise && draft.fromSurah && (
            <div className="flex flex-wrap gap-3">
              {number("fromAyah", `من الآية (سورة ${name(draft.fromSurah)})`, { max: ayahCount(draft.fromSurah) })}
              {number("toAyah", `إلى الآية (سورة ${name(draft.toSurah ?? draft.fromSurah)})`, { max: ayahCount(draft.toSurah ?? draft.fromSurah) })}
            </div>
          )}
        </div>
      )}

      {draft.mode === "pages" && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-3">
            {number("fromPage", "من الصفحة", { min: FIRST_PAGE, max: LAST_PAGE })}
            {number("toPage", "إلى الصفحة (اختياري)", { min: FIRST_PAGE, max: LAST_PAGE, clearLabel: "إزالة صفحة النهاية" })}
          </div>
          {/* Without an ending page: the starting page alone */}
          <PagesHint from={Number(draft.fromPage)} to={Number(draft.toPage.trim() || draft.fromPage)} />
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      )}
    </div>
  )
}

/** Page numbering of the association's Mushaf, and the verses the chosen pages hold. */
function PagesHint({ from, to }: { from: number; to: number }) {
  const a = pageStart(from), z = pageEnd(to)
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <BookOpenText className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        ترقيم صفحات المصحف المعتمد (قالون — الطبعة التونسية): من {FIRST_PAGE} إلى {LAST_PAGE}.
        {a && z && from <= to && ` الصفحات المختارة: من سورة ${name(a.surah)} ${a.ayah} إلى سورة ${name(z.surah)} ${z.ayah}.`}
      </span>
    </p>
  )
}
