import { Injectable } from '@nestjs/common';

import { fromDbDate, toDbDate } from '../common/dates.js';
import { conflict, isUniqueViolation, notFound } from '../common/errors.js';
import { platformToday } from '../common/platform-clock.js';
import { type AcademicYear, Semester } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  TeacherAccessService,
  type DateRange,
} from '../teaching/teacher-access.service.js';
import type {
  ClassMemorizationDto,
  MemorizationRecordDto,
  SemesterRefDto,
  StudentMemorizationQueryDto,
  UpsertMemorizationDto,
} from './memorization.dto.js';
import { surahName } from './surahs.js';

export type MemorizationActor =
  { kind: 'admin'; userId: string } | { kind: 'teacher'; userId: string };

const DAY_MS = 86_400_000;

/** FIRST = [startDate, semester2StartDate − 1 day], SECOND = [semester2StartDate, endDate]. */
export function semesterRange(
  year: Pick<AcademicYear, 'startDate' | 'endDate' | 'semester2StartDate'>,
  semester: Semester,
): DateRange {
  return semester === Semester.FIRST
    ? {
        from: fromDbDate(year.startDate),
        to: fromDbDate(new Date(year.semester2StartDate.getTime() - DAY_MS)),
      }
    : {
        from: fromDbDate(year.semester2StartDate),
        to: fromDbDate(year.endDate),
      };
}

const recordSelect = {
  studentId: true,
  semester: true,
  lastMemorizedSurahNumber: true,
  updatedAt: true,
  academicYear: { select: { id: true, label: true } },
  updatedBy: { select: { username: true } },
} as const;

type RecordRow = {
  studentId: string;
  semester: Semester;
  lastMemorizedSurahNumber: number;
  updatedAt: Date;
  academicYear: { id: string; label: string };
  updatedBy: { username: string } | null;
};

const toDto = (r: RecordRow): MemorizationRecordDto => ({
  studentId: r.studentId,
  academicYear: r.academicYear,
  semester: r.semester,
  lastMemorizedSurahNumber: r.lastMemorizedSurahNumber,
  surahName: surahName(r.lastMemorizedSurahNumber)!,
  updatedAt: r.updatedAt,
  updatedBy: r.updatedBy?.username ?? null,
});

/**
 * متابعة الحفظ — one "last memorized surah" per (student, academic year,
 * semester), stored as the canonical surah number (DB: unique key + CHECK
 * 1–114). A position, not a grade: no progression rule between semesters.
 *
 * Eligibility: the student was ENROLLED (any class) during that semester.
 * Teachers: only for students of classes they may access for that semester
 * (TeacherAccessService.assertStudentAccess). The updater is always the
 * authenticated user.
 */
