import { Injectable } from '@nestjs/common';

import { fromDbDate, fromDbDateOrNull, toDbDate } from '../../common/dates.js';
import {
  badRequest,
  conflict,
  isUniqueViolation,
  notFound,
} from '../../common/errors.js';
import { PageSizeService } from '../../common/page-size.service.js';
import { paginationMeta } from '../../common/pagination.js';
import { type Prisma, RecordStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { classNotFound } from '../group-classes/group-classes.service.js';
import {
  accountSummarySelect,
  classBriefSelect,
} from '../teacher-assignments.js';
import type {
  CreateStudentDto,
  StudentDto,
  StudentListDto,
  StudentListQueryDto,
  UpdateStudentDto,
} from './student.dto.js';

type Tx = Prisma.TransactionClient;

const select = {
  id: true,
  status: true,
  registrationDate: true,
  guardianPhone: true,
  cin: true,
  person: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      gender: true,
      dateOfBirth: true,
      phone: true,
      email: true,
      address: true,
      photoUrl: true,
      user: { select: accountSummarySelect },
    },
  },
  groupClass: {
    select: {
      ...classBriefSelect,
      supervisor: {
        select: {
          id: true,
          person: { select: { firstName: true, lastName: true } },
        },
      },
    },
  },
} satisfies Prisma.StudentSelect;

type Row = Prisma.StudentGetPayload<{ select: typeof select }>;

function toDto(s: Row): StudentDto {
  const { user, dateOfBirth, ...person } = s.person;
  const c = s.groupClass;
  return {
    id: s.id,
    status: s.status,
    registrationDate: fromDbDate(s.registrationDate),
    guardianPhone: s.guardianPhone,
    cin: s.cin,
    person: { ...person, dateOfBirth: fromDbDateOrNull(dateOfBirth) },
    groupClass: c
      ? {
          id: c.id,
          status: c.status,
          group: c.group,
          branch: c.branch,
          room: c.room,
          supervisor: { id: c.supervisor.id, ...c.supervisor.person },
        }
      : null,
    account: user ? { ...user, roles: user.roles.map((r) => r.role) } : null,
  };
}

export const studentNotFound = () =>
  notFound('STUDENT_NOT_FOUND', 'الطالب غير موجود');
const cinTaken = () =>
  conflict('CIN_TAKEN', 'رقم بطاقة التعريف مسجّل لطالب آخر');

