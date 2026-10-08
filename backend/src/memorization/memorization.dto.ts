import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

import { RecordStatus, Semester } from '../generated/prisma/enums.js';
import { SURAH_COUNT } from './surahs.js';

/** Exactly two semesters per academic year: FIRST, SECOND. */
export class SemesterRefDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() academicYearId!: string;
  @ApiProperty({ enum: Semester, enumName: 'Semester' })
  @IsEnum(Semester, { message: 'السداسي غير صالح (FIRST أو SECOND)' })
  semester!: Semester;
}

/**
 * The LAST memorized surah (canonical number 1–114) — a reported position,
 * not a grade or a percentage; no progression is enforced between semesters.
 */
export class UpsertMemorizationDto extends SemesterRefDto {
  @ApiProperty({
    minimum: 1,
    maximum: SURAH_COUNT,
    example: 78,
    description: 'Canonical surah number (mushaf order)',
  })
  @Type(() => Number)
  @IsInt({ message: 'رقم السورة غير صالح' })
  @Min(1, { message: 'رقم السورة بين 1 و114' })
  @Max(SURAH_COUNT, { message: 'رقم السورة بين 1 و114' })
  lastMemorizedSurahNumber!: number;
}

export class StudentMemorizationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  academicYearId?: string;
}

export class MemorizationRecordDto {
  @ApiProperty() studentId!: string;
  @ApiProperty() academicYear!: { id: string; label: string };
  @ApiProperty({ enum: Semester, enumName: 'Semester' }) semester!: Semester;
  @ApiProperty() lastMemorizedSurahNumber!: number;
  @ApiProperty({ example: 'النبأ' }) surahName!: string;
  @ApiProperty() updatedAt!: Date;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Username of the last updater',
  })
  updatedBy!: string | null;
}

export class ClassMemorizationStudentDto {
  @ApiProperty() studentId!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) photoUrl!:
    string | null;
  @ApiProperty({ enum: RecordStatus, enumName: 'RecordStatus' })
  studentStatus!: RecordStatus;
  @ApiProperty({ description: 'Still in this class today' })
  currentMember!: boolean;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'null = not recorded yet',
  })
  lastMemorizedSurahNumber!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) surahName!:
    string | null;
  @ApiPropertyOptional({ type: Date, nullable: true }) updatedAt!: Date | null;
}

export class ClassMemorizationDto {
  @ApiProperty() groupClass!: {
    id: string;
    group: { id: string; name: string };
  };
  @ApiProperty() academicYear!: { id: string; label: string };
  @ApiProperty({ enum: Semester, enumName: 'Semester' }) semester!: Semester;
  @ApiProperty({ description: 'Semester dates (inclusive)' }) period!: {
    from: string;
    to: string;
  };
  @ApiProperty({
    type: ClassMemorizationStudentDto,
    isArray: true,
    description: 'Students enrolled in the class during the semester',
  })
  students!: ClassMemorizationStudentDto[];
}
