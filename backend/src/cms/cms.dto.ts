import { applyDecorators } from '@nestjs/common';
import {
  ApiProperty,
  ApiPropertyOptional,
  PartialType,
  PickType,
} from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { SearchQueryDto, trim } from '../academic/shared.dto.js';
import { OptionalText } from '../common/contact-fields.js';
import { IsDateOnly } from '../common/dates.js';
import { PaginationMetaDto } from '../common/pagination.js';
import {
  AchievementCategory,
  ConsentGiver,
  GalleryCategory,
  PublicGroupStatus,
} from '../generated/prisma/enums.js';
import { IsTimeOfDay } from '../scheduling/time.js';

/* ------------------------------ field kinds ------------------------------ */

/** Required plain text (trimmed). Content is plain text — never HTML. */
const Text = (maxLength: number, description?: string) =>
  applyDecorators(
    ApiProperty({ maxLength, description }),
    Transform(trim),
    IsString(),
    MinLength(1, { message: 'هذا الحقل مطلوب' }),
    MaxLength(maxLength),
  );

/** Image reference: bundled /website/… asset or https:// URL (checked by the service). */
const Media = (required = false) =>
  applyDecorators(
    (required ? ApiProperty : ApiPropertyOptional)({
      type: String,
      nullable: !required,
      example: '/website/halaqa.svg',
      description:
        'A bundled website asset (/website/<name>.svg|png|jpg|webp) or an https:// URL — uploads need the file storage of Part 10.10 (CMS_MEDIA_UNAVAILABLE)',
    }),
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.trim() || null : value,
    ),
    ...(required ? [] : [IsOptional(), ValidateIf((_, v) => v !== null)]),
    IsString({ message: 'الصورة مطلوبة' }),
    MaxLength(2000),
  );

const Flag = (description: string) =>
  applyDecorators(
    ApiPropertyOptional({ description }),
    IsOptional(),
    IsBoolean(),
  );

const Icon = () =>
  applyDecorators(
    ApiPropertyOptional({
      type: String,
      nullable: true,
      example: 'book',
      description: 'Key of the website icon set',
    }),
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.trim() || null : value,
    ),
    IsOptional(),
    ValidateIf((_, v) => v !== null),
    Matches(/^[a-z][a-z0-9-]{0,30}$/, { message: 'مفتاح أيقونة غير صالح' }),
  );

const Year = () =>
  applyDecorators(
    ApiPropertyOptional({
      type: Number,
      nullable: true,
      minimum: 1900,
      maximum: 2100,
    }),
    IsOptional(),
    ValidateIf((_, v) => v !== null),
    Type(() => Number),
    IsInt(),
    Min(1900),
    Max(2100),
  );

const OptionalUuid = (description: string) =>
  applyDecorators(
    ApiPropertyOptional({
      type: String,
      format: 'uuid',
      nullable: true,
      description,
    }),
    IsOptional(),
    ValidateIf((_, v) => v !== null),
    IsUUID(),
  );

/** Common admin output fields. */
class Stamped {
  @ApiProperty() id!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

/* ------------------------------ hero slides ------------------------------ */

export class HeroSlideInputDto {
  @Media(true) imageUrl!: string;
  @OptionalText(200) title?: string | null;
  @OptionalText(500) subtitle?: string | null;
  @OptionalText(60, 'Button text (with ctaHref)') ctaLabel?: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '/registration',
    description: 'Internal route ("/registration") or https:// URL',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  ctaHref?: string | null;
  @Flag('Shown on the home page (default true)') isActive?: boolean;
}
export class HeroSlideUpdateDto extends PartialType(HeroSlideInputDto) {}
export class HeroSlideDto extends Stamped {
  @ApiProperty() imageUrl!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) title!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) subtitle!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) ctaLabel!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) ctaHref!:
    string | null;
  @ApiProperty() displayOrder!: number;
  @ApiProperty() isActive!: boolean;
}
export class PublicHeroSlideDto extends PickType(HeroSlideDto, [
  'id',
  'imageUrl',
  'title',
  'subtitle',
  'ctaLabel',
  'ctaHref',
  'displayOrder',
] as const) {}

