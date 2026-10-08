import type { Type } from '@nestjs/common';

import { ageOn } from '../academic/students/students.service.js';
import { fromDbDate, fromDbDateOrNull } from '../common/dates.js';
import { badRequest } from '../common/errors.js';
import type { Prisma } from '../generated/prisma/client.js';
import { ConsentGiver } from '../generated/prisma/enums.js';
import {
  AchievementDto,
  AchievementInputDto,
  AchievementUpdateDto,
  EventDto,
  EventInputDto,
  EventUpdateDto,
  type EventStatus,
  GalleryImageDto,
  GalleryInputDto,
  GalleryUpdateDto,
  GraduateDto,
  GraduateInputDto,
  GraduateUpdateDto,
  GroupListingDto,
  GroupListingInputDto,
  GroupListingUpdateDto,
  HeroSlideDto,
  HeroSlideInputDto,
  HeroSlideUpdateDto,
  MemberDto,
  MemberInputDto,
  MemberUpdateDto,
  NewsDto,
  NewsInputDto,
  NewsUpdateDto,
  ProgramDto,
  ProgramInputDto,
  ProgramUpdateDto,
  ServiceDto,
  ServiceInputDto,
  ServiceUpdateDto,
} from './cms.dto.js';

type Tx = Prisma.TransactionClient;
type Row = Record<string, unknown>;

/** Context of one write: the data about to be stored (mutable) and the row it replaces. */
export interface WriteContext {
  tx: Tx;
  /** Prisma data being written (already mapped: dates are Date objects) */
  data: Row;
  /** Raw DTO (to tell "absent" from "null") */
  dto: Row;
  /** Current row on update, undefined on create */
  current?: Row;
  userId: string;
  /** YYYY-MM-DD, Africa/Tunis */
  today: string;
}

export type ModelKey =
  | 'heroSlide'
  | 'serviceOffering'
  | 'publicProgram'
  | 'publicGroupListing'
  | 'publicEvent'
  | 'achievement'
  | 'quranGraduate'
  | 'administrationMember'
  | 'newsArticle'
  | 'galleryImage';

export interface CollectionConfig {
  /** URL segment under /api/admin/cms */
  slug: string;
  /** Swagger tag + Arabic name */
  label: string;
  model: ModelKey;
  table: string;
  visibility: 'isActive' | 'isPublished';
  /** Has displayOrder (set on creation, changed by /order only) */
  ordered: boolean;
  dateFields: string[];
  timeFields: string[];
  mediaFields: string[];
  linkFields: string[];
  searchFields: string[];
  adminOrderBy: object[];
  /** Admin-side relations */
  include?: object;
  /** Columns never returned */
  hidden?: string[];
  inputDto: Type;
  updateDto: Type;
  outputDto: Type;
  /** Cross-field rules / derived values, inside the write transaction */
  prepare?: (ctx: WriteContext) => Promise<void> | void;
  /** Derived output fields */
  decorate?: (row: Row, today: string) => Row;
}

const invalidDate = (message: string) =>
  badRequest('CMS_INVALID_DATE', message);
const referenceInvalid = (message: string) =>
  badRequest('CMS_REFERENCE_INVALID', message);

/** Value after the write: the new one if sent, else the stored one. */
const merged = (ctx: WriteContext, field: string): unknown =>
  field in ctx.data ? ctx.data[field] : ctx.current?.[field];

const day = (value: unknown) =>
  value instanceof Date ? fromDbDate(value) : null;

export function eventStatus(
  e: { isCancelled: boolean; startDate: Date; endDate: Date | null },
  today: string,
): EventStatus {
  if (e.isCancelled) return 'CANCELLED';
  return fromDbDate(e.endDate ?? e.startDate) < today
    ? 'COMPLETED'
    : 'UPCOMING';
}

export function newsState(
  n: { isPublished: boolean; publishedAt: Date },
  today: string,
) {
  if (!n.isPublished) return 'DRAFT' as const;
  return fromDbDate(n.publishedAt) > today
    ? ('SCHEDULED' as const)
    : ('PUBLISHED' as const);
}

const NEWS_HORIZON_DAYS = 366;

