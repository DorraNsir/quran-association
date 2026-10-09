"use client"

import { useQuery } from "@tanstack/react-query"

import { api } from "./client"
import { apiUrl } from "./config"

/** GET /api/public/site-settings — public identity + website presentation. */
export interface PublicSiteSettings {
  name: string
  logoUrl: string | null
  address: string | null
  phone: string | null
  email: string | null
  shortDescription: string
  about: string
  history: string | null
  mission: string
  vision: string
  values: string | null
  openingHours: string | null
  mapUrl: string | null
  social: { facebook: string | null; instagram: string | null; youtube: string | null }
  registrationEnabled: boolean
}

export const FALLBACK_ASSOCIATION_NAME = "الفرع المحلي عمر بن الخطاب بدار شعبان الفهري"

/** Public (no token) — used by the brand in every workspace and on the login page. */
export function usePublicSiteSettings() {
  return useQuery({
    queryKey: ["public", "site-settings"],
    queryFn: ({ signal }) => api<PublicSiteSettings>("/public/site-settings", { auth: false, signal }),
    staleTime: 5 * 60_000,
    retry: 1,
  })
}

/** The approved logo's absolute URL, or null for the bundled logo. */
export const logoSrc = (settings?: Pick<PublicSiteSettings, "logoUrl"> | null) =>
  settings?.logoUrl ? apiUrl(settings.logoUrl) : null
