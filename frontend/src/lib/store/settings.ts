import { getCurrentAcademicYear } from "@/lib/academic-years"
import { formatNumericDate } from "@/lib/format"
import type { ISODate } from "@/types/domain"

import { useOperations } from "./operations"

/** THE academic-year collection (Part 4 model) — Settings edits it, every view reads it. */
export function useAcademicYears() {
  return useOperations().academicYears
}

export function useCurrentAcademicYear() {
  return getCurrentAcademicYear(useOperations().academicYears)
}

export function usePlatformSettings() {
  return useOperations().platformSettings
}

/** Numeric administrative date in the configured format (07/10/2026 or 2026-10-07); the ISO value is unchanged. */
export function useAdminDate() {
  const { dateFormat } = useOperations().platformSettings
  return (date: ISODate) => formatNumericDate(date, dateFormat)
}
