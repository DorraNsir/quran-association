import { Injectable } from '@nestjs/common';

import { fromDbDate, toDbDate } from '../../common/dates.js';
import {
  badRequest,
  conflict,
  isUniqueViolation,
  notFound,
  violatesConstraint,
} from '../../common/errors.js';
import type { AcademicYear } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  AcademicYearDto,
  CreateAcademicYearDto,
  UpdateAcademicYearDto,
} from './academic-year.dto.js';

const DAY_MS = 86_400_000;

function toDto(y: AcademicYear): AcademicYearDto {
  return {
    id: y.id,
    label: y.label,
    startDate: fromDbDate(y.startDate),
    endDate: fromDbDate(y.endDate),
    semester2StartDate: fromDbDate(y.semester2StartDate),
    isCurrent: y.isCurrent,
    firstSemester: {
      startDate: fromDbDate(y.startDate),
      endDate: fromDbDate(new Date(y.semester2StartDate.getTime() - DAY_MS)),
    },
    secondSemester: {
      startDate: fromDbDate(y.semester2StartDate),
      endDate: fromDbDate(y.endDate),
    },
  };
}

const yearNotFound = () =>
  notFound('ACADEMIC_YEAR_NOT_FOUND', 'السنة الدراسية غير موجودة');

/**
 * Academic years (Part 4 model: exactly two semesters, dates only). One
 * current year at most — enforced by a partial unique index; years never
 * overlap — enforced by an EXCLUDE constraint. Changing the current year
 * only moves the flag: historical data keeps its own academicYearId.
 */
@Injectable()
export class AcademicYearsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<AcademicYearDto[]> {
    return (
      await this.prisma.academicYear.findMany({
        orderBy: { startDate: 'desc' },
      })
    ).map(toDto);
  }

  async get(id: string): Promise<AcademicYearDto> {
    const year = await this.prisma.academicYear.findUnique({ where: { id } });
    if (!year) throw yearNotFound();
    return toDto(year);
  }

  async create(dto: CreateAcademicYearDto): Promise<AcademicYearDto> {
    this.validateDates(dto.startDate, dto.endDate, dto.semester2StartDate);
    await this.assertNoOverlap(dto.startDate, dto.endDate);
    return this.write(() =>
      this.prisma.academicYear.create({
        data: {
          label: dto.label,
          startDate: toDbDate(dto.startDate),
          endDate: toDbDate(dto.endDate),
          semester2StartDate: toDbDate(dto.semester2StartDate),
        },
      }),
    );
  }

  async update(
    id: string,
    dto: UpdateAcademicYearDto,
  ): Promise<AcademicYearDto> {
    const current = await this.prisma.academicYear.findUnique({
      where: { id },
    });
    if (!current) throw yearNotFound();
    const startDate = dto.startDate ?? fromDbDate(current.startDate);
    const endDate = dto.endDate ?? fromDbDate(current.endDate);
    const semester2StartDate =
      dto.semester2StartDate ?? fromDbDate(current.semester2StartDate);
    this.validateDates(startDate, endDate, semester2StartDate);
    await this.assertNoOverlap(startDate, endDate, id);
    return this.write(() =>
      this.prisma.academicYear.update({
        where: { id },
        data: {
          label: dto.label,
          startDate: toDbDate(startDate),
          endDate: toDbDate(endDate),
          semester2StartDate: toDbDate(semester2StartDate),
        },
      }),
    );
  }

  /** Atomic switch: clear the old flag and set the new one in ONE transaction. */
  async setCurrent(id: string): Promise<AcademicYearDto> {
    try {
      const year = await this.prisma.$transaction(async (tx) => {
        // Serialize concurrent switches (the partial unique index stays the hard guarantee)
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('academic_years.current'))`;
        const target = await tx.academicYear.findUnique({
          where: { id },
          select: { id: true },
        });
        if (!target) throw yearNotFound();
        await tx.academicYear.updateMany({
          where: { isCurrent: true, id: { not: id } },
          data: { isCurrent: false },
        });
        return tx.academicYear.update({
          where: { id },
          data: { isCurrent: true },
        });
      });
      return toDto(year);
    } catch (error) {
      // A concurrent switch won the race on the single-current index
      if (isUniqueViolation(error)) {
        throw conflict(
          'CURRENT_YEAR_CONFLICT',
          'تم تغيير السنة الحالية في الوقت نفسه، أعد المحاولة',
        );
      }
      throw error;
    }
  }

  private validateDates(
    startDate: string,
    endDate: string,
    semester2StartDate: string,
  ) {
    if (endDate <= startDate)
      throw badRequest(
        'INVALID_DATES',
        'يجب أن يكون تاريخ النهاية بعد تاريخ البداية',
      );
    if (!(semester2StartDate > startDate && semester2StartDate <= endDate)) {
      throw badRequest(
        'INVALID_SEMESTERS',
        'يجب أن تقع بداية السداسي الثاني بعد بداية السنة وقبل نهايتها',
      );
    }
  }

  /** Friendly pre-check; the EXCLUDE constraint still guards concurrent writes. */
  private async assertNoOverlap(
    startDate: string,
    endDate: string,
    exceptId?: string,
  ) {
    const other = await this.prisma.academicYear.findFirst({
      where: {
        ...(exceptId ? { id: { not: exceptId } } : {}),
        startDate: { lte: toDbDate(endDate) },
        endDate: { gte: toDbDate(startDate) },
      },
      select: { label: true },
    });
    if (other)
      throw conflict(
        'YEARS_OVERLAP',
        `تتداخل هذه الفترة مع السنة الدراسية ${other.label}`,
      );
  }

  /** Maps the label unique index and the no-overlap constraint to 409s. */
  private async write(
    op: () => Promise<AcademicYear>,
  ): Promise<AcademicYearDto> {
    try {
      return toDto(await op());
    } catch (error) {
      if (isUniqueViolation(error, 'label'))
        throw conflict('LABEL_TAKEN', 'توجد سنة دراسية بهذا الاسم');
      if (violatesConstraint(error, 'academic_years_no_overlap')) {
        throw conflict('YEARS_OVERLAP', 'تتداخل هذه الفترة مع سنة دراسية أخرى');
      }
      throw error;
    }
  }
}
