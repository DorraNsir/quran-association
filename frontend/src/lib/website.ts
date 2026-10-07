import type {
  Achievement,
  AdministrationMember,
  Branch,
  GalleryImage,
  HeroSlide,
  ISODate,
  NewsArticle,
  PublicEvent,
  PublicGroupListing,
  PublicProgram,
  QuranGraduate,
  ServiceOffering,
  Student,
  Teacher,
} from "@/types/domain"

/**
 * Public website selectors — the ONLY way public pages read CMS content.
 * Unpublished / inactive / private items never pass these filters, and
 * nothing here touches operational records beyond aggregate counts.
 */

const byOrder = <T extends { displayOrder: number }>(a: T, b: T) => a.displayOrder - b.displayOrder

export const getActiveHeroSlides = (slides: HeroSlide[]) => slides.filter((s) => s.isActive).sort(byOrder)
export const getPublishedOfferings = (items: ServiceOffering[]) => items.filter((i) => i.isPublished).sort(byOrder)
export const getPublishedPrograms = (items: PublicProgram[]) => items.filter((i) => i.isPublished).sort(byOrder)

/** Announced groups/programs (coming soon or open) — explicitly published only. */
export const getPublicUpcomingGroups = (items: PublicGroupListing[]) =>
  items.filter((i) => i.isPublished && i.publicStatus !== "CLOSED").sort(byOrder)

export type PublicEventStatus = "UPCOMING" | "COMPLETED" | "CANCELLED"

export function publicEventStatus(event: PublicEvent, today: ISODate): PublicEventStatus {
  if (event.isCancelled) return "CANCELLED"
  return (event.endDate ?? event.startDate) < today ? "COMPLETED" : "UPCOMING"
}

/** Both flags are required: an event can be published internally yet not public. */
export const isEventPublic = (event: PublicEvent) => event.isPublic && event.isPublished

export const getUpcomingPublicEvents = (events: PublicEvent[], today: ISODate) =>
  events
    .filter((e) => isEventPublic(e) && publicEventStatus(e, today) !== "COMPLETED")
    .sort((a, b) => a.startDate.localeCompare(b.startDate))

export const getPastPublicEvents = (events: PublicEvent[], today: ISODate) =>
  events
    .filter((e) => isEventPublic(e) && publicEventStatus(e, today) === "COMPLETED")
    .sort((a, b) => b.startDate.localeCompare(a.startDate))

/** Published and not scheduled for later. */
export const getPublishedNews = (items: NewsArticle[], today: ISODate) =>
  items.filter((n) => n.isPublished && n.publishedAt <= today).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))

export const getPublishedGalleryImages = (items: GalleryImage[]) => items.filter((i) => i.isPublished).sort(byOrder)
export const getPublishedGraduates = (items: QuranGraduate[]) => items.filter((i) => i.isPublished).sort(byOrder)
export const getPublishedAdministrationMembers = (items: AdministrationMember[]) => items.filter((i) => i.isPublished).sort(byOrder)

const achievementYear = (a: Achievement) => a.year ?? (a.date ? Number(a.date.slice(0, 4)) : 0)

/** Newest first, then the admin's order. */
export const getPublishedAchievements = (items: Achievement[]) =>
  items.filter((a) => a.isPublished).sort((a, b) => achievementYear(b) - achievementYear(a) || a.displayOrder - b.displayOrder)

/** Featured is a preference for the home page — it never overrides isPublished. */
export const getFeaturedAchievements = (items: Achievement[], limit = 4) =>
  getPublishedAchievements(items).filter((a) => a.isFeatured).slice(0, limit)

export { achievementYear }

/** Aggregate counts only — derived from the shared data, never hardcoded. */
export function getPublicStatistics({
  students,
  teachers,
  branches,
  graduates,
}: {
  students: Pick<Student, "status">[]
  teachers: Pick<Teacher, "status">[]
  branches: Pick<Branch, "status">[]
  graduates: QuranGraduate[]
}) {
  return {
    students: students.filter((s) => s.status === "ACTIVE").length,
    teachers: teachers.filter((t) => t.status === "ACTIVE").length,
    branches: branches.filter((b) => b.status === "ACTIVE").length,
    graduates: getPublishedGraduates(graduates).length,
  }
}

/** Public branch info: name, address and public phone only. */
export const getPublicBranches = (branches: Branch[]) =>
  branches.filter((b) => b.status === "ACTIVE").map(({ id, name, address, phone }) => ({ id, name, address, phone }))

export const paragraphs = (text?: string) => (text ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
export const lines = (text?: string) => (text ?? "").split("\n").map((l) => l.trim()).filter(Boolean)
