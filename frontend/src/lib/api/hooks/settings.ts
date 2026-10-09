"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, uploadFile } from "../client"
import type { StoredFileInfo } from "./people"

/** GET /api/admin/settings (sections may be null before the first save/seed). */
export interface AdminSettingsDto {
  association: {
    name: string
    phone: string | null
    email: string | null
    address: string | null
    logoFileId: string | null
    logoUrl: string | null
    updatedAt: string
  } | null
  platform: {
    timezone: string
    dateFormat: "DD_MM_YYYY" | "YYYY_MM_DD"
    defaultCalendarView: "WEEK" | "ROOMS"
    defaultPageSize: number
    updatedAt: string
  } | null
  website: {
    shortDescription: string
    about: string
    history: string | null
    mission: string
    vision: string
    values: string | null
    openingHours: string | null
    mapUrl: string | null
    facebookUrl: string | null
    instagramUrl: string | null
    youtubeUrl: string | null
    registrationEnabled: boolean
    updatedAt: string
  } | null
  currentAcademicYear: { id: string; label: string; startDate: string; endDate: string } | null
}

export type SettingsPatch = {
  association?: Partial<Pick<NonNullable<AdminSettingsDto["association"]>, "name" | "phone" | "email" | "address" | "logoFileId">>
  platform?: Partial<Pick<NonNullable<AdminSettingsDto["platform"]>, "dateFormat" | "defaultCalendarView">> & {
    defaultPageSize?: 10 | 20 | 50
  }
  website?: Partial<Omit<NonNullable<AdminSettingsDto["website"]>, "updatedAt">>
}

export const adminSettingsKey = ["admin-settings"] as const

export function useAdminSettings() {
  return useQuery({
    queryKey: adminSettingsKey,
    queryFn: ({ signal }) => api<AdminSettingsDto>("/admin/settings", { signal }),
  })
}

/**
 * Partial update (only the sent sections/fields). Every cache that shows
 * these values — preferences, the public identity (brand, footer) — is
 * refreshed afterwards.
 */
export function useUpdateSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: SettingsPatch) => api<AdminSettingsDto>("/admin/settings", { method: "PATCH", body: patch }),
    onSuccess: async (saved) => {
      queryClient.setQueryData(adminSettingsKey, saved)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["platform-preferences"] }),
        queryClient.invalidateQueries({ queryKey: ["public"] }),
      ])
    },
  })
}

/** Uploads a new logo (ASSOCIATION_LOGO) and returns its file id, to send as logoFileId. */
export async function uploadLogo(file: File, onProgress?: (percent: number) => void) {
  const stored = await uploadFile<StoredFileInfo>("/files", { purpose: "ASSOCIATION_LOGO" }, file, { onProgress })
  return stored.id
}