@Injectable()
export class MemorizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TeacherAccessService,
  ) {}

  /** All records of a student (admin), newest year first. */
  async forStudent(
    studentId: string,
    query: StudentMemorizationQueryDto,
  ): Promise<MemorizationRecordDto[]> {
    await this.assertStudent(studentId);
    if (query.academicYearId) await this.year(query.academicYearId);
    const rows = await this.prisma.memorizationProgress.findMany({
      where: {
        studentId,
        ...(query.academicYearId
          ? { academicYearId: query.academicYearId }
          : {}),
      },
      select: recordSelect,
      orderBy: [{ academicYear: { startDate: 'desc' } }, { semester: 'asc' }],
    });
    return rows.map(toDto);
  }

  /** One semester of one student; null when not recorded yet. */
  async one(
    studentId: string,
    ref: SemesterRefDto,
    actor: MemorizationActor,
  ): Promise<MemorizationRecordDto | null> {
    await this.assertStudent(studentId);
    const year = await this.year(ref.academicYearId);
    if (actor.kind === 'teacher')
      await this.access.assertStudentAccess(
        actor.userId,
        studentId,
        semesterRange(year, ref.semester),
      );
    const row = await this.prisma.memorizationProgress.findUnique({
      where: {
        studentId_academicYearId_semester: {
          studentId,
          academicYearId: ref.academicYearId,
          semester: ref.semester,
        },
      },
      select: recordSelect,
    });
    return row ? toDto(row) : null;
  }

  /** Create or update THE record of (student, year, semester); concurrent writes converge on one row. */
  async upsert(
    studentId: string,
    dto: UpsertMemorizationDto,
    actor: MemorizationActor,
  ): Promise<MemorizationRecordDto> {
    await this.assertStudent(studentId);
    const year = await this.year(dto.academicYearId);
    const range = semesterRange(year, dto.semester);
    if (actor.kind === 'teacher')
      await this.access.assertStudentAccess(actor.userId, studentId, range);
    await this.assertEnrolledDuring(studentId, range);

    const key = {
      studentId,
      academicYearId: dto.academicYearId,
      semester: dto.semester,
    };
    const write = () =>
      this.prisma.memorizationProgress.upsert({
        where: { studentId_academicYearId_semester: key },
        create: {
          ...key,
          lastMemorizedSurahNumber: dto.lastMemorizedSurahNumber,
          updatedByUserId: actor.userId,
        },
        update: {
          lastMemorizedSurahNumber: dto.lastMemorizedSurahNumber,
          updatedByUserId: actor.userId,
        },
        select: recordSelect,
      });
    try {
      return toDto(await write());
    } catch (error) {
      // Two first writes at once: the loser retries as an update of the winner's row
      if (isUniqueViolation(error)) return toDto(await write());
      throw error;
    }
  }

  /** Students enrolled in the class during the semester, with their value (or null). */
  async forClass(
    groupClassId: string,
    ref: SemesterRefDto,
    actor: MemorizationActor,
  ): Promise<ClassMemorizationDto> {
    const [groupClass, year] = await Promise.all([
      this.prisma.groupClass.findUnique({
        where: { id: groupClassId },
        select: { id: true, group: { select: { id: true, name: true } } },
      }),
      this.year(ref.academicYearId),
    ]);
    if (!groupClass)
      throw notFound('GROUP_CLASS_NOT_FOUND', 'الحلقة غير موجودة');
    const range = semesterRange(year, ref.semester);
    if (actor.kind === 'teacher')
      await this.access.assertClassAccess(actor.userId, groupClassId, range);

    const today = await platformToday(this.prisma);
    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: {
        groupClassId,
        startDate: { lte: toDbDate(range.to) },
        OR: [{ endDate: null }, { endDate: { gt: toDbDate(range.from) } }],
      },
      select: {
        studentId: true,
        endDate: true,
        student: {
          select: {
            status: true,
            person: {
              select: { firstName: true, lastName: true, photoUrl: true },
            },
          },
        },
      },
    });
    const progress = await this.prisma.memorizationProgress.findMany({
      where: {
        academicYearId: ref.academicYearId,
        semester: ref.semester,
        studentId: { in: enrollments.map((e) => e.studentId) },
      },
      select: {
        studentId: true,
        lastMemorizedSurahNumber: true,
        updatedAt: true,
      },
    });
    const byStudent = new Map(progress.map((p) => [p.studentId, p]));
    const students = new Map<
      string,
      ClassMemorizationDto['students'][number]
    >();
    for (const e of enrollments) {
      const current = e.endDate === null || fromDbDate(e.endDate) > today;
      const existing = students.get(e.studentId);
      if (existing) {
        existing.currentMember ||= current;
        continue;
      }
      const p = byStudent.get(e.studentId);
      students.set(e.studentId, {
        studentId: e.studentId,
        ...e.student.person,
        studentStatus: e.student.status,
        currentMember: current,
        lastMemorizedSurahNumber: p?.lastMemorizedSurahNumber ?? null,
        surahName: p ? surahName(p.lastMemorizedSurahNumber)! : null,
        updatedAt: p?.updatedAt ?? null,
      });
    }
    return {
      groupClass,
      academicYear: { id: year.id, label: year.label },
      semester: ref.semester,
      period: range,
      students: [...students.values()].sort(
        (a, b) =>
          a.lastName.localeCompare(b.lastName, 'ar') ||
          a.firstName.localeCompare(b.firstName, 'ar'),
      ),
    };
  }

  // ───────────────────────── helpers ─────────────────────────

  private async year(id: string) {
    const year = await this.prisma.academicYear.findUnique({ where: { id } });
    if (!year)
      throw notFound('ACADEMIC_YEAR_NOT_FOUND', 'السنة الدراسية غير موجودة');
    return year;
  }

  private async assertStudent(studentId: string) {
    if (
      !(await this.prisma.student.findUnique({
        where: { id: studentId },
        select: { id: true },
      }))
    ) {
      throw notFound('STUDENT_NOT_FOUND', 'الطالب غير موجود');
    }
  }

  private async assertEnrolledDuring(studentId: string, range: DateRange) {
    const enrolled = await this.prisma.studentEnrollment.count({
      where: {
        studentId,
        startDate: { lte: toDbDate(range.to) },
        OR: [{ endDate: null }, { endDate: { gt: toDbDate(range.from) } }],
      },
    });
    if (!enrolled) {
      throw conflict(
        'MEMORIZATION_STUDENT_NOT_ENROLLED',
        'لم يكن الطالب مسجّلًا في أي حلقة خلال هذا السداسي',
      );
    }
  }
}
