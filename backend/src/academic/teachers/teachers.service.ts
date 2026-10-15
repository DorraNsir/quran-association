import { Injectable } from '@nestjs/common';

import { fromDbDate, toDbDate } from '../../common/dates.js';
import {
  badRequest,
  conflict,
  isUniqueViolation,
  notFound,
} from '../../common/errors.js';
import { PageSizeService } from '../../common/page-size.service.js';
import { paginationMeta } from '../../common/pagination.js';
import {
  ActivationStatus,
  type Prisma,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  accountSummarySelect,
  classBriefSelect,
  toClassRef,
} from '../teacher-assignments.js';
import type {
  CreateTeacherDto,
  TeacherDetailDto,
  TeacherDto,
  TeacherListDto,
  TeacherListQueryDto,
  UpdateTeacherDto,
} from './teacher.dto.js';

const NOT_ARCHIVED = {
  status: { not: 'ARCHIVED' },
} satisfies Prisma.GroupClassWhereInput;

const select = {
  id: true,
  status: true,
  joinedAt: true,
  qualification: true,
  person: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      gender: true,
      phone: true,
      email: true,
      address: true,
      photoUrl: true,
      user: { select: accountSummarySelect },
    },
  },
  _count: {
    select: {
      supervisedClasses: { where: NOT_ARCHIVED },
      assistedClasses: { where: { groupClass: NOT_ARCHIVED } },
    },
  },
} satisfies Prisma.TeacherSelect;

type Row = Prisma.TeacherGetPayload<{ select: typeof select }>;

function toDto(t: Row): TeacherDto {
  const { user, ...person } = t.person;
  return {
    id: t.id,
    status: t.status,
    joinedAt: fromDbDate(t.joinedAt),
    qualification: t.qualification,
    person,
    account: user ? { ...user, roles: user.roles.map((r) => r.role) } : null,
    supervisedClassesCount: t._count.supervisedClasses,
    assistedClassesCount: t._count.assistedClasses,
  };
}

export const teacherNotFound = () =>
  notFound('TEACHER_NOT_FOUND', 'المعلم غير موجود');

/**
 * Teacher = domain profile of a canonical Person (name, phone, photo live on
 * Person). Creating a teacher never creates or changes an account; deactivating
 * one never removes the TEACHER role (account administration is separate).
 */
@Injectable()
export class TeachersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pageSizes: PageSizeService,
  ) {}

  async list(query: TeacherListQueryDto): Promise<TeacherListDto> {
    const pageSize = await this.pageSizes.resolve(query.pageSize);
    const search = query.search;
    const where: Prisma.TeacherWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            person: {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search.replace(/\s/g, '') } },
              ],
            },
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.teacher.count({ where }),
      this.prisma.teacher.findMany({
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

  async get(id: string): Promise<TeacherDetailDto> {
    const teacher = await this.prisma.teacher.findUnique({
      where: { id },
      select: {
        ...select,
        supervisedClasses: {
          where: NOT_ARCHIVED,
          select: classBriefSelect,
          orderBy: { createdAt: 'asc' },
        },
        assistedClasses: {
          where: { groupClass: NOT_ARCHIVED },
          select: { groupClass: { select: classBriefSelect } },
          orderBy: { assignedAt: 'asc' },
        },
      },
    });
    if (!teacher) throw teacherNotFound();
    return Object.assign(toDto(teacher), {
      supervisedClasses: teacher.supervisedClasses.map(toClassRef),
      assistedClasses: teacher.assistedClasses.map((a) =>
        toClassRef(a.groupClass),
      ),
    });
  }

  /** Person (existing or new) + Teacher, atomically; one teacher profile per person. */
  async create(dto: CreateTeacherDto): Promise<TeacherDetailDto> {
    if (Boolean(dto.personId) === Boolean(dto.person)) {
      throw badRequest(
        'PERSON_REQUIRED',
        'حدّد شخصًا موجودًا (personId) أو بيانات شخص جديد (person) — واحدًا منهما فقط',
      );
    }
    const teacher = {
      joinedAt: toDbDate(dto.joinedAt),
      qualification: dto.qualification ?? null,
      status: dto.status ?? ActivationStatus.ACTIVE,
    };
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        if (dto.personId) {
          const person = await tx.person.findUnique({
            where: { id: dto.personId },
            select: { teacher: { select: { id: true } } },
          });
          if (!person) throw notFound('PERSON_NOT_FOUND', 'الشخص غير موجود');
          if (person.teacher)
            throw conflict(
              'TEACHER_PROFILE_EXISTS',
              'لهذا الشخص ملف معلم بالفعل',
            );
          return (
            await tx.teacher.create({
              data: { ...teacher, personId: dto.personId },
              select: { id: true },
            })
          ).id;
        }
        const { firstName, lastName, gender, phone, email, address } =
          dto.person!;
        const person = await tx.person.create({
          data: {
            firstName,
            lastName,
            gender,
            phone,
            email,
            address,
            teacher: { create: teacher },
          },
          select: { teacher: { select: { id: true } } },
        });
        return person.teacher!.id;
      });
      return this.get(id);
    } catch (error) {
      if (isUniqueViolation(error, 'personId'))
        throw conflict('TEACHER_PROFILE_EXISTS', 'لهذا الشخص ملف معلم بالفعل');
      throw error;
    }
  }

  /** Teacher fields + canonical Person fields in one transaction. */
  async update(id: string, dto: UpdateTeacherDto): Promise<TeacherDetailDto> {
    if (dto.person?.phone === null)
      throw badRequest('PHONE_REQUIRED', 'رقم هاتف المعلم مطلوب');
    await this.prisma.$transaction(async (tx) => {
      const teacher = await tx.teacher.findUnique({
        where: { id },
        select: { personId: true },
      });
      if (!teacher) throw teacherNotFound();
      await tx.teacher.update({
        where: { id },
        data: {
          joinedAt: dto.joinedAt ? toDbDate(dto.joinedAt) : undefined,
          qualification: dto.qualification,
        },
      });
      if (dto.person) {
        const { firstName, lastName, gender, phone, email, address } =
          dto.person;
        await tx.person.update({
          where: { id: teacher.personId },
          data: { firstName, lastName, gender, phone, email, address },
        });
      }
    });
    return this.get(id);
  }

  /**
   * Like the admin UI, deactivating does not detach the teacher from its
   * classes (the admin then appoints a replacement); an inactive teacher
   * cannot receive NEW assignments.
   */
  async setStatus(
    id: string,
    status: ActivationStatus,
  ): Promise<TeacherDetailDto> {
    await this.get(id);
    await this.prisma.teacher.update({ where: { id }, data: { status } });
    return this.get(id);
  }
}
