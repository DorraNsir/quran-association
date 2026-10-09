"use client"

import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"

import { api } from "@/lib/api/client"
import { keys, toAcademicYear, type AcademicYearDto } from "@/lib/api/academic"
import { useAuth } from "@/lib/auth/auth-provider"
import { getCurrentAcademicYear } from "@/lib/academic-years"
import { formatNumericDate } from "@/lib/format"
import type { AcademicYear, ISODate, PlatformSettings } from "@/types/domain"

/** GET /api/platform-preferences — readable by every signed-in role. */
interface PlatformPreferencesDto {
  timezone: string
  dateFormat: "DD_MM_YYYY" | "YYYY_MM_DD"
  defaultCalendarView: "WEEK" | "ROOMS"
  defaultPageSize: number
  currentAcademicYear: {
    id: string
    label: string
    startDate: ISODate
    endDate: ISODate
    firstSemester: { startDate: ISODate; endDate: ISODate }
    secondSemester: { startDate: ISODate; endDate: ISODate }
  } | null
}

export const preferencesKey = ["platform-preferences"] as const

/** Used until the preferences load (identical to the server defaults). */
const DEFAULT_SETTINGS: PlatformSettings = {
  timezone: "Africa/Tunis",
  dateFormat: "DD/MM/YYYY",
  defaultCalendarView: "week",
  defaultPageSize: 10,
  updatedAt: "",
}

function usePreferences() {
  return useQuery({
    queryKey: preferencesKey,
    queryFn: ({ signal }) => api<PlatformPreferencesDto>("/platform-preferences", { signal }),
    staleTime: 5 * 60_000,
  })
}

export function usePlatformSettings(): PlatformSettings {
  const { data } = usePreferences()
  return useMemo(() => {
    if (!data) return DEFAULT_SETTINGS
    const size = data.defaultPageSize
    return {
      timezone: data.timezone,
      dateFormat: data.dateFormat === "YYYY_MM_DD" ? "YYYY-MM-DD" : "DD/MM/YYYY",
      defaultCalendarView: data.defaultCalendarView === "ROOMS" ? "rooms" : "week",
      defaultPageSize: size === 20 || size === 50 ? size : 10,
      updatedAt: "",
    }
  }, [data])
}

export function useAdminDate() {
  const { dateFormat } = usePlatformSettings()
  return (date: ISODate) => formatNumericDate(date, dateFormat)
}

/** The current academic year (flagged isCurrent on the server), for every role. */
export function useCurrentAcademicYear(): AcademicYear | undefined {
  const { data } = usePreferences()
  const year = data?.currentAcademicYear
  return useMemo(
    () =>
      year
        ? toAcademicYear({ ...year, isCurrent: true, semester2StartDate: year.secondSemester.startDate } as AcademicYearDto)
        : undefined,
    [year]
  )
}

/**
 * Academic years for period filters: the full list for administrators
 * (admin API), only the current year for teachers and students (they have
 * no access to the year list).
 */
export function useAcademicYears(): AcademicYear[] {
  const { user } = useAuth()
  const isAdmin = !!user?.roles.includes("ADMIN")
  const current = useCurrentAcademicYear()
  const { data } = useQuery({
    queryKey: [...keys.academicYears, "all"],
    queryFn: async ({ signal }) =>
      (await api<AcademicYearDto[]>("/admin/academic-years", { signal })).map(toAcademicYear),
    enabled: isAdmin,
  })
  return useMemo(() => {
    if (isAdmin && data) return data
    return current ? [current] : []
  }, [isAdmin, data, current])
}

export { getCurrentAcademicYear }