/* ------------------------------ services ------------------------------ */

export class ServiceInputDto {
  @Text(150) title!: string;
  @OptionalText(1000) description?: string | null;
  @Icon() icon?: string | null;
  @Flag('Public (default true)') isPublished?: boolean;
}
export class ServiceUpdateDto extends PartialType(ServiceInputDto) {}
export class ServiceDto extends Stamped {
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  description!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) icon!: string | null;
  @ApiProperty() displayOrder!: number;
  @ApiProperty() isPublished!: boolean;
}
export class PublicServiceDto extends PickType(ServiceDto, [
  'id',
  'title',
  'description',
  'icon',
  'displayOrder',
] as const) {}

/* ------------------------------ programs ------------------------------ */

export class ProgramInputDto {
  @Text(150) title!: string;
  @Text(5000) description!: string;
  @Media() imageUrl?: string | null;
  @Icon() icon?: string | null;
  @Flag('Public (default true)') isPublished?: boolean;
}
export class ProgramUpdateDto extends PartialType(ProgramInputDto) {}
export class ProgramDto extends Stamped {
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  imageUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) icon!: string | null;
  @ApiProperty() displayOrder!: number;
  @ApiProperty() isPublished!: boolean;
}
export class PublicProgramDto extends PickType(ProgramDto, [
  'id',
  'title',
  'description',
  'imageUrl',
  'icon',
  'displayOrder',
] as const) {}

/* ------------------------- upcoming groups (listings) ------------------------- */

export class GroupListingInputDto {
  @Text(150) title!: string;
  @Text(150, 'Target audience, e.g. "أطفال 7–10 سنوات"') audience!: string;
  @OptionalText(1000) description?: string | null;
  @OptionalUuid('Operational group it will become (registration interest)')
  groupId?: string | null;
  @OptionalUuid('Branch (must be active to be shown)') branchId?: string | null;
  @IsDateOnly({ optional: true }) startDate?: string | null;
  @OptionalText(150, 'Approximate schedule') schedule?: string | null;
  @Media() imageUrl?: string | null;
  @ApiPropertyOptional({
    enum: PublicGroupStatus,
    enumName: 'PublicGroupStatus',
    default: 'COMING_SOON',
    description: 'CLOSED listings are not public',
  })
  @IsOptional()
  @IsEnum(PublicGroupStatus)
  publicStatus?: PublicGroupStatus;
  @Flag('Show the registration button (default true)')
  registrationOpen?: boolean;
  @Flag('Public (default true)') isPublished?: boolean;
}
export class GroupListingUpdateDto extends PartialType(GroupListingInputDto) {}
class BranchRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}
export class GroupListingDto extends Stamped {
  @ApiProperty() title!: string;
  @ApiProperty() audience!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  description!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) groupId!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  branchId!: string | null;
  @ApiPropertyOptional({ type: BranchRefDto, nullable: true })
  branch!: BranchRefDto | null;
  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  startDate!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  schedule!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  imageUrl!: string | null;
  @ApiProperty({ enum: PublicGroupStatus, enumName: 'PublicGroupStatus' })
  publicStatus!: PublicGroupStatus;
  @ApiProperty() registrationOpen!: boolean;
  @ApiProperty() displayOrder!: number;
  @ApiProperty() isPublished!: boolean;
}
export class PublicGroupListingDto extends PickType(GroupListingDto, [
  'id',
  'title',
  'audience',
  'description',
  'groupId',
  'branch',
  'startDate',
  'schedule',
  'imageUrl',
  'publicStatus',
  'registrationOpen',
  'displayOrder',
] as const) {}

/* ------------------------------ events ------------------------------ */

