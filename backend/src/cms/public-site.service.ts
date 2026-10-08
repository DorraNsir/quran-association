import { Injectable } from '@nestjs/common';

import { fromDbDate, fromDbDateOrNull, toDbDate } from '../common/dates.js';
import { PageSizeService } from '../common/page-size.service.js';
import { paginationMeta } from '../common/pagination.js';
import { platformToday } from '../common/platform-clock.js';
import {
  ActivationStatus,
  type Prisma,
  PublicGroupStatus,
  RecordStatus,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { fromDbTime } from '../scheduling/time.js';
import type {
  PublicAchievementDto,
  PublicAchievementQueryDto,
  PublicBranchDto,
  PublicEventDto,
  PublicEventQueryDto,
  PublicGalleryQueryDto,
  PublicGraduateDto,
  PublicGroupListingDto,
  PublicHeroSlideDto,
  PublicHomeDto,
  PublicMemberDto,
  PublicNewsDto,
  PublicNewsQueryDto,
  PublicNewsSummaryDto,
  PublicProgramDto,
  PublicServiceDto,
  PublicSiteSettingsDto,
  PublicStatisticsDto,
} from './cms.dto.js';
import { publicFileUrl } from '../files/files.service.js';
import { cmsNotFound } from './cms.service.js';
import { eventStatus } from './collections.js';

type MediaKeys = 'imageFileId' | 'photoFileId' | 'coverImageFileId';
const MEDIA_PAIRS = [
  ['imageUrl', 'imageFileId'],
  ['photoUrl', 'photoFileId'],
  ['coverImageUrl', 'coverImageFileId'],
] as const;

/**
 * Public image reference: the uploaded file's PUBLIC path (served only
 * while some public content references it) or the bundled asset path.
 * File ids are not part of the public responses.
 */
function publicMedia<T extends object>(row: T): Omit<T, MediaKeys> {
  const out = { ...row } as Record<string, unknown>;
  for (const [field, fileField] of MEDIA_PAIRS) {
    if (!(fileField in out)) continue;
    const fileId = out[fileField] as string | null;
    if (fileId) out[field] = publicFileUrl(fileId);
    delete out[fileField];
  }
  return out as Omit<T, MediaKeys>;
}

/** Upper bound of the small, unpaginated public lists. */
const LIST_LIMIT = 100;
const HOME = {
  heroSlides: 10,
  services: 6,
  programs: 3,
  groups: 3,
  events: 3,
  achievements: 4,
  graduates: 4,
  news: 3,
  gallery: 5,
};

const byOrder = [
  { displayOrder: 'asc' },
  { createdAt: 'asc' },
  { id: 'asc' },
] as const;

/* Explicit public projections: only these columns ever leave the database. */
const slideSelect = {
  id: true,
  imageUrl: true,
  imageFileId: true,
  title: true,
  subtitle: true,
  ctaLabel: true,
  ctaHref: true,
  displayOrder: true,
} satisfies Prisma.HeroSlideSelect;
const serviceSelect = {
  id: true,
  title: true,
  description: true,
  icon: true,
  displayOrder: true,
} satisfies Prisma.ServiceOfferingSelect;
const programSelect = {
  id: true,
  title: true,
  description: true,
  imageUrl: true,
  imageFileId: true,
  icon: true,
  displayOrder: true,
} satisfies Prisma.PublicProgramSelect;
const groupSelect = {
  id: true,
  title: true,
  audience: true,
  description: true,
  groupId: true,
  branch: { select: { id: true, name: true, status: true } },
  startDate: true,
  schedule: true,
  imageUrl: true,
  imageFileId: true,
  publicStatus: true,
  registrationOpen: true,
  displayOrder: true,
} satisfies Prisma.PublicGroupListingSelect;
const eventSelect = {
  id: true,
  title: true,
  description: true,
  startDate: true,
  endDate: true,
  time: true,
  location: true,
  imageUrl: true,
  imageFileId: true,
  isCancelled: true,
} satisfies Prisma.PublicEventSelect;
const achievementSelect = {
  id: true,
  title: true,
  description: true,
  date: true,
  year: true,
  imageUrl: true,
  imageFileId: true,
  category: true,
  isFeatured: true,
  displayOrder: true,
} satisfies Prisma.AchievementSelect;
/** No studentId, no consent details: name, year, message and photo only. */
const graduateSelect = {
  id: true,
  fullName: true,
  photoUrl: true,
  photoFileId: true,
  completionYear: true,
  completionDate: true,
  shortMessage: true,
  displayOrder: true,
} satisfies Prisma.QuranGraduateSelect;
/** No link to platform accounts. */
const memberSelect = {
  id: true,
  fullName: true,
  role: true,
  photoUrl: true,
  photoFileId: true,
  shortBio: true,
  displayOrder: true,
} satisfies Prisma.AdministrationMemberSelect;
const newsSummarySelect = {
  id: true,
  title: true,
  excerpt: true,
  coverImageUrl: true,
  coverImageFileId: true,
  publishedAt: true,
} satisfies Prisma.NewsArticleSelect;
const gallerySelect = {
  id: true,
  imageUrl: true,
  imageFileId: true,
  title: true,
  description: true,
  category: true,
  displayOrder: true,
} satisfies Prisma.GalleryImageSelect;

type GroupRow = Prisma.PublicGroupListingGetPayload<{
  select: typeof groupSelect;
}>;
type EventRow = Prisma.PublicEventGetPayload<{ select: typeof eventSelect }>;
type AchievementRow = Prisma.AchievementGetPayload<{
  select: typeof achievementSelect;
}>;
type GraduateRow = Prisma.QuranGraduateGetPayload<{
  select: typeof graduateSelect;
}>;
type NewsRow = Prisma.NewsArticleGetPayload<{
  select: typeof newsSummarySelect;
}>;

/**
 * The public website (no authentication, read-only). Every query applies the
 * content's public rule and projects explicit columns; hidden, draft,
 * future-dated, internal or cancelled-and-private content is indistinguishable
 * from missing content (404 CMS_CONTENT_NOT_FOUND). Calendar rules use the
 * platform day (Africa/Tunis).
 */
@Injectable()
export class PublicSiteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pageSizes: PageSizeService,
  ) {}

  /* ------------------------------ public rules ------------------------------ */

  private readonly visible = {
    slides: { isActive: true },
    services: { isPublished: true },
    programs: { isPublished: true },
    groups: {
      isPublished: true,
      publicStatus: { not: PublicGroupStatus.CLOSED },
    } satisfies Prisma.PublicGroupListingWhereInput,
    events: { isPublished: true, isPublic: true },
    achievements: { isPublished: true },
    graduates: { isPublished: true, consentRecordedAt: { not: null } },
    members: { isPublished: true },
    gallery: { isPublished: true },
  };

  private newsVisible(today: string): Prisma.NewsArticleWhereInput {
    return { isPublished: true, publishedAt: { lte: toDbDate(today) } };
  }

  private eventsUpcoming(today: string): Prisma.PublicEventWhereInput {
    const day = toDbDate(today);
    // Not finished yet: ends today or later (single-day events: starts today or later)
    return {
      ...this.visible.events,
      OR: [
        { endDate: { gte: day } },
        { endDate: null, startDate: { gte: day } },
      ],
    };
  }

  private eventsPast(today: string): Prisma.PublicEventWhereInput {
    const day = toDbDate(today);
    return {
      ...this.visible.events,
      OR: [{ endDate: { lt: day } }, { endDate: null, startDate: { lt: day } }],
    };
  }

  /* ------------------------------ mappers ------------------------------ */

  private group(g: GroupRow): PublicGroupListingDto {
    const { branch, startDate, ...rest } = g;
    return {
      ...publicMedia(rest),
      startDate: fromDbDateOrNull(startDate),
      // An inactive branch is not shown publicly
      branch:
        branch && branch.status === ActivationStatus.ACTIVE
          ? { id: branch.id, name: branch.name }
          : null,
    };
  }

  private toEvent(e: EventRow, today: string): PublicEventDto {
    const { startDate, endDate, time, isCancelled, ...rest } = e;
    return {
      ...publicMedia(rest),
      startDate: fromDbDate(startDate),
      endDate: fromDbDateOrNull(endDate),
      time: time ? fromDbTime(time) : null,
      status: eventStatus({ isCancelled, startDate, endDate }, today),
    };
  }

  private achievement(a: AchievementRow): PublicAchievementDto {
    return { ...publicMedia(a), date: fromDbDateOrNull(a.date) };
  }

  private graduate(g: GraduateRow): PublicGraduateDto {
    return {
      ...publicMedia(g),
      completionDate: fromDbDateOrNull(g.completionDate),
    };
  }

  private news(n: NewsRow): PublicNewsSummaryDto {
    return { ...publicMedia(n), publishedAt: fromDbDate(n.publishedAt) };
  }

  /* ------------------------------ endpoints ------------------------------ */

  async siteSettings(): Promise<PublicSiteSettingsDto> {
    const settings = await this.loadSettings();
    if (!settings) throw cmsNotFound();
    return settings;
  }

  /** Published-only, bounded sections of the home page — in parallel, no N+1. */
  async home(): Promise<PublicHomeDto> {
    const today = await platformToday(this.prisma);
    const db = this.prisma;
    const [
      settings,
      heroSlides,
      services,
      programs,
      groups,
      events,
      achievements,
      graduates,
      news,
      gallery,
      statistics,
    ] = await Promise.all([
      this.loadSettings(),
      db.heroSlide.findMany({
        where: this.visible.slides,
        select: slideSelect,
        orderBy: [...byOrder],
        take: HOME.heroSlides,
      }),
      db.serviceOffering.findMany({
        where: this.visible.services,
        select: serviceSelect,
        orderBy: [...byOrder],
        take: HOME.services,
      }),
      db.publicProgram.findMany({
        where: this.visible.programs,
        select: programSelect,
        orderBy: [...byOrder],
        take: HOME.programs,
      }),
      db.publicGroupListing.findMany({
        where: this.visible.groups,
        select: groupSelect,
        orderBy: [...byOrder],
        take: HOME.groups,
      }),
      db.publicEvent.findMany({
        where: this.eventsUpcoming(today),
        select: eventSelect,
        orderBy: [{ startDate: 'asc' }, { time: 'asc' }, { id: 'asc' }],
        take: HOME.events,
      }),
      db.achievement.findMany({
        where: { ...this.visible.achievements, isFeatured: true },
        select: achievementSelect,
        orderBy: this.achievementOrder(),
        take: HOME.achievements,
      }),
      db.quranGraduate.findMany({
        where: this.visible.graduates,
        select: graduateSelect,
        orderBy: [...byOrder],
        take: HOME.graduates,
      }),
      db.newsArticle.findMany({
        where: this.newsVisible(today),
        select: newsSummarySelect,
        orderBy: [
          { publishedAt: 'desc' },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        take: HOME.news,
      }),
      db.galleryImage.findMany({
        where: this.visible.gallery,
        select: gallerySelect,
        orderBy: [...byOrder],
        take: HOME.gallery,
      }),
      this.statistics(),
    ]);
    return {
      settings,
      heroSlides: heroSlides.map((r) => publicMedia(r)),
      services,
      programs: programs.map((r) => publicMedia(r)),
      upcomingGroups: groups.map((g) => this.group(g)),
      upcomingEvents: events.map((e) => this.toEvent(e, today)),
      featuredAchievements: achievements.map((a) => this.achievement(a)),
      graduates: graduates.map((g) => this.graduate(g)),
      news: news.map((n) => this.news(n)),
      gallery: gallery.map((r) => publicMedia(r)),
      statistics,
    };
  }

  async heroSlides(): Promise<PublicHeroSlideDto[]> {
    const rows = await this.prisma.heroSlide.findMany({
      where: this.visible.slides,
      select: slideSelect,
      orderBy: [...byOrder],
      take: LIST_LIMIT,
    });
    return rows.map((r) => publicMedia(r));
  }

  services(): Promise<PublicServiceDto[]> {
    return this.prisma.serviceOffering.findMany({
      where: this.visible.services,
      select: serviceSelect,
      orderBy: [...byOrder],
      take: LIST_LIMIT,
    });
  }

  async programs(): Promise<PublicProgramDto[]> {
    const rows = await this.prisma.publicProgram.findMany({
      where: this.visible.programs,
      select: programSelect,
      orderBy: [...byOrder],
      take: LIST_LIMIT,
    });
    return rows.map((r) => publicMedia(r));
  }

  async program(id: string): Promise<PublicProgramDto> {
    const row = await this.prisma.publicProgram.findFirst({
      where: { id, ...this.visible.programs },
      select: programSelect,
    });
    if (!row) throw cmsNotFound();
    return publicMedia(row);
  }

  async upcomingGroups(): Promise<PublicGroupListingDto[]> {
    const rows = await this.prisma.publicGroupListing.findMany({
      where: this.visible.groups,
      select: groupSelect,
      orderBy: [...byOrder],
      take: LIST_LIMIT,
    });
    return rows.map((g) => this.group(g));
  }

  async events(query: PublicEventQueryDto) {
    const today = await platformToday(this.prisma);
    const pageSize = await this.pageSizes.resolve(query.pageSize);
    const past = query.period === 'PAST';
    const where = {
      ...(past ? this.eventsPast(today) : this.eventsUpcoming(today)),
      ...(query.search
        ? {
            AND: [
              {
                OR: [
                  { title: { contains: query.search, mode: 'insensitive' } },
                  {
                    description: {
                      contains: query.search,
                      mode: 'insensitive',
                    },
                  },
                ],
              },
            ],
          }
        : {}),
    } satisfies Prisma.PublicEventWhereInput;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.publicEvent.count({ where }),
      this.prisma.publicEvent.findMany({
        where,
        select: eventSelect,
        // Upcoming: soonest first · past: most recent first
        orderBy: past
          ? [{ startDate: 'desc' }, { time: 'desc' }, { id: 'desc' }]
          : [{ startDate: 'asc' }, { time: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map((e) => this.toEvent(e, today)),
      meta: paginationMeta(query.page, pageSize, total),
    };
  }

  async event(id: string): Promise<PublicEventDto> {
    const today = await platformToday(this.prisma);
    const row = await this.prisma.publicEvent.findFirst({
      where: { id, ...this.visible.events },
      select: eventSelect,
    });
    if (!row) throw cmsNotFound();
    return this.toEvent(row, today);
  }

  async achievements(
    query: PublicAchievementQueryDto,
  ): Promise<PublicAchievementDto[]> {
    const rows = await this.prisma.achievement.findMany({
      where: {
        ...this.visible.achievements,
        ...(query.featured !== undefined ? { isFeatured: query.featured } : {}),
      },
      select: achievementSelect,
      orderBy: this.achievementOrder(),
      take: LIST_LIMIT,
    });
    return rows.map((a) => this.achievement(a));
  }

  async graduates(): Promise<PublicGraduateDto[]> {
    const rows = await this.prisma.quranGraduate.findMany({
      where: this.visible.graduates,
      select: graduateSelect,
      orderBy: [...byOrder],
      take: LIST_LIMIT,
    });
    return rows.map((g) => this.graduate(g));
  }

  async administrationMembers(): Promise<PublicMemberDto[]> {
    const rows = await this.prisma.administrationMember.findMany({
      where: this.visible.members,
      select: memberSelect,
      orderBy: [...byOrder],
      take: LIST_LIMIT,
    });
    return rows.map((r) => publicMedia(r));
  }

  async newsList(query: PublicNewsQueryDto) {
    const today = await platformToday(this.prisma);
    const pageSize = await this.pageSizes.resolve(query.pageSize);
    const where: Prisma.NewsArticleWhereInput = {
      ...this.newsVisible(today),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { excerpt: { contains: query.search, mode: 'insensitive' } },
              { content: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.newsArticle.count({ where }),
      this.prisma.newsArticle.findMany({
        where,
        select: newsSummarySelect,
        orderBy: [
          { publishedAt: 'desc' },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        skip: (query.page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map((n) => this.news(n)),
      meta: paginationMeta(query.page, pageSize, total),
    };
  }

  async newsArticle(id: string): Promise<PublicNewsDto> {
    const today = await platformToday(this.prisma);
    const row = await this.prisma.newsArticle.findFirst({
      where: { id, ...this.newsVisible(today) },
      select: { ...newsSummarySelect, content: true },
    });
    if (!row) throw cmsNotFound();
    return { ...publicMedia(row), publishedAt: fromDbDate(row.publishedAt) };
  }

  async gallery(query: PublicGalleryQueryDto) {
    const pageSize = await this.pageSizes.resolve(query.pageSize);
    const where: Prisma.GalleryImageWhereInput = {
      ...this.visible.gallery,
      ...(query.category ? { category: query.category } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.galleryImage.count({ where }),
      this.prisma.galleryImage.findMany({
        where,
        select: gallerySelect,
        orderBy: [...byOrder],
        skip: (query.page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map((r) => publicMedia(r)),
      meta: paginationMeta(query.page, pageSize, total),
    };
  }

  /** Active branches: name, address and public phone only. */
  branches(): Promise<PublicBranchDto[]> {
    return this.prisma.branch.findMany({
      where: { status: ActivationStatus.ACTIVE },
      select: { id: true, name: true, address: true, phone: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: LIST_LIMIT,
    });
  }

  /* ------------------------------ helpers ------------------------------ */

  /** Newest year first (the year defaults to the date's), then the admin's order. */
  private achievementOrder(): Prisma.AchievementOrderByWithRelationInput[] {
    return [
      { year: { sort: 'desc', nulls: 'last' } },
      { displayOrder: 'asc' },
      { id: 'asc' },
    ];
  }

  /** Aggregate counts only (no record ever leaves the database). */
  private async statistics(): Promise<PublicStatisticsDto> {
    const [students, teachers, branches, graduates] = await Promise.all([
      this.prisma.student.count({ where: { status: RecordStatus.ACTIVE } }),
      this.prisma.teacher.count({ where: { status: ActivationStatus.ACTIVE } }),
      this.prisma.branch.count({ where: { status: ActivationStatus.ACTIVE } }),
      this.prisma.quranGraduate.count({ where: this.visible.graduates }),
    ]);
    return { students, teachers, branches, graduates };
  }

  /** Identity (AssociationSettings) + presentation (SiteSettings); null if not configured. */
  private async loadSettings(): Promise<PublicSiteSettingsDto | null> {
    const [association, site] = await Promise.all([
      this.prisma.associationSettings.findUnique({
        where: { id: 1 },
        select: {
          name: true,
          logoFileId: true,
          address: true,
          phone: true,
          email: true,
        },
      }),
      this.prisma.siteSettings.findUnique({
        where: { id: 1 },
        select: {
          shortDescription: true,
          about: true,
          history: true,
          mission: true,
          vision: true,
          values: true,
          openingHours: true,
          mapUrl: true,
          facebookUrl: true,
          instagramUrl: true,
          youtubeUrl: true,
          registrationEnabled: true,
        },
      }),
    ]);
    if (!association || !site) return null;
    const { facebookUrl, instagramUrl, youtubeUrl, ...presentation } = site;
    const { logoFileId, ...identity } = association;
    return {
      ...identity,
      // The approved uploaded logo (null: the frontend's bundled logo)
      logoUrl: logoFileId ? publicFileUrl(logoFileId) : null,
      ...presentation,
      social: {
        facebook: facebookUrl,
        instagram: instagramUrl,
        youtube: youtubeUrl,
      },
    };
  }
}