export const COLLECTIONS: CollectionConfig[] = [
  {
    slug: 'hero-slides',
    label: 'الشرائح الرئيسية',
    model: 'heroSlide',
    table: 'hero_slides',
    visibility: 'isActive',
    ordered: true,
    dateFields: [],
    timeFields: [],
    mediaFields: ['imageUrl'],
    linkFields: ['ctaHref'],
    searchFields: ['title', 'subtitle'],
    adminOrderBy: [
      { displayOrder: 'asc' },
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
    inputDto: HeroSlideInputDto,
    updateDto: HeroSlideUpdateDto,
    outputDto: HeroSlideDto,
    prepare: (ctx) => {
      // A button needs both its text and its link
      if (Boolean(merged(ctx, 'ctaLabel')) !== Boolean(merged(ctx, 'ctaHref')))
        throw badRequest(
          'CMS_CTA_INCOMPLETE',
          'الزر يحتاج نصًا ورابطًا معًا (أو لا شيء)',
        );
    },
  },
  {
    slug: 'services',
    label: 'خدمات الجمعية',
    model: 'serviceOffering',
    table: 'service_offerings',
    visibility: 'isPublished',
    ordered: true,
    dateFields: [],
    timeFields: [],
    mediaFields: [],
    linkFields: [],
    searchFields: ['title', 'description'],
    adminOrderBy: [
      { displayOrder: 'asc' },
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
    inputDto: ServiceInputDto,
    updateDto: ServiceUpdateDto,
    outputDto: ServiceDto,
  },
  {
    slug: 'programs',
    label: 'البرامج التعليمية',
    model: 'publicProgram',
    table: 'public_programs',
    visibility: 'isPublished',
    ordered: true,
    dateFields: [],
    timeFields: [],
    mediaFields: ['imageUrl'],
    linkFields: [],
    searchFields: ['title', 'description'],
    adminOrderBy: [
      { displayOrder: 'asc' },
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
    inputDto: ProgramInputDto,
    updateDto: ProgramUpdateDto,
    outputDto: ProgramDto,
  },
  {
    slug: 'upcoming-groups',
    label: 'مجموعات ستفتح قريبًا',
    model: 'publicGroupListing',
    table: 'public_group_listings',
    visibility: 'isPublished',
    ordered: true,
    dateFields: ['startDate'],
    timeFields: [],
    mediaFields: ['imageUrl'],
    linkFields: [],
    searchFields: ['title', 'audience', 'description'],
    adminOrderBy: [
      { displayOrder: 'asc' },
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
    include: { branch: { select: { id: true, name: true } } },
    inputDto: GroupListingInputDto,
    updateDto: GroupListingUpdateDto,
    outputDto: GroupListingDto,
    prepare: async ({ tx, data }) => {
      if (typeof data.groupId === 'string') {
        const group = await tx.group.findUnique({
          where: { id: data.groupId },
          select: { id: true },
        });
        if (!group) throw referenceInvalid('المجموعة التشغيلية غير موجودة');
      }
      if (typeof data.branchId === 'string') {
        const branch = await tx.branch.findUnique({
          where: { id: data.branchId },
          select: { id: true },
        });
        if (!branch) throw referenceInvalid('الفرع غير موجود');
      }
    },
  },
  {
    slug: 'events',
    label: 'الفعاليات والأنشطة',
    model: 'publicEvent',
    table: 'public_events',
    visibility: 'isPublished',
    ordered: false,
    dateFields: ['startDate', 'endDate'],
    timeFields: ['time'],
    mediaFields: ['imageUrl'],
    linkFields: [],
    searchFields: ['title', 'description', 'location'],
    adminOrderBy: [
      { startDate: 'desc' },
      { createdAt: 'desc' },
      { id: 'desc' },
    ],
    inputDto: EventInputDto,
    updateDto: EventUpdateDto,
    outputDto: EventDto,
    prepare: (ctx) => {
      const start = day(merged(ctx, 'startDate'));
      const end = day(merged(ctx, 'endDate'));
      if (start && end && end < start)
        throw invalidDate('تاريخ النهاية يجب ألا يسبق تاريخ البداية');
    },
    decorate: (row, today) => ({
      status: eventStatus(
        row as { isCancelled: boolean; startDate: Date; endDate: Date | null },
        today,
      ),
    }),
  },
  {
    slug: 'achievements',
    label: 'إنجازات الجمعية',
    model: 'achievement',
    table: 'achievements',
    visibility: 'isPublished',
    ordered: true,
    dateFields: ['date'],
    timeFields: [],
    mediaFields: ['imageUrl'],
    linkFields: [],
    searchFields: ['title', 'description'],
    adminOrderBy: [
      { year: { sort: 'desc', nulls: 'last' } },
      { displayOrder: 'asc' },
      { id: 'asc' },
    ],
    inputDto: AchievementInputDto,
    updateDto: AchievementUpdateDto,
    outputDto: AchievementDto,
    prepare: (ctx) => {
      // The year follows the date unless given explicitly (and then must agree)
      const date = day(merged(ctx, 'date'));
      if (!date) return;
      const dateYear = Number(date.slice(0, 4));
      if ('year' in ctx.dto && ctx.dto.year != null) {
        if (ctx.dto.year !== dateYear)
          throw invalidDate('السنة لا توافق تاريخ الإنجاز');
      } else {
        ctx.data.year = dateYear;
      }
    },
  },
  {
    slug: 'graduates',
    label: 'الحفّاظ المتخرجون',
    model: 'quranGraduate',
    table: 'quran_graduates',
    visibility: 'isPublished',
    ordered: true,
    dateFields: ['completionDate'],
    timeFields: [],
    mediaFields: ['photoUrl'],
    linkFields: [],
    searchFields: ['fullName'],
    adminOrderBy: [
      { displayOrder: 'asc' },
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
    include: { consentRecordedBy: { select: { id: true, username: true } } },
    hidden: ['consentRecordedByUserId'],
    inputDto: GraduateInputDto,
    updateDto: GraduateUpdateDto,
    outputDto: GraduateDto,
    prepare: async (ctx) => {
      const { tx, data, dto, current } = ctx;
      // Consent: recorded by the server (who/when); withdrawing it unpublishes
      if ('consentGivenBy' in dto) {
        if (dto.consentGivenBy === null) {
          data.consentRecordedAt = null;
          data.consentRecordedByUserId = null;
          if (!('isPublished' in dto)) data.isPublished = false;
        } else if (dto.consentGivenBy !== current?.consentGivenBy) {
          data.consentRecordedAt = new Date();
          data.consentRecordedByUserId = ctx.userId;
        }
      }
      const consent = merged(ctx, 'consentGivenBy') as ConsentGiver | null;
      const published = Boolean(merged(ctx, 'isPublished'));
      const studentId = merged(ctx, 'studentId') as string | null | undefined;
      let minor = false;
      if (studentId) {
        const student = await tx.student.findUnique({
          where: { id: studentId },
          select: { person: { select: { dateOfBirth: true } } },
        });
        if (!student) throw referenceInvalid('الطالب المرتبط غير موجود');
        const dob = fromDbDateOrNull(student.person.dateOfBirth);
        minor = dob !== null && ageOn(dob, ctx.today) < 18;
      }
      if (!published) return;
      if (!consent)
        throw badRequest(
          'CMS_GRADUATE_CONSENT_REQUIRED',
          'لا يُنشر اسم الخاتم أو صورته إلا بعد تسجيل الموافقة (consentGivenBy)',
        );
      if (minor && consent !== ConsentGiver.GUARDIAN)
        throw badRequest(
          'CMS_GUARDIAN_CONSENT_REQUIRED',
          'الخاتم قاصر: يلزم تسجيل موافقة الولي (GUARDIAN) قبل النشر',
        );
    },
  },
  {
    slug: 'administration-members',
    label: 'الهيئة الإدارية',
    model: 'administrationMember',
    table: 'administration_members',
    visibility: 'isPublished',
    ordered: true,
    dateFields: [],
    timeFields: [],
    mediaFields: ['photoUrl'],
    linkFields: [],
    searchFields: ['fullName', 'role'],
    adminOrderBy: [
      { displayOrder: 'asc' },
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
    // Board members are public content, never linked to platform accounts here
    hidden: ['userId'],
    inputDto: MemberInputDto,
    updateDto: MemberUpdateDto,
    outputDto: MemberDto,
  },
  {
    slug: 'news',
    label: 'الأخبار والمقالات',
    model: 'newsArticle',
    table: 'news_articles',
    visibility: 'isPublished',
    ordered: false,
    dateFields: ['publishedAt'],
    timeFields: [],
    mediaFields: ['coverImageUrl'],
    linkFields: [],
    searchFields: ['title', 'excerpt', 'content'],
    adminOrderBy: [
      { publishedAt: 'desc' },
      { createdAt: 'desc' },
      { id: 'desc' },
    ],
    inputDto: NewsInputDto,
    updateDto: NewsUpdateDto,
    outputDto: NewsDto,
    prepare: (ctx) => {
      if (!ctx.current && !('publishedAt' in ctx.data))
        ctx.data.publishedAt = new Date(`${ctx.today}T00:00:00.000Z`);
      const publishedAt = day(merged(ctx, 'publishedAt'))!;
      const horizon = new Date(`${ctx.today}T00:00:00.000Z`);
      horizon.setUTCDate(horizon.getUTCDate() + NEWS_HORIZON_DAYS);
      if (publishedAt < '2000-01-01' || publishedAt > fromDbDate(horizon))
        throw badRequest(
          'CMS_INVALID_PUBLICATION_DATE',
          `تاريخ النشر غير مقبول (من 2000 إلى ${NEWS_HORIZON_DAYS} يومًا قادمًا)`,
        );
    },
    decorate: (row, today) => ({
      state: newsState(
        row as { isPublished: boolean; publishedAt: Date },
        today,
      ),
    }),
  },
  {
    slug: 'gallery',
    label: 'معرض الصور',
    model: 'galleryImage',
    table: 'gallery_images',
    visibility: 'isPublished',
    ordered: true,
    dateFields: [],
    timeFields: [],
    mediaFields: ['imageUrl'],
    linkFields: [],
    searchFields: ['title', 'description'],
    adminOrderBy: [
      { displayOrder: 'asc' },
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
    inputDto: GalleryInputDto,
    updateDto: GalleryUpdateDto,
    outputDto: GalleryImageDto,
  },
];
