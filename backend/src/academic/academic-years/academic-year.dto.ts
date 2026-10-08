import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { IsDateOnly } from '../../common/dates.js';
import { trim } from '../shared.dto.js';

/** Two semesters per year: FIRST = [startDate, semester2StartDate), SECOND = [semester2StartDate, endDate]. */
export class CreateAcademicYearDto {
  @ApiProperty({ example: '2027–2028' })
  @Transform(trim)
  @IsString()
  @MinLength(4)
  @MaxLength(20)
  label!: string;

  @IsDateOnly() startDate!: string;
  @IsDateOnly() endDate!: string;
  @IsDateOnly({
    description:
      'First day of the second semester (the first ends the day before)',
  })
  semester2StartDate!: string;
}

/** isCurrent is NOT editable here — use POST …/:id/set-current. */
export class UpdateAcademicYearDto extends PartialType(CreateAcademicYearDto) {}

export class SemesterRangeDto {
  @ApiProperty({ format: 'date' }) startDate!: string;
  @ApiProperty({ format: 'date' }) endDate!: string;
}

export class AcademicYearDto {
  @ApiProperty() id!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ format: 'date' }) startDate!: string;
  @ApiProperty({ format: 'date' }) endDate!: string;
  @ApiProperty({ format: 'date' }) semester2StartDate!: string;
  @ApiProperty() isCurrent!: boolean;
  @ApiProperty({ type: SemesterRangeDto }) firstSemester!: SemesterRangeDto;
  @ApiProperty({ type: SemesterRangeDto }) secondSemester!: SemesterRangeDto;
}
