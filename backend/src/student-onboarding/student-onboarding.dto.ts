import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { IsDateOnly, trim } from '../academic/shared.dto.js';
import { OptionalEmail, OptionalPhone } from '../common/contact-fields.js';
import { IsLocalDateTime } from '../common/dates.js';
import { PaginationMetaDto, PaginationQueryDto } from '../common/pagination.js';
import {
  Gender,
  OnboardingSubmissionStatus,
  OnboardingSubmitter,
} from '../generated/prisma/enums.js';
import { TOKEN_PATTERN } from './onboarding-token.js';

/** Same rule as the student form's national ID: 8 digits, optional. */
const OptionalCin = () => (target: object, key: string) => {
  ApiPropertyOptional({
    type: String,
    nullable: true,
    description: '8 digits',
  })(target, key);
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )(target, key);
  IsOptional()(target, key);
  ValidateIf((_: unknown, value: unknown) => value !== null)(target, key);
  Matches(/^\d{8}$/, { message: 'رقم بطاقة التعريف يتكوّن من 8 أرقام' })(
    target,
    key,
  );
};

// ───────────────────────── student fields (as the admin student form) ─────────────────────────

/** The student information collected — the admin student form's fields and rules, nothing more. */
export class OnboardingStudentFieldsDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'الاسم مطلوب' })
  @MaxLength(80)
  firstName!: string;
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'اللقب مطلوب' })
  @MaxLength(80)
  lastName!: string;
  @ApiProperty({ enum: Gender, enumName: 'Gender' })
  @IsEnum(Gender)
  gender!: Gender;
  @IsDateOnly() dateOfBirth!: string;
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'العنوان مطلوب' })
  @MaxLength(200)
  address!: string;
  @OptionalPhone() phone?: string | null;
  @OptionalEmail() email?: string | null;
  @OptionalPhone() guardianPhone?: string | null;
  @OptionalCin() cin?: string | null;
}

// ───────────────────────── public ─────────────────────────

export class OnboardingTokenDto {
  @ApiProperty({
    description: 'The token of the public link (/student-info/{token})',
  })
  @IsString()
  @Matches(TOKEN_PATTERN, { message: 'رابط غير صالح' })
  token!: string;
}

/**
 * The public form. The class is NEVER sent: it comes from the link. No
 * account data (username, password, role) is ever collected.
 */
export class OnboardingSubmitDto extends OnboardingStudentFieldsDto {
  @ApiProperty({ description: 'The token of the public link' })
  @IsString()
  @Matches(TOKEN_PATTERN, { message: 'رابط غير صالح' })
  token!: string;

  @ApiProperty({ enum: OnboardingSubmitter, enumName: 'OnboardingSubmitter' })
  @IsEnum(OnboardingSubmitter)
  submittedBy!: OnboardingSubmitter;

  @ApiProperty({ description: 'The privacy notice was read and accepted' })
  @IsBoolean()
  @Equals(true, { message: 'يجب الموافقة على استعمال البيانات' })
  consent!: boolean;

  /** Anti-spam honeypot: hidden from people, filled by bots */
  @ApiPropertyOptional({ description: 'Leave empty' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}

export class OnboardingLinkInfoDto {
  @ApiProperty() branchName!: string;
  @ApiProperty() groupName!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Supervising teacher (identifies the class)',
  })
  supervisorName!: string | null;
}

export class OnboardingSubmitAckDto {
  @ApiProperty() received!: true;
}

// ───────────────────────── admin: links ─────────────────────────

export const LINK_STATUSES = ['ACTIVE', 'EXPIRED', 'REVOKED'] as const;
export type LinkStatus = (typeof LINK_STATUSES)[number];

export class CreateOnboardingLinkDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() groupClassId!: string;
  @IsLocalDateTime({
    description: 'Expiry, wall-clock in Africa/Tunis — must be in the future',
  })
  expiresAt!: string;
}

export class ExtendOnboardingLinkDto {
  @IsLocalDateTime({ description: 'New expiry (Africa/Tunis) — in the future' })
  expiresAt!: string;
}

export class OnboardingLinkListQueryDto {
  @ApiPropertyOptional({ enum: LINK_STATUSES })
  @IsOptional()
  @IsIn(LINK_STATUSES)
  status?: LinkStatus;
}

class OnboardingClassDto {
  @ApiProperty() id!: string;
  @ApiProperty() group!: { id: string; name: string };
  @ApiProperty() branch!: { id: string; name: string };
  @ApiPropertyOptional({ type: String, nullable: true }) supervisorName!:
    string | null;
}