/** Age in full years on `today` (UTC calendar dates). */
function ageOn(
  dateOfBirth: string,
  today = new Date().toISOString().slice(0, 10),
) {
  const [y, m, d] = dateOfBirth.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

/**
 * Student = domain profile of a canonical Person. The CURRENT class is the
 * single Student.groupClassId column, so a student can never be in two
 * classes; group, branch, room and supervisor are derived from it (never
 * copied). Past attendance, notes and memorization keep their own links.
 */
@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pageSizes: PageSizeService,
  ) {}

  async list(query: StudentListQueryDto): Promise<StudentListDto> {
    const pageSize = await this.pageSizes.resolve(query.pageSize);
    const search = query.search;
    const digits = search?.replace(/\D/g, '');
    const classFilter: Prisma.GroupClassWhereInput = {
      ...(query.groupId ? { groupId: query.groupId } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.supervisorId ? { supervisorId: query.supervisorId } : {}),
    };
    const where: Prisma.StudentWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.groupClassId ? { groupClassId: query.groupClassId } : {}),
      ...(Object.keys(classFilter).length ? { groupClass: classFilter } : {}),
      ...(search
        ? {
            OR: [
              {
                person: {
                  firstName: { contains: search, mode: 'insensitive' },
                },
              },
              {
                person: { lastName: { contains: search, mode: 'insensitive' } },
              },
              ...(digits && digits.length >= 3
                ? [
                    { person: { phone: { contains: digits } } },
                    { guardianPhone: { contains: digits } },
                    { cin: { contains: digits } },
                  ]
                : []),
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.student.count({ where }),
      this.prisma.student.findMany({
        where,
        select,
        orderBy: [
          { person: { lastName: 'asc' } },
          { person: { firstName: 'asc' } },
          { id: 'asc' },
        ],
        skip: (query.page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map(toDto),
      meta: paginationMeta(query.page, pageSize, total),
    };
  }

  async get(id: string): Promise<StudentDto> {
    const student = await this.prisma.student.findUnique({
      where: { id },
      select,
    });
    if (!student) throw studentNotFound();
    return toDto(student);
  }

  /** Person (existing or new) + Student in ONE active class, atomically. */
  async create(dto: CreateStudentDto): Promise<StudentDto> {
    if (Boolean(dto.personId) === Boolean(dto.person)) {
      throw badRequest(
        'PERSON_REQUIRED',
        'حدّد شخصًا موجودًا (personId) أو بيانات شخص جديد (person) — واحدًا منهما فقط',
      );
    }
    const student = {
      registrationDate: toDbDate(dto.registrationDate),
      guardianPhone: dto.guardianPhone ?? null,
      cin: dto.cin ?? null,
      status: dto.status ?? RecordStatus.ACTIVE,
      groupClassId: dto.groupClassId,
    };
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        await this.assertClassOpen(tx, dto.groupClassId);
        if (dto.personId) {
          const person = await tx.person.findUnique({
            where: { id: dto.personId },
            select: {
              dateOfBirth: true,
              phone: true,
              student: { select: { id: true } },
            },
          });
          if (!person) throw notFound('PERSON_NOT_FOUND', 'الشخص غير موجود');
          if (person.student)
            throw conflict(
              'STUDENT_PROFILE_EXISTS',
              'لهذا الشخص ملف طالب بالفعل',
            );
          this.assertContactRule(
            fromDbDateOrNull(person.dateOfBirth),
            person.phone,
            student.guardianPhone,
          );
          return (
            await tx.student.create({
              data: { ...student, personId: dto.personId },
              select: { id: true },
            })
          ).id;
        }
        const p = dto.person!;
        this.assertContactRule(
          p.dateOfBirth,
          p.phone ?? null,
          student.guardianPhone,
        );
        const created = await tx.person.create({
          data: {
            firstName: p.firstName,
            lastName: p.lastName,
            gender: p.gender,
            dateOfBirth: toDbDate(p.dateOfBirth),
            address: p.address,
            phone: p.phone ?? null,
            email: p.email ?? null,
            student: { create: student },
          },
          select: { student: { select: { id: true } } },
        });
        return created.student!.id;
      });
      return this.get(id);
    } catch (error) {
      if (isUniqueViolation(error, 'cin')) throw cinTaken();
      if (isUniqueViolation(error, 'personId'))
        throw conflict('STUDENT_PROFILE_EXISTS', 'لهذا الشخص ملف طالب بالفعل');
      throw error;
    }
  }

  /** Student fields + canonical Person fields in one transaction (contact rule re-checked). */
  async update(id: string, dto: UpdateStudentDto): Promise<StudentDto> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const current = await tx.student.findUnique({
          where: { id },
          select: {
            personId: true,
            guardianPhone: true,
            person: { select: { dateOfBirth: true, phone: true } },
          },
        });
        if (!current) throw studentNotFound();
        const p = dto.person;
        const dateOfBirth =
          p?.dateOfBirth ?? fromDbDateOrNull(current.person.dateOfBirth);
        const phone = p?.phone !== undefined ? p.phone : current.person.phone;
        const guardianPhone =
          dto.guardianPhone !== undefined
            ? dto.guardianPhone
            : current.guardianPhone;
        this.assertContactRule(dateOfBirth, phone, guardianPhone);
        if (p?.address === null)
          throw badRequest('ADDRESS_REQUIRED', 'العنوان مطلوب');

        await tx.student.update({
          where: { id },
          data: {
            registrationDate: dto.registrationDate
              ? toDbDate(dto.registrationDate)
              : undefined,
            guardianPhone: dto.guardianPhone,
            cin: dto.cin,
          },
        });
        if (p) {
          await tx.person.update({
            where: { id: current.personId },
            data: {
              firstName: p.firstName,
              lastName: p.lastName,
              gender: p.gender,
              dateOfBirth: p.dateOfBirth ? toDbDate(p.dateOfBirth) : undefined,
              phone: p.phone,
              email: p.email,
              address: p.address,
            },
          });
        }
      });
    } catch (error) {
      if (isUniqueViolation(error, 'cin')) throw cinTaken();
      throw error;
    }
    return this.get(id);
  }

  /**
   * Assign / move to another ACTIVE class: one column update, so the student
   * is never in two classes. Nothing historical is rewritten (sessions,
   * attendance, notes, memorization keep their own references).
   */
  async assignGroupClass(
    id: string,
    groupClassId: string,
  ): Promise<StudentDto> {
    await this.prisma.$transaction(async (tx) => {
      const student = await tx.student.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!student) throw studentNotFound();
      await this.assertClassOpen(tx, groupClassId);
      await tx.student.update({ where: { id }, data: { groupClassId } });
    });
    return this.get(id);
  }

  /** (Re)activating a student requires an ACTIVE current class. Account roles are untouched. */
  async setStatus(id: string, status: RecordStatus): Promise<StudentDto> {
    await this.prisma.$transaction(async (tx) => {
      const student = await tx.student.findUnique({
        where: { id },
        select: { status: true, groupClassId: true },
      });
      if (!student) throw studentNotFound();
      if (
        status === RecordStatus.ACTIVE &&
        student.status !== RecordStatus.ACTIVE
      ) {
        if (!student.groupClassId)
          throw conflict(
            'GROUP_CLASS_REQUIRED',
            'يجب إسناد الطالب إلى حلقة نشطة قبل تفعيله',
          );
        await this.assertClassOpen(tx, student.groupClassId);
      }
      await tx.student.update({ where: { id }, data: { status } });
    });
    return this.get(id);
  }

  private async assertClassOpen(tx: Tx, groupClassId: string) {
    const groupClass = await tx.groupClass.findUnique({
      where: { id: groupClassId },
      select: { status: true },
    });
    if (!groupClass) throw classNotFound();
    if (groupClass.status !== RecordStatus.ACTIVE) {
      throw conflict('GROUP_CLASS_INACTIVE', 'الحلقة غير نشطة: اختر حلقة نشطة');
    }
  }

  /** Frontend rule: birth date required; adult → own phone, minor (< 18) → guardian phone. */
  private assertContactRule(
    dateOfBirth: string | null,
    phone: string | null | undefined,
    guardianPhone: string | null | undefined,
  ) {
    if (!dateOfBirth)
      throw badRequest('DATE_OF_BIRTH_REQUIRED', 'تاريخ الولادة مطلوب');
    if (ageOn(dateOfBirth) < 18) {
      if (!guardianPhone)
        throw badRequest(
          'GUARDIAN_PHONE_REQUIRED',
          'هاتف الولي مطلوب للطالب القاصر',
        );
    } else if (!phone) {
      throw badRequest('PHONE_REQUIRED', 'رقم هاتف الطالب مطلوب');
    }
  }
}