export class EventInputDto {
  @Text(200) title!: string;
  @Text(5000) description!: string;
  @IsDateOnly({ description: 'Africa/Tunis calendar day' }) startDate!: string;
  @IsDateOnly({ optional: true, description: '≥ startDate' })
  endDate?: string | null;
  @IsTimeOfDay({ optional: true }) time?: string | null;
  @OptionalText(200) location?: string | null;
  @Media() imageUrl?: string | null;
  @Flag('Public event (default true); internal events never reach the site')
  isPublic?: boolean;
  @Flag('Published (default true)') isPublished?: boolean;
  @Flag('Cancelled (still shown, as cancelled)') isCancelled?: boolean;
}
export class EventUpdateDto extends PartialType(EventInputDto) {}
export const EVENT_STATUSES = ['UPCOMING', 'COMPLETED', 'CANCELLED'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];
export class EventDto extends Stamped {
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ format: 'date' }) startDate!: string;
  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  endDate!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, example: '17:00' })
  time!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  location!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  imageUrl!: string | null;
  @ApiProperty() isPublic!: boolean;
  @ApiProperty() isPublished!: boolean;
  @ApiProperty() isCancelled!: boolean;
  @ApiProperty({
    enum: EVENT_STATUSES,
    description: 'Derived for today (Africa/Tunis)',
  })
  status!: EventStatus;
}
export class PublicEventDto extends PickType(EventDto, [
  'id',
  'title',
  'description',
  'startDate',
  'endDate',
  'time',
  'location',
  'imageUrl',
  'status',
] as const) {}

/* ------------------------------ achievements ------------------------------ */

export class AchievementInputDto {
  @Text(200) title!: string;
  @Text(3000) description!: string;
  @IsDateOnly({ optional: true }) date?: string | null;
  @Year() year?: number | null;
  @Media() imageUrl?: string | null;
  @ApiPropertyOptional({
    enum: AchievementCategory,
    enumName: 'AchievementCategory',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEnum(AchievementCategory)
  category?: AchievementCategory | null;
  @Flag('Preferred on the home page (never overrides isPublished)')
  isFeatured?: boolean;
  @Flag('Public (default true)') isPublished?: boolean;
}
export class AchievementUpdateDto extends PartialType(AchievementInputDto) {}
export class AchievementDto extends Stamped {
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  date!: string | null;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Defaults to the year of `date`',
  })
  year!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  imageUrl!: string | null;
  @ApiPropertyOptional({
    enum: AchievementCategory,
    enumName: 'AchievementCategory',
    nullable: true,
  })
  category!: AchievementCategory | null;
  @ApiProperty() isFeatured!: boolean;
  @ApiProperty() isPublished!: boolean;
  @ApiProperty() displayOrder!: number;
}
export class PublicAchievementDto extends PickType(AchievementDto, [
  'id',
  'title',
  'description',
  'date',
  'year',
  'imageUrl',
  'category',
  'isFeatured',
  'displayOrder',
] as const) {}

/* ------------------------------ graduates ------------------------------ */

export class GraduateInputDto {
  @Text(150) fullName!: string;
  @Media() photoUrl?: string | null;
  @Year() completionYear?: number | null;
  @IsDateOnly({ optional: true }) completionDate?: string | null;
  @OptionalText(500) shortMessage?: string | null;
  @OptionalUuid(
    'Optional link to the student record (internal only, never public; a minor student needs a GUARDIAN consent)',
  )
  studentId?: string | null;
  @ApiPropertyOptional({
    enum: ConsentGiver,
    enumName: 'ConsentGiver',
    nullable: true,
    description:
      'Records who consented to the public listing of the name/photo (the server stores when and by whom). null withdraws it — and unpublishes.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEnum(ConsentGiver)
  consentGivenBy?: ConsentGiver | null;
  @Flag(
    'Explicit publication decision (default false); requires a recorded consent',
  )
  isPublished?: boolean;
}
export class GraduateUpdateDto extends PartialType(GraduateInputDto) {}
class UserRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() username!: string;
}
export class GraduateDto extends Stamped {
  @ApiProperty() fullName!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  photoUrl!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true })
  completionYear!: number | null;
  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  completionDate!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  shortMessage!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  studentId!: string | null;
  @ApiPropertyOptional({
    enum: ConsentGiver,
    enumName: 'ConsentGiver',
    nullable: true,
  })
  consentGivenBy!: ConsentGiver | null;
  @ApiPropertyOptional({ type: Date, nullable: true })
  consentRecordedAt!: Date | null;
  @ApiPropertyOptional({ type: UserRefDto, nullable: true })
  consentRecordedBy!: UserRefDto | null;
  @ApiProperty() displayOrder!: number;
  @ApiProperty() isPublished!: boolean;
}
export class PublicGraduateDto extends PickType(GraduateDto, [
  'id',
  'fullName',
  'photoUrl',
  'completionYear',
  'completionDate',
  'shortMessage',
  'displayOrder',
] as const) {}

