import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  OptionalEmail,
  OptionalPhone,
  OptionalText,
} from '../../common/contact-fields.js';
import {
  ActivationStatus,
  Gender,
  RecordStatus,
  Role,
} from '../../generated/prisma/enums.js';

/**
 * PATCH /api/profile — the ONLY self-editable fields. Anything else
 * (firstName, lastName, username, roles, isActive, photoUrl…) is rejected by
 * the whitelist ValidationPipe with 400. Omit to keep, null/"" to clear.
 */
export class UpdateProfileDto {
  @OptionalPhone() phone?: string | null;
  @OptionalEmail() email?: string | null;
  @OptionalText(200) address?: string | null;
}

export class ProfilePersonDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Official identity — admin-managed' })
  firstName!: string;
  @ApiProperty({ description: 'Official identity — admin-managed' })
  lastName!: string;
  @ApiPropertyOptional({ enum: Gender, enumName: 'Gender', nullable: true })
  gender!: Gender | null;
  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  dateOfBirth!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Read-only until the file-storage module',
  })
  photoUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) address!:
    string | null;
}

export class ProfileAccountDto {
  @ApiProperty({ description: 'Read-only (admin-managed)' }) username!: string;
  @ApiProperty({
    enum: Role,
    enumName: 'Role',
    isArray: true,
    description: 'Read-only (admin-managed)',
  })
  roles!: Role[];
  @ApiProperty() mustChangePassword!: boolean;
  @ApiPropertyOptional({ type: Date, nullable: true })
  lastLoginAt!: Date | null;
}

export class ProfileTeacherDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ActivationStatus, enumName: 'ActivationStatus' })
  status!: ActivationStatus;
  @ApiProperty({ type: String, format: 'date' }) joinedAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) qualification!:
    string | null;
}

export class ProfileStudentDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: RecordStatus, enumName: 'RecordStatus' })
  status!: RecordStatus;
  @ApiProperty({ type: String, format: 'date' }) registrationDate!: string;
}

/** ملفي الشخصي — the signed-in person, their account (read-only) and domain profiles. */
export class ProfileDto {
  @ApiProperty({ type: ProfilePersonDto }) person!: ProfilePersonDto;
  @ApiProperty({ type: ProfileAccountDto }) account!: ProfileAccountDto;
  @ApiPropertyOptional({ type: ProfileTeacherDto, nullable: true })
  teacher!: ProfileTeacherDto | null;
  @ApiPropertyOptional({ type: ProfileStudentDto, nullable: true })
  student!: ProfileStudentDto | null;
}