class SubmissionCountsDto {
  @ApiProperty() total!: number;
  @ApiProperty() pending!: number;
  @ApiProperty() approved!: number;
  @ApiProperty() rejected!: number;
}

/** A link WITHOUT its token (lists): the URL is revealed only on request. */
export class OnboardingLinkDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: OnboardingClassDto }) groupClass!: OnboardingClassDto;
  @ApiProperty({ enum: LINK_STATUSES }) status!: LinkStatus;
  @ApiProperty() expiresAt!: Date;
  @ApiPropertyOptional({ type: Date, nullable: true }) revokedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ type: SubmissionCountsDto }) submissions!: SubmissionCountsDto;
}

export class OnboardingLinkUrlDto {
  @ApiProperty({
    description: 'The public link to share (or encode as a QR code)',
  })
  url!: string;
}

export class OnboardingLinkCreatedDto extends OnboardingLinkDto {
  @ApiProperty() url!: string;
}

// ───────────────────────── admin: submissions ─────────────────────────

export class OnboardingSubmissionListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Name, phone or guardian phone (contains)',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;
  @ApiPropertyOptional({
    enum: OnboardingSubmissionStatus,
    enumName: 'OnboardingSubmissionStatus',
  })
  @IsOptional()
  @IsEnum(OnboardingSubmissionStatus)
  status?: OnboardingSubmissionStatus;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  branchId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  groupId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  groupClassId?: string;
  @IsDateOnly({
    optional: true,
    description: 'Submitted on or after (Africa/Tunis)',
  })
  from?: string;
  @IsDateOnly({
    optional: true,
    description: 'Submitted on or before (Africa/Tunis)',
  })
  to?: string;
}

export class OnboardingSubmissionDto extends OnboardingStudentFieldsDto {
  @ApiProperty() id!: string;
  @ApiProperty() version!: number;
  @ApiProperty({
    enum: OnboardingSubmissionStatus,
    enumName: 'OnboardingSubmissionStatus',
  })
  status!: OnboardingSubmissionStatus;
  @ApiProperty({ enum: OnboardingSubmitter, enumName: 'OnboardingSubmitter' })
  submittedBy!: OnboardingSubmitter;
  @ApiProperty({ type: OnboardingClassDto }) groupClass!: OnboardingClassDto;
  @ApiProperty() createdAt!: Date;
  @ApiPropertyOptional({ type: Date, nullable: true }) reviewedAt!: Date | null;
  @ApiPropertyOptional({ type: String, nullable: true }) reviewedBy!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) rejectionReason!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) approvedStudentId!:
    string | null;
  @ApiProperty() linkedExisting!: boolean;
  @ApiProperty({
    description: 'A photo was sent (GET submissions/:id/photo)',
  })
  hasPhoto!: boolean;
  @ApiProperty({
    description: 'Whether an admin corrected the submitted fields',
  })
  edited!: boolean;
}

export class OnboardingSubmissionListDto {
  @ApiProperty({ type: OnboardingSubmissionDto, isArray: true })
  data!: OnboardingSubmissionDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/** A student who may be the same person (never merged automatically). */
export class PossibleMatchDto {
  @ApiProperty() studentId!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) dateOfBirth!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) guardianPhone!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) groupClassLabel!:
    string | null;
  @ApiProperty({
    description: 'What matched: NAME, BIRTH_DATE, GUARDIAN_PHONE, PHONE',
  })
  reasons!: string[];
}

export class OnboardingSubmissionDetailDto extends OnboardingSubmissionDto {
  @ApiProperty({ description: 'Exactly what the submitter sent' })
  originalData!: Record<string, unknown>;
  @ApiProperty({ type: PossibleMatchDto, isArray: true })
  possibleMatches!: PossibleMatchDto[];
}

/** «تعديل البيانات»: corrections before approval (the original stays in originalData). */
export class EditOnboardingSubmissionDto extends OnboardingStudentFieldsDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
}

export class ApproveOnboardingSubmissionDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @IsDateOnly({
    optional: true,
    description: 'Default: today (not in the future)',
  })
  registrationDate?: string;
  @ApiPropertyOptional({
    description: 'Create even though possible matches exist (after review)',
  })
  @IsOptional()
  @IsBoolean()
  confirmNoDuplicate?: boolean;
}

export class LinkOnboardingSubmissionDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiProperty({
    format: 'uuid',
    description: 'The existing student this submission is about',
  })
  @IsUUID()
  studentId!: string;
}

export class RejectOnboardingSubmissionDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class OnboardingStatusDto {
  @ApiProperty() enabled!: boolean;
}