/* ------------------------- administration members ------------------------- */

export class MemberInputDto {
  @Text(150) fullName!: string;
  @Text(100, 'Board function, e.g. "رئيس الجمعية"') role!: string;
  @Media() photoUrl?: string | null;
  @OptionalText(1000) shortBio?: string | null;
  @Flag('Public (default true)') isPublished?: boolean;
}
export class MemberUpdateDto extends PartialType(MemberInputDto) {}
export class MemberDto extends Stamped {
  @ApiProperty() fullName!: string;
  @ApiProperty() role!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  photoUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  shortBio!: string | null;
  @ApiProperty() displayOrder!: number;
  @ApiProperty() isPublished!: boolean;
}
export class PublicMemberDto extends PickType(MemberDto, [
  'id',
  'fullName',
  'role',
  'photoUrl',
  'shortBio',
  'displayOrder',
] as const) {}

/* ------------------------------ news ------------------------------ */

export class NewsInputDto {
  @Text(200) title!: string;
  @Text(500) excerpt!: string;
  @Text(20000, 'Plain text, paragraphs separated by blank lines')
  content!: string;
  @Media() coverImageUrl?: string | null;
  @IsDateOnly({
    optional: true,
    description:
      'Publication day (Africa/Tunis; default today). A future day stays hidden until then.',
  })
  publishedAt?: string;
  @Flag('Published (default true); false = draft') isPublished?: boolean;
}
export class NewsUpdateDto extends PartialType(NewsInputDto) {}
export class NewsDto extends Stamped {
  @ApiProperty() title!: string;
  @ApiProperty() excerpt!: string;
  @ApiProperty() content!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  coverImageUrl!: string | null;
  @ApiProperty({ format: 'date' }) publishedAt!: string;
  @ApiProperty() isPublished!: boolean;
  @ApiProperty({
    enum: ['DRAFT', 'SCHEDULED', 'PUBLISHED'],
    description: 'Derived for today (Africa/Tunis)',
  })
  state!: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED';
}
export class PublicNewsSummaryDto extends PickType(NewsDto, [
  'id',
  'title',
  'excerpt',
  'coverImageUrl',
  'publishedAt',
] as const) {}
export class PublicNewsDto extends PickType(NewsDto, [
  'id',
  'title',
  'excerpt',
  'content',
  'coverImageUrl',
  'publishedAt',
] as const) {}

/* ------------------------------ gallery ------------------------------ */

export class GalleryInputDto {
  @Media(true) imageUrl!: string;
  @OptionalText(200) title?: string | null;
  @OptionalText(500) description?: string | null;
  @ApiPropertyOptional({
    enum: GalleryCategory,
    enumName: 'GalleryCategory',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEnum(GalleryCategory)
  category?: GalleryCategory | null;
  @Flag('Public (default true)') isPublished?: boolean;
}
export class GalleryUpdateDto extends PartialType(GalleryInputDto) {}
export class GalleryImageDto extends Stamped {
  @ApiProperty() imageUrl!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) title!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  description!: string | null;
  @ApiPropertyOptional({
    enum: GalleryCategory,
    enumName: 'GalleryCategory',
    nullable: true,
  })
  category!: GalleryCategory | null;
  @ApiProperty() displayOrder!: number;
  @ApiProperty() isPublished!: boolean;
}
export class PublicGalleryImageDto extends PickType(GalleryImageDto, [
  'id',
  'imageUrl',
  'title',
  'description',
  'category',
  'displayOrder',
] as const) {}

/* ------------------------------ shared admin ------------------------------ */

export class CmsListQueryDto extends SearchQueryDto {
  @ApiPropertyOptional({
    description: 'Filter on the visibility flag (isPublished / isActive)',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  visible?: boolean;
}

export class ReorderDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    isArray: true,
    description:
      'EVERY item of the collection, in the new order (displayOrder becomes 1, 2, 3…)',
  })
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids!: string[];
}

