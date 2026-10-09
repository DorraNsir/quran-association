import { connection } from "next/server"
import { cache } from "react"

import type {
  Achievement,
  AchievementCategory,
  AdministrationMember,
  GalleryCategory,
  GalleryImage,
  HeroSlide,
  NewsArticle,
  PublicEvent,
  PublicGroupListing,
  PublicGroupStatus,
  PublicProgram,
  QuranGraduate,
  ServiceOffering,
} from "@/types/domain"

import { apiUrl, serverApiUrl } from "./config"
import { ApiError, toApiError } from "./errors"
import type { PublicSiteSettings } from "./public-settings"

/*
 * Public website data (Part 10.9 APIs), read by server components at
 * request time (no-store: CMS edits show on the next visit). Only
 * published / public content ever reaches these endpoints. The adapters
 * map the API DTOs to the display types the website blocks already use.
 */

async function publicGet<T>(path: string, query: Record<string, string | number> = {}): Promise<T> {
  // Rendered per request (never prerendered at build): CMS changes show on the next visit
  await connection()
  const search = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString()
  let response: Response
  try {
    response = await fetch(`${serverApiUrl()}${path}${search ? `?${search}` : ""}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "تعذّر الاتصال بالخادم.")
  }
  const body: unknown = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) throw toApiError(response.status, body)
  return body as T
}

/** A detail that does not exist (or is not public) → null, for notFound(). */
async function publicGetOrNull<T>(path: string): Promise<T | null> {
  try {
    return await publicGet<T>(path)
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return null
    throw error
  }
}

/** Paginated public lists ({data, meta}): every page, 100 per request. */
async function publicAll<T>(path: string, query: Record<string, string | number> = {}, maxPages = 20): Promise<T[]> {
  const rows: T[] = []
  for (let page = 1; page <= maxPages; page++) {
    const result = await publicGet<{ data: T[]; meta: { totalPages: number } }>(path, { ...query, page, pageSize: 100 })
    rows.push(...result.data)
    if (page >= result.meta.totalPages) break
  }
  return rows
}

/** Bundled "/website/…" assets stay relative; uploaded files are served by the API. */
const media = (url: string | null | undefined) => (url ? (url.startsWith("/api/") ? apiUrl(url) : url) : undefined)
const opt = <T>(value: T | null | undefined) => value ?? undefined
const STAMP = { createdAt: "", updatedAt: "" }

/* ------------------------------ DTOs ------------------------------ */

interface HeroSlideDto { id: string; imageUrl: string | null; title: string | null; subtitle: string | null; ctaLabel: string | null; ctaHref: string | null; displayOrder: number }
interface ServiceDto { id: string; title: string; description: string | null; icon: string | null; displayOrder: number }
interface ProgramDto { id: string; title: string; description: string; imageUrl: string | null; icon: string | null; displayOrder: number }
interface GroupListingDto {
  id: string; title: string; audience: string; description: string | null; groupId: string | null
  branch: { id: string; name: string } | null; startDate: string | null; schedule: string | null; imageUrl: string | null
  publicStatus: PublicGroupStatus; registrationOpen: boolean; displayOrder: number
}
interface EventDto {
  id: string; title: string; description: string; startDate: string; endDate: string | null; time: string | null
  location: string | null; imageUrl: string | null; status: "UPCOMING" | "COMPLETED" | "CANCELLED"
}
interface AchievementDto {
  id: string; title: string; description: string; date: string | null; year: number | null; imageUrl: string | null
  category: AchievementCategory | null; isFeatured: boolean; displayOrder: number
}
interface GraduateDto { id: string; fullName: string; photoUrl: string | null; completionYear: number | null; completionDate: string | null; shortMessage: string | null; displayOrder: number }
interface MemberDto { id: string; fullName: string; role: string; photoUrl: string | null; shortBio: string | null; displayOrder: number }
interface NewsDto { id: string; title: string; excerpt: string; content?: string; coverImageUrl: string | null; publishedAt: string }
interface GalleryDto { id: string; imageUrl: string | null; title: string | null; description: string | null; category: GalleryCategory | null; displayOrder: number }
export interface PublicBranch { id: string; name: string; address: string; phone: string | null }
export interface PublicStatistics { students: number; teachers: number; branches: number; graduates: number }

/* ------------------------------ adapters ------------------------------ */

const toSlide = (s: HeroSlideDto): HeroSlide => ({
  ...STAMP, id: s.id, imageUrl: media(s.imageUrl) ?? "", titleAr: opt(s.title), subtitleAr: opt(s.subtitle),
  ctaLabelAr: opt(s.ctaLabel), ctaHref: opt(s.ctaHref), displayOrder: s.displayOrder, isActive: true,
})
const toOffering = (s: ServiceDto): ServiceOffering => ({
  ...STAMP, id: s.id, titleAr: s.title, descriptionAr: opt(s.description), icon: opt(s.icon), displayOrder: s.displayOrder, isPublished: true,
})
const toProgram = (p: ProgramDto): PublicProgram => ({
  ...STAMP, id: p.id, titleAr: p.title, descriptionAr: p.description, imageUrl: media(p.imageUrl), icon: opt(p.icon),
  displayOrder: p.displayOrder, isPublished: true,
})
export type PublicGroupCard = PublicGroupListing & { branchName?: string }
const toGroup = (g: GroupListingDto): PublicGroupCard => ({
  ...STAMP, id: g.id, groupId: opt(g.groupId), titleAr: g.title, audienceAr: g.audience, descriptionAr: opt(g.description),
  branchId: g.branch?.id, branchName: g.branch?.name, startDate: opt(g.startDate), scheduleAr: opt(g.schedule),
  imageUrl: media(g.imageUrl), publicStatus: g.publicStatus, registrationOpen: g.registrationOpen, displayOrder: g.displayOrder, isPublished: true,
})
const toEvent = (e: EventDto): PublicEvent => ({
  ...STAMP, id: e.id, titleAr: e.title, descriptionAr: e.description, startDate: e.startDate, endDate: opt(e.endDate),
  time: opt(e.time), location: opt(e.location), imageUrl: media(e.imageUrl), isPublic: true, isPublished: true,
  isCancelled: e.status === "CANCELLED",
})
const toAchievement = (a: AchievementDto): Achievement => ({
  ...STAMP, id: a.id, titleAr: a.title, descriptionAr: a.description, date: opt(a.date), year: opt(a.year),
  imageUrl: media(a.imageUrl), category: opt(a.category), isFeatured: a.isFeatured, isPublished: true, displayOrder: a.displayOrder,
})
const toGraduate = (g: GraduateDto): QuranGraduate => ({
  ...STAMP, id: g.id, fullName: g.fullName, photoUrl: media(g.photoUrl), completionYear: opt(g.completionYear),
  completionDate: opt(g.completionDate), shortMessage: opt(g.shortMessage), displayOrder: g.displayOrder, isPublished: true,
})
const toMember = (m: MemberDto): AdministrationMember => ({
  ...STAMP, id: m.id, fullName: m.fullName, roleAr: m.role, photoUrl: media(m.photoUrl), shortBioAr: opt(m.shortBio),
  displayOrder: m.displayOrder, isPublished: true,
})
const toNews = (n: NewsDto): NewsArticle => ({
  ...STAMP, id: n.id, titleAr: n.title, excerptAr: n.excerpt, contentAr: n.content ?? "", coverImageUrl: media(n.coverImageUrl),
  publishedAt: n.publishedAt, isPublished: true,
})
const toGallery = (g: GalleryDto): GalleryImage => ({
  ...STAMP, id: g.id, imageUrl: media(g.imageUrl) ?? "", titleAr: opt(g.title), descriptionAr: opt(g.description),
  category: opt(g.category), displayOrder: g.displayOrder, isPublished: true,
})

/* ------------------------------ reads ------------------------------ */

/** Deduplicated per request (the site layout and the page both read it). */
export const getSiteSettings = cache(() => publicGet<PublicSiteSettings>("/public/site-settings"))

export async function getHome() {
  const home = await publicGet<{
    settings: PublicSiteSettings | null
    heroSlides: HeroSlideDto[]
    services: ServiceDto[]
    programs: ProgramDto[]
    upcomingGroups: GroupListingDto[]
    upcomingEvents: EventDto[]
    featuredAchievements: AchievementDto[]
    graduates: GraduateDto[]
    news: NewsDto[]
    gallery: GalleryDto[]
    statistics: PublicStatistics
  }>("/public/home")
  return {
    settings: home.settings,
    slides: home.heroSlides.filter((s) => s.imageUrl).map(toSlide),
    offerings: home.services.map(toOffering),
    programs: home.programs.map(toProgram),
    groups: home.upcomingGroups.map(toGroup),
    events: home.upcomingEvents.map(toEvent),
    featured: home.featuredAchievements.map(toAchievement),
    graduates: home.graduates.map(toGraduate),
    news: home.news.map(toNews),
    gallery: home.gallery.filter((g) => g.imageUrl).map(toGallery),
    statistics: home.statistics,
  }
}

export const getBranches = () => publicGet<PublicBranch[]>("/public/branches")
export const getServices = async () => (await publicGet<ServiceDto[]>("/public/services")).map(toOffering)
export const getPrograms = async () => (await publicGet<ProgramDto[]>("/public/programs")).map(toProgram)
export const getUpcomingGroups = async () => (await publicGet<GroupListingDto[]>("/public/upcoming-groups")).map(toGroup)
export const getEvents = async (period: "UPCOMING" | "PAST") => (await publicAll<EventDto>("/public/events", { period })).map(toEvent)
export const getAchievements = async () => (await publicGet<AchievementDto[]>("/public/achievements")).map(toAchievement)
export const getGraduates = async () => (await publicGet<GraduateDto[]>("/public/graduates")).map(toGraduate)
export const getMembers = async () => (await publicGet<MemberDto[]>("/public/administration-members")).map(toMember)
export const getNews = async () => (await publicAll<NewsDto>("/public/news")).map(toNews)
export const getGallery = async () => (await publicAll<GalleryDto>("/public/gallery")).filter((g) => g.imageUrl).map(toGallery)

/** Deduplicated per request (metadata + page read the same article). */
export const getNewsArticle = cache(async (id: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const article = await publicGetOrNull<NewsDto>(`/public/news/${id}`)
  return article ? toNews(article) : null
})

/** Statistics are only part of the home bundle. */
export const getStatistics = async () => (await getHome()).statistics
