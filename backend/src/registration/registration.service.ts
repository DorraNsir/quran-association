import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

import { classNotFound } from '../academic/group-classes/group-classes.service.js';
import {
  ageOn,
  mapStudentWriteError,
  StudentsService,
} from '../academic/students/students.service.js';
import { fromDbDateOrNull, toDbDate } from '../common/dates.js';
import { badRequest, conflict, notFound } from '../common/errors.js';
import { PageSizeService } from '../common/page-size.service.js';
import { paginationMeta } from '../common/pagination.js';
import { platformDayBounds, platformToday } from '../common/platform-clock.js';
import {
  ActivationStatus,
  type Gender,
  type Prisma,
  RecordStatus,
  RegistrationRequestSource,
  RegistrationRequestStatus,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  AcceptRegistrationRequestDto,
  AcceptRegistrationResultDto,
  PublicRegistrationAckDto,
  RegistrationFieldsDto,
  RegistrationRequestDto,
  RegistrationRequestListDto,
  RegistrationRequestListQueryDto,
  RejectRegistrationRequestDto,
  UpdateRegistrationRequestDto,
} from './registration.dto.js';

type Tx = Prisma.TransactionClient;

const userRef = { select: { id: true, username: true } } as const;

const select = {
  id: true,
  firstName: true,
  lastName: true,
  gender: true,
  birthDate: true,
  age: true,
  phone: true,
  guardianPhone: true,
  address: true,
  hasStudiedQuranBefore: true,
  previousExperience: true,
  notes: true,
  source: true,
  status: true,
  submittedAt: true,
  createdBy: userRef,
  reviewedAt: true,
  reviewedBy: userRef,
  rejectionReason: true,
  createdStudent: {
    select: {
      id: true,
      person: { select: { firstName: true, lastName: true } },
    },
  },
  interestedGroup: { select: { id: true, name: true } },
  interestedProgramLabel: true,
} satisfies Prisma.RegistrationRequestSelect;

type Row = Prisma.RegistrationRequestGetPayload<{ select: typeof select }>;

function toDto(r: Row): RegistrationRequestDto {
  const { birthDate, createdStudent, ...rest } = r;
  return {
    ...rest,
    birthDate: fromDbDateOrNull(birthDate),
    createdStudent: createdStudent
      ? { id: createdStudent.id, ...createdStudent.person }
      : null,
  };
}

/** The applicant's data as stored (after merging a PATCH). */
type Applicant = {
  firstName?: string | null;
  lastName?: string | null;
  birthDate?: string | null;
  age?: number | null;
  phone?: string | null;
  guardianPhone?: string | null;
  interestedGroupId?: string | null;
};

export const requestNotFound = () =>
  notFound('REGISTRATION_REQUEST_NOT_FOUND', 'طلب التسجيل غير موجود');
const alreadyReviewed = () =>
  conflict(
    'REGISTRATION_REQUEST_ALREADY_REVIEWED',
    'تمّت معالجة هذا الطلب سابقًا (مقبول أو مرفوض) — لا يمكن تعديله',
  );

/**
 * Registration requests (طلبات التسجيل): ONE model for the public form and for
 * requests entered by an admin. A request is never a student and never an
 * account: only an explicit ADMIN acceptance creates (or links) the Student,
 * through the same student-creation path as the students API.
 */
