import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { trim } from '../academic/shared.dto.js';
import {
  OptionalEmail,
  OptionalPhone,
  OptionalText,
} from '../common/contact-fields.js';
import { CalendarView, DateFormat } from '../generated/prisma/enums.js';

const Text = (maxLength: number) =>
  applyDecorators(
    ApiPropertyOptional({ maxLength }),
    IsOptional(),
    Transform(trim),
    IsString(),
    MinLength(1, { message: 'هذا الحقل لا يكون فارغًا' }),
    MaxLength(maxLength),
  );

/** An https:// link, optionally restricted to a site (checked again by the service). */
const Link = (description: string) =>
  applyDecorators(
    ApiPropertyOptional({ type: String, nullable: true, description }),
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.trim() || null : value,
    ),
    IsOptional(),
    ValidateIf((_, v) => v !== null),
    IsString(),
    MaxLength(500),
  );

/** Official identity (AssociationSettings) — header, footer, every workspace. */
export class AssociationSettingsPatchDto {
  @Text(150) name?: string;
  @OptionalPhone() phone?: string | null;
  @OptionalEmail() email?: string | null;
  @OptionalText(300) address?: string | null;
  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'An ASSOCIATION_LOGO upload (POST /api/files?purpose=ASSOCIATION_LOGO); null = the bundled logo. The previous logo is kept until unused, then cleaned up.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  logoFileId?: string | null;
}

/** Platform behaviour. The timezone is fixed (Africa/Tunis) and not editable. */
export class PlatformSettingsPatchDto {
  @ApiPropertyOptional({ enum: DateFormat, enumName: 'DateFormat' })
  @IsOptional()
  @IsEnum(DateFormat)
  dateFormat?: DateFormat;
  @ApiPropertyOptional({ enum: CalendarView, enumName: 'CalendarView' })
  @IsOptional()
  @IsEnum(CalendarView)
  defaultCalendarView?: CalendarView;
  @ApiPropertyOptional({ enum: [10, 20, 50] })
  @IsOptional()
  @IsIn([10, 20, 50])
  defaultPageSize?: 10 | 20 | 50;
}

/** How the association is presented on the public website (SiteSettings). */
export class WebsiteSettingsPatchDto {
  @Text(500) shortDescription?: string;
  @Text(5000) about?: string;
  @OptionalText(5000) history?: string | null;
  @Text(2000) mission?: string;
  @Text(2000) vision?: string;
  @OptionalText(2000, 'One value per line') values?: string | null;
  @OptionalText(500) openingHours?: string | null;
  @Link('https:// map link (e.g. Google Maps)') mapUrl?: string | null;
  @Link('https://facebook.com/… or fb.com/…') facebookUrl?: string | null;
  @Link('https://instagram.com/…') instagramUrl?: string | null;
  @Link('https://youtube.com/… or youtu.be/…') youtubeUrl?: string | null;
  @ApiPropertyOptional({ description: 'The public registration form is open' })
  @IsOptional()
  @IsBoolean()
  registrationEnabled?: boolean;
}

/** Partial update: only the sent sections and fields change. */
export class UpdateSettingsDto {
  @ApiPropertyOptional({ type: AssociationSettingsPatchDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AssociationSettingsPatchDto)
  association?: AssociationSettingsPatchDto;

  @ApiPropertyOptional({ type: PlatformSettingsPatchDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlatformSettingsPatchDto)
  platform?: PlatformSettingsPatchDto;

  @ApiPropertyOptional({ type: WebsiteSettingsPatchDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => WebsiteSettingsPatchDto)
  website?: WebsiteSettingsPatchDto;
}

class AssociationSettingsDto {
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) address!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  logoFileId!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Authenticated path of the uploaded logo (null: bundled logo)',
  })
  logoUrl!: string | null;
  @ApiProperty() updatedAt!: Date;
}

class PlatformSettingsDto {
  @ApiProperty({
    example: 'Africa/Tunis',
    description: 'Read-only: every calendar rule of the platform uses it',
  })
  timezone!: string;
  @ApiProperty({ enum: DateFormat, enumName: 'DateFormat' })
  dateFormat!: DateFormat;
  @ApiProperty({ enum: CalendarView, enumName: 'CalendarView' })
  defaultCalendarView!: CalendarView;
  @ApiProperty({ enum: [10, 20, 50] }) defaultPageSize!: number;
  @ApiProperty() updatedAt!: Date;
}

class WebsiteSettingsDto {
  @ApiProperty() shortDescription!: string;
  @ApiProperty() about!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) history!:
    string | null;
  @ApiProperty() mission!: string;
  @ApiProperty() vision!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) values!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  openingHours!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) mapUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  facebookUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  instagramUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  youtubeUrl!: string | null;
  @ApiProperty() registrationEnabled!: boolean;
  @ApiProperty() updatedAt!: Date;
}

class CurrentYearDto {
  @ApiProperty() id!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ format: 'date' }) startDate!: string;
  @ApiProperty({ format: 'date' }) endDate!: string;
}

export class SettingsDto {
  @ApiPropertyOptional({ type: AssociationSettingsDto, nullable: true })
  association!: AssociationSettingsDto | null;
  @ApiPropertyOptional({ type: PlatformSettingsDto, nullable: true })
  platform!: PlatformSettingsDto | null;
  @ApiPropertyOptional({ type: WebsiteSettingsDto, nullable: true })
  website!: WebsiteSettingsDto | null;
  @ApiPropertyOptional({
    type: CurrentYearDto,
    nullable: true,
    description:
      'Read-only: managed by /api/admin/academic-years (single current year invariant)',
  })
  currentAcademicYear!: CurrentYearDto | null;
}
