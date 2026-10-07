import type { AcademicYear, ID, ISODate } from "@/types/domain"

/**
 * Academic years (Part 4 model, two semesters each). The current year is
 * the one flagged isCurrent — there is never a second source of truth.
 */
export function getCurrentAcademicYear(years: AcademicYear[]) {
  return years.find((y) => y.isCurrent) ?? years[years.length - 1]
}

/** Newest first, for lists. */
export function sortAcademicYears(years: AcademicYear[]) {
  return [...years].sort((a, b) => b.startDate.localeCompare(a.startDate))
}

/** Exactly one year is current afterwards; nothing else in the year (or its data) changes. */
export function withCurrentAcademicYear(years: AcademicYear[], id: ID) {
  if (!years.some((y) => y.id === id)) return years
  return years.map((y) => (y.isCurrent === (y.id === id) ? y : { ...y, isCurrent: y.id === id }))
}

const dayBefore = (date: ISODate) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export interface AcademicYearDraft {
  id?: ID
  label: string
  startDate: ISODate
  endDate: ISODate
  /** First day of the second semester (the first one starts with the year) */
  semester2StartDate: ISODate
}

/** Field errors (Arabic) — empty object when the draft is valid. */
export function academicYearErrors(draft: AcademicYearDraft, years: AcademicYear[]) {
  const errors: Partial<Record<keyof AcademicYearDraft, string>> = {}
  const others = years.filter((y) => y.id !== draft.id)
  const label = draft.label.trim()
  if (!label) errors.label = "اسم السنة الدراسية مطلوب"
  else if (others.some((y) => y.label.trim() === label)) errors.label = "توجد سنة دراسية بهذا الاسم"
  if (!draft.startDate) errors.startDate = "تاريخ البداية مطلوب"
  if (!draft.endDate) errors.endDate = "تاريخ النهاية مطلوب"
  else if (draft.startDate && draft.endDate <= draft.startDate) errors.endDate = "يجب أن يكون تاريخ النهاية بعد تاريخ البداية"
  if (!draft.semester2StartDate) errors.semester2StartDate = "تاريخ بداية السداسي الثاني مطلوب"
  else if (draft.startDate && draft.endDate && !(draft.semester2StartDate > draft.startDate && draft.semester2StartDate <= draft.endDate))
    errors.semester2StartDate = "يجب أن يقع بعد بداية السنة وقبل نهايتها"
  if (!errors.startDate && !errors.endDate) {
    const overlap = others.find((y) => draft.startDate <= y.endDate && draft.endDate >= y.startDate)
    if (overlap) errors.endDate = `تتداخل هذه الفترة مع السنة الدراسية ${overlap.label}`
  }
  return errors
}

/** Builds the record (semesters derived from the dates); isCurrent is only changed by withCurrentAcademicYear. */
export function buildAcademicYear(draft: AcademicYearDraft, existing: AcademicYear | undefined, id: ID): AcademicYear {
  return {
    id,
    label: draft.label.trim(),
    startDate: draft.startDate,
    endDate: draft.endDate,
    isCurrent: existing?.isCurrent ?? false,
    semesters: {
      SEMESTER_1: { startDate: draft.startDate, endDate: dayBefore(draft.semester2StartDate) },
      SEMESTER_2: { startDate: draft.semester2StartDate, endDate: draft.endDate },
    },
  }
}