@Injectable()
export class RegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pageSizes: PageSizeService,
    private readonly students: StudentsService,
  ) {}

  /** Public submission: always PUBLIC_WEBSITE + PENDING, minimal acknowledgment. */
  async submitPublic(
    dto: RegistrationFieldsDto,
  ): Promise<PublicRegistrationAckDto> {
    await this.assertApplicant(dto, { publicForm: true });
    const created = await this.prisma.registrationRequest.create({
      data: {
        ...this.fieldsData(dto),
        source: RegistrationRequestSource.PUBLIC_WEBSITE,
      },
      select: { submittedAt: true },
    });
    return {
      message: 'تم استلام طلب التسجيل، وستتواصل معك الإدارة قريبًا',
      receivedAt: created.submittedAt,
    };
  }

  /** Admin entry: same form and rules, source ADMIN, still PENDING. */
  async create(
    dto: RegistrationFieldsDto,
    adminUserId: string,
  ): Promise<RegistrationRequestDto> {
    await this.assertApplicant(dto, { publicForm: false });
    const created = await this.prisma.registrationRequest.create({
      data: {
        ...this.fieldsData(dto),
        source: RegistrationRequestSource.ADMIN,
        createdByUserId: adminUserId,
      },
      select,
    });
    return toDto(created);
  }

  async list(
    query: RegistrationRequestListQueryDto,
  ): Promise<RegistrationRequestListDto> {
    const pageSize = await this.pageSizes.resolve(query.pageSize);
    const submittedAt = await platformDayBounds(
      this.prisma,
      query.from,
      query.to,
    );
    const search = query.search;
    const digits = search?.replace(/\D/g, '');
    const where: Prisma.RegistrationRequestWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.interestedGroupId
        ? { interestedGroupId: query.interestedGroupId }
        : {}),
      ...(Object.keys(submittedAt).length ? { submittedAt } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              ...(digits && digits.length >= 3
                ? [
                    { phone: { contains: digits } },
                    { guardianPhone: { contains: digits } },
                  ]
                : []),
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.registrationRequest.count({ where }),
      this.prisma.registrationRequest.findMany({
        where,
        select,
        orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map(toDto),
      meta: paginationMeta(query.page, pageSize, total),
    };
  }

  async get(id: string): Promise<RegistrationRequestDto> {
    const row = await this.prisma.registrationRequest.findUnique({
      where: { id },
      select,
    });
    if (!row) throw requestNotFound();
    return toDto(row);
  }

  /** Edit a PENDING request (rules re-checked on the merged data). */
  async update(
    id: string,
    dto: UpdateRegistrationRequestDto,
  ): Promise<RegistrationRequestDto> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lockPending(tx, id);
      const merged: Applicant = {
        firstName: pick(dto.firstName, current.firstName),
        lastName: pick(dto.lastName, current.lastName),
        birthDate: pick(dto.birthDate, fromDbDateOrNull(current.birthDate)),
        age: pick(dto.age, current.age),
        phone: pick(dto.phone, current.phone),
        guardianPhone: pick(dto.guardianPhone, current.guardianPhone),
        interestedGroupId: pick(
          dto.interestedGroupId,
          current.interestedGroupId,
        ),
      };
      if (!merged.firstName || !merged.lastName)
        throw badRequest('NAME_REQUIRED', 'الاسم واللقب مطلوبان');
      if (!merged.phone) throw badRequest('PHONE_REQUIRED', 'رقم الهاتف مطلوب');
      // Changing the interest to the same group never needs re-validation
      const interestChanged =
        dto.interestedGroupId !== undefined &&
        dto.interestedGroupId !== current.interestedGroupId;
      await this.assertApplicant(
        {
          ...merged,
          interestedGroupId: interestChanged ? merged.interestedGroupId : null,
        },
        { publicForm: false },
        tx,
      );
      await tx.registrationRequest.update({
        where: { id },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          gender: dto.gender,
          birthDate:
            dto.birthDate === undefined
              ? undefined
              : dto.birthDate && toDbDate(dto.birthDate),
          age: dto.age,
          phone: dto.phone,
          guardianPhone: dto.guardianPhone,
          address: dto.address,
          hasStudiedQuranBefore: dto.hasStudiedQuranBefore,
          previousExperience: dto.previousExperience,
          notes: dto.notes,
          interestedGroupId: dto.interestedGroupId,
          interestedProgramLabel: dto.interestedProgramLabel,
        },
      });
    });
    return this.get(id);
  }

  /**
   * PENDING → ACCEPTED, atomically: lock the request, check the class (and
   * its group and branch) is active, create the Person + Student (or link an
   * explicitly chosen existing Person) with the first enrollment and status,
   * then mark the request. No account, no credentials, no payment obligation.
   */
  async accept(
    id: string,
    dto: AcceptRegistrationRequestDto,
    reviewerUserId: string,
  ): Promise<AcceptRegistrationResultDto> {
    if (dto.personId && dto.person) {
      throw badRequest(
        'PERSON_CHOICE_AMBIGUOUS',
        'اختر ربط شخص موجود (personId) أو تصحيح بيانات شخص جديد (person) — لا الاثنين معًا',
      );
    }
    let studentId: string;
    try {
      studentId = await this.prisma.$transaction(async (tx) => {
        const request = await this.lockPending(tx, id);
        await this.assertClassAcceptsStudents(tx, dto.groupClassId);
        const today = await platformToday(tx);
        const registrationDate = dto.registrationDate ?? today;
        if (registrationDate > today) {
          throw badRequest(
            'REGISTRATION_DATE_IN_FUTURE',
            'تاريخ التسجيل لا يمكن أن يكون في المستقبل',
          );
        }
        const guardianPhone =
          dto.guardianPhone !== undefined
            ? dto.guardianPhone
            : request.guardianPhone;
        const base = {
          groupClassId: dto.groupClassId,
          registrationDate,
          guardianPhone,
          cin: dto.cin,
        };
        const newStudentId = dto.personId
          ? await this.students.createInTx(
              tx,
              { ...base, personId: dto.personId },
              reviewerUserId,
            )
          : await this.students.createInTx(
              tx,
              {
                ...base,
                person: await this.newPerson(tx, request, dto),
              },
              reviewerUserId,
            );
        await tx.registrationRequest.update({
          where: { id },
          data: {
            status: RegistrationRequestStatus.ACCEPTED,
            reviewedAt: new Date(),
            reviewedByUserId: reviewerUserId,
            createdStudentId: newStudentId,
          },
        });
        return newStudentId;
      });
    } catch (error) {
      throw mapStudentWriteError(error);
    }
    return {
      request: await this.get(id),
      studentId,
      linkedExistingPerson: Boolean(dto.personId),
    };
  }

  /** PENDING → REFUSED with an optional reason; the application is kept, nothing is created. */
  async reject(
    id: string,
    dto: RejectRegistrationRequestDto,
    reviewerUserId: string,
  ): Promise<RegistrationRequestDto> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockPending(tx, id);
      await tx.registrationRequest.update({
        where: { id },
        data: {
          status: RegistrationRequestStatus.REFUSED,
          reviewedAt: new Date(),
          reviewedByUserId: reviewerUserId,
          rejectionReason: dto.reason ?? null,
        },
      });
    });
    return this.get(id);
  }

  /* ---------------------------------------------------------------- */

  /** Row lock: concurrent accept/reject/edit of one request serialize here. */
  private async lockPending(tx: Tx, id: string) {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM registration_requests WHERE id = ${id}::uuid FOR UPDATE`;
    if (!locked.length) throw requestNotFound();
    const request = await tx.registrationRequest.findUniqueOrThrow({
      where: { id },
    });
    if (request.status !== RegistrationRequestStatus.PENDING)
      throw alreadyReviewed();
    return request;
  }

  private fieldsData(dto: RegistrationFieldsDto) {
    return {
      firstName: dto.firstName,
      lastName: dto.lastName,
      gender: dto.gender ?? null,
      birthDate: dto.birthDate ? toDbDate(dto.birthDate) : null,
      age: dto.age ?? null,
      phone: dto.phone,
      guardianPhone: dto.guardianPhone ?? null,
      address: dto.address ?? null,
      hasStudiedQuranBefore: dto.hasStudiedQuranBefore ?? false,
      previousExperience: dto.previousExperience ?? null,
      notes: dto.notes ?? null,
      interestedGroupId: dto.interestedGroupId ?? null,
      interestedProgramLabel: dto.interestedProgramLabel ?? null,
    };
  }

  /**
   * Applicant rules: a birth date OR an age (not both); a real past birth
   * date giving an age of 3–99; a minor (< 18) gives a guardian phone; the
   * interested group exists and is active.
   */
  private async assertApplicant(
    a: Applicant,
    { publicForm }: { publicForm: boolean },
    db: Pick<Tx, 'platformSettings' | 'group'> = this.prisma,
  ) {
    const hasBirthDate = Boolean(a.birthDate);
    const hasAge = a.age !== null && a.age !== undefined;
    if (hasBirthDate === hasAge) {
      throw badRequest(
        'BIRTH_DATE_OR_AGE_REQUIRED',
        'أدخل تاريخ الميلاد أو العمر (واحدًا منهما فقط)',
      );
    }
    let age = a.age ?? 0;
    if (a.birthDate) {
      const today = await platformToday(db);
      if (a.birthDate > today)
        throw badRequest(
          'INVALID_BIRTH_DATE',
          'تاريخ الميلاد لا يمكن أن يكون في المستقبل',
        );
      age = ageOn(a.birthDate, today);
      if (age < 3 || age > 99)
        throw badRequest(
          'INVALID_BIRTH_DATE',
          'تاريخ الميلاد غير مقبول (العمر بين 3 و99 سنة)',
        );
    }
    if (age < 18 && !a.guardianPhone) {
      throw badRequest(
        'GUARDIAN_PHONE_REQUIRED',
        'هاتف الولي مطلوب للمترشّح القاصر',
      );
    }
    if (a.interestedGroupId) {
      const group = await db.group.findUnique({
        where: { id: a.interestedGroupId },
        select: { status: true },
      });
      if (!group || group.status !== RecordStatus.ACTIVE) {
        // Same answer for "missing" and "inactive" on the public form (no probing)
        throw publicForm
          ? badRequest(
              'INTERESTED_GROUP_INVALID',
              'المجموعة المختارة غير متاحة',
            )
          : group
            ? conflict('GROUP_INACTIVE', 'المجموعة غير نشطة')
            : notFound('GROUP_NOT_FOUND', 'المجموعة غير موجودة');
      }
    }
  }

  /** The class must be ACTIVE and so must its group and branch. */
  private async assertClassAcceptsStudents(tx: Tx, groupClassId: string) {
    const groupClass = await tx.groupClass.findUnique({
      where: { id: groupClassId },
      select: {
        status: true,
        group: { select: { status: true } },
        branch: { select: { status: true } },
      },
    });
    if (!groupClass) throw classNotFound();
    if (groupClass.status !== RecordStatus.ACTIVE)
      throw conflict('GROUP_CLASS_INACTIVE', 'الحلقة غير نشطة: اختر حلقة نشطة');
    if (groupClass.group.status !== RecordStatus.ACTIVE)
      throw conflict('GROUP_INACTIVE', 'مجموعة هذه الحلقة غير نشطة');
    if (groupClass.branch.status !== ActivationStatus.ACTIVE)
      throw conflict('BRANCH_INACTIVE', 'فرع هذه الحلقة غير نشط');
  }

  /**
   * The new Person from the request (+ admin corrections). People with the
   * same full name or phone are never merged silently: unless the admin
   * confirms a new person (confirmNewPerson) — or links one with personId —
   * acceptance stops with POSSIBLE_DUPLICATE_PERSON and the candidates.
   */
  private async newPerson(
    tx: Tx,
    request: {
      firstName: string;
      lastName: string;
      gender: Gender | null;
      birthDate: Date | null;
      address: string | null;
      phone: string;
    },
    dto: AcceptRegistrationRequestDto,
  ) {
    const o = dto.person ?? {};
    const person = {
      firstName: o.firstName ?? request.firstName,
      lastName: o.lastName ?? request.lastName,
      gender: o.gender ?? request.gender,
      dateOfBirth: o.dateOfBirth ?? fromDbDateOrNull(request.birthDate),
      address: o.address ?? request.address,
      phone: o.phone !== undefined ? o.phone : request.phone,
      email: o.email ?? null,
    };
    const missing = (['gender', 'dateOfBirth', 'address'] as const).filter(
      (field) => !person[field],
    );
    if (missing.length) {
      throw new BadRequestException({
        code: 'ACCEPTANCE_DATA_MISSING',
        message:
          'بيانات ناقصة لإنشاء ملف الطالب (الجنس، تاريخ الميلاد، العنوان): أكملها في person',
        fields: missing,
      });
    }
    if (!dto.confirmNewPerson) {
      const candidates = await tx.person.findMany({
        where: {
          OR: [
            {
              firstName: { equals: person.firstName, mode: 'insensitive' },
              lastName: { equals: person.lastName, mode: 'insensitive' },
            },
            ...(person.phone ? [{ phone: person.phone }] : []),
          ],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
          phone: true,
          student: { select: { id: true } },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        take: 10,
      });
      if (candidates.length) {
        throw new ConflictException({
          code: 'POSSIBLE_DUPLICATE_PERSON',
          message:
            'يوجد شخص بنفس الاسم أو رقم الهاتف: اربط الشخص الموجود (personId) أو أكّد إنشاء شخص جديد (confirmNewPerson)',
          candidates: candidates.map((c) => ({
            personId: c.id,
            firstName: c.firstName,
            lastName: c.lastName,
            dateOfBirth: fromDbDateOrNull(c.dateOfBirth),
            phone: c.phone,
            studentId: c.student?.id ?? null,
          })),
        });
      }
    }
    return {
      ...person,
      gender: person.gender!,
      dateOfBirth: person.dateOfBirth!,
      address: person.address!,
    };
  }
}

/** PATCH semantics: undefined keeps the current value, null clears it. */
function pick<T>(value: T | null | undefined, current: T | null) {
  return value === undefined ? current : value;
}