export class CmsPageMetaDto extends PaginationMetaDto {}

/* ------------------------------ public queries ------------------------------ */

export class PublicNewsQueryDto extends SearchQueryDto {}

export class PublicGalleryQueryDto extends SearchQueryDto {
  @ApiPropertyOptional({ enum: GalleryCategory, enumName: 'GalleryCategory' })
  @IsOptional()
  @IsEnum(GalleryCategory)
  category?: GalleryCategory;
}

export class PublicEventQueryDto extends SearchQueryDto {
  @ApiPropertyOptional({
    enum: ['UPCOMING', 'PAST'],
    default: 'UPCOMING',
    description:
      'UPCOMING: not finished yet (cancelled ones included, flagged), soonest first · PAST: finished, newest first (Africa/Tunis days)',
  })
  @IsOptional()
  @IsIn(['UPCOMING', 'PAST'])
  period?: 'UPCOMING' | 'PAST';
}

export class PublicAchievementQueryDto {
  @ApiPropertyOptional({ description: 'Only featured ones' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  featured?: boolean;
}

/* ------------------------------ public settings / home ------------------------------ */

class SocialLinksDto {
  @ApiPropertyOptional({ type: String, nullable: true }) facebook!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  instagram!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) youtube!:
    string | null;
}

/** Association identity (AssociationSettings) + website presentation (SiteSettings). */
export class PublicSiteSettingsDto {
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) logoUrl!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) address!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;
  @ApiProperty() shortDescription!: string;
  @ApiProperty() about!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) history!:
    string | null;
  @ApiProperty() mission!: string;
  @ApiProperty() vision!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'One value per line',
  })
  values!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  openingHours!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) mapUrl!: string | null;
  @ApiProperty({ type: SocialLinksDto }) social!: SocialLinksDto;
  @ApiProperty({ description: 'The public registration form is open' })
  registrationEnabled!: boolean;
}

export class PublicBranchDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() address!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) phone!: string | null;
}

export class PublicStatisticsDto {
  @ApiProperty({ description: 'Active students (aggregate count only)' })
  students!: number;
  @ApiProperty({ description: 'Active teachers (aggregate count only)' })
  teachers!: number;
  @ApiProperty() branches!: number;
  @ApiProperty({ description: 'Published graduates' }) graduates!: number;
}

export class PublicHomeDto {
  @ApiPropertyOptional({ type: PublicSiteSettingsDto, nullable: true })
  settings!: PublicSiteSettingsDto | null;
  @ApiProperty({ type: PublicHeroSlideDto, isArray: true, description: '≤ 10' })
  heroSlides!: PublicHeroSlideDto[];
  @ApiProperty({ type: PublicServiceDto, isArray: true, description: '≤ 6' })
  services!: PublicServiceDto[];
  @ApiProperty({ type: PublicProgramDto, isArray: true, description: '≤ 3' })
  programs!: PublicProgramDto[];
  @ApiProperty({
    type: PublicGroupListingDto,
    isArray: true,
    description: '≤ 3',
  })
  upcomingGroups!: PublicGroupListingDto[];
  @ApiProperty({
    type: PublicEventDto,
    isArray: true,
    description: '≤ 3, soonest first',
  })
  upcomingEvents!: PublicEventDto[];
  @ApiProperty({
    type: PublicAchievementDto,
    isArray: true,
    description: '≤ 4 featured',
  })
  featuredAchievements!: PublicAchievementDto[];
  @ApiProperty({ type: PublicGraduateDto, isArray: true, description: '≤ 4' })
  graduates!: PublicGraduateDto[];
  @ApiProperty({
    type: PublicNewsSummaryDto,
    isArray: true,
    description: '≤ 3, newest first',
  })
  news!: PublicNewsSummaryDto[];
  @ApiProperty({
    type: PublicGalleryImageDto,
    isArray: true,
    description: '≤ 5',
  })
  gallery!: PublicGalleryImageDto[];
  @ApiProperty({ type: PublicStatisticsDto }) statistics!: PublicStatisticsDto;
}
