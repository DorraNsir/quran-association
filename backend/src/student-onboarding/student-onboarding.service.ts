import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  assertStudentContactRule,
  mapStudentWriteError,
  StudentsService,
} from '../academic/students/students.service.js';
import { fromDbDate, fromDbDateOrNull, toDbDate } from '../common/dates.js';
import { badRequest, conflict, notFound } from '../common/errors.js';
import { PageSizeService } from '../common/page-size.service.js';
import { paginationMeta } from '../common/pagination.js';
import {
  localDateTimeToInstant,
  platformDayBounds,
  platformToday,
} from '../common/platform-clock.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { Prisma } from '../generated/prisma/client.js';
import { OnboardingSubmissionStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  hashToken,
  newToken,
  sealToken,
  unsealToken,
} from './onboarding-token.js';
import type {
  ApproveOnboardingSubmissionDto,
  CreateOnboardingLinkDto,
  EditOnboardingSubmissionDto,
  ExtendOnboardingLinkDto,
  LinkOnboardingSubmissionDto,
  LinkStatus,
  OnboardingLinkCreatedDto,
  OnboardingLinkDto,
  OnboardingLinkInfoDto,
  OnboardingLinkListQueryDto,
  OnboardingStudentFieldsDto,
  OnboardingSubmissionDetailDto,
  OnboardingSubmissionDto,
  OnboardingSubmissionListDto,
  OnboardingSubmissionListQueryDto,
  OnboardingSubmitDto,
  PossibleMatchDto,
  RejectOnboardingSubmissionDto,
} from './student-onboarding.dto.js';

type Tx = Prisma.TransactionClient;

const classSelect = {
  id: true,
  group: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  supervisor: {
    select: { person: { select: { firstName: true, lastName: true } } },
  },
} satisfies Prisma.GroupClassSelect;
type ClassRow = Prisma.GroupClassGetPayload<{ select: typeof classSelect }>;

const toClass = (c: ClassRow) => ({
  id: c.id,
  group: c.group,
  branch: c.branch,
  supervisorName: c.supervisor
    ? `${c.supervisor.person.firstName} ${c.supervisor.person.lastName}`
    : null,
});

const submissionInclude = {
  groupClass: { select: classSelect },
  reviewedBy: {
    select: { person: { select: { firstName: true, lastName: true } } },
  },
} satisfies Prisma.OnboardingSubmissionInclude;
type SubmissionRow = Prisma.OnboardingSubmissionGetPayload<{
  include: typeof submissionInclude;
}>;

/** The student fields as stored (and as compared with originalData). */
function fieldsOf(s: {
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: Date | string;
  address: string;
  phone: string | null;
  email: string | null;
  guardianPhone: string | null;
  cin: string | null;
}) {
  return {
    firstName: s.firstName,
    lastName: s.lastName,
    gender: s.gender,
    dateOfBirth:
      typeof s.dateOfBirth === 'string'
        ? s.dateOfBirth
        : fromDbDate(s.dateOfBirth),
    address: s.address,
    phone: s.phone,
    email: s.email,
    guardianPhone: s.guardianPhone,
    cin: s.cin,
  };
}

function toSubmission(s: SubmissionRow): OnboardingSubmissionDto {
  const fields = fieldsOf(s);
  const original = s.originalData as Record<string, unknown>;
  return {
    id: s.id,
    version: s.version,
    status: s.status,
    submittedBy: s.submittedBy,
    ...fields,
    gender: s.gender,
    groupClass: toClass(s.groupClass),
    createdAt: s.createdAt,
    reviewedAt: s.reviewedAt,
    reviewedBy: s.reviewedBy
      ? `${s.reviewedBy.person.firstName} ${s.reviewedBy.person.lastName}`
      : null,
    rejectionReason: s.rejectionReason,
    approvedStudentId: s.approvedStudentId,
    linkedExisting: s.linkedExisting,
    edited: (Object.keys(fields) as (keyof typeof fields)[]).some(
      (k) => (original[k] ?? null) !== fields[k],
    ),
  };
}

const linkInvalid = () =>
  notFound(
    'ONBOARDING_LINK_INVALID',
    'هذا الرابط غير صالح أو تم تعطيله. يرجى التواصل مع إدارة الجمعية.',
  );
const linkExpired = () =>
  new HttpException(
    {
      code: 'ONBOARDING_LINK_EXPIRED',
      message:
        'انتهت صلاحية رابط استكمال البيانات. يرجى التواصل مع إدارة الجمعية.',
    },
    HttpStatus.GONE,
  );
const submissionNotFound = () =>
  notFound('ONBOARDING_SUBMISSION_NOT_FOUND', 'طلب الاستكمال غير موجود');
const notPending = () =>
  conflict('ONBOARDING_NOT_PENDING', 'تمت معالجة هذا الطلب مسبقًا');
const changed = () =>
  conflict(
    'ONBOARDING_SUBMISSION_CHANGED',
    'عدّل مستخدم آخر هذا الطلب في الأثناء: أعد تحميل الصفحة ثم أعد المحاولة',
  );

/**
 * TEMPORARY «استكمال بيانات الطلبة». Admins create one expiring public link
 * per class; students or guardians submit their data through it; an admin
 * reviews each submission and creates the student (the regular
 * StudentsService path: Person + Student + first enrollment + status +
 * billing) or matches an existing one. Nothing permanent is ever created
 * from a public request, and nothing permanent depends on these tables.
 */
@Injectable()
export class StudentOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly students: StudentsService,
    private readonly pageSizes: PageSizeService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  enabled() {
    return this.config.get('STUDENT_ONBOARDING_ENABLED', { infer: true });
  }

  // ───────────────────────── links ─────────────────────────

  async listLinks(
    query: OnboardingLinkListQueryDto,
  ): Promise<OnboardingLinkDto[]> {
    const now = new Date();
    const where: Prisma.OnboardingLinkWhereInput =
      query.status === 'REVOKED'
        ? { revokedAt: { not: null } }
        : query.status === 'EXPIRED'
          ? { revokedAt: null, expiresAt: { lte: now } }
          : query.status === 'ACTIVE'
            ? { revokedAt: null, expiresAt: { gt: now } }
            : {};
    const links = await this.prisma.onboardingLink.findMany({
      where,
      include: { groupClass: { select: classSelect } },
      orderBy: [{ createdAt: 'desc' }],
    });
    const counts = await this.counts(links.map((l) => l.id));
    return links.map((l) => this.toLink(l, counts.get(l.id), now));
  }

  async createLink(
    dto: CreateOnboardingLinkDto,
    actorUserId: string,
  ): Promise<OnboardingLinkCreatedDto> {
    const { id, token } = await this.prisma.$transaction(async (tx) => {
      await this.lockClass(tx, dto.groupClassId);
      const expiresAt = await this.futureInstant(tx, dto.expiresAt);
      const current = await tx.onboardingLink.findFirst({
        where: { groupClassId: dto.groupClassId, revokedAt: null },
        select: { id: true },
      });
      if (current)
        throw new ConflictException({
          code: 'ONBOARDING_LINK_EXISTS',
          message: 'لهذا الفوج رابط قائم: مدّد صلاحيته أو أنشئ رابطًا بديلًا',
          linkId: current.id,
        });
      return this.insertLink(tx, dto.groupClassId, expiresAt, actorUserId);
    });
    return this.created(id, token);
  }

  /** «تمديد الصلاحية» — also re-opens an expired (not revoked) link. */
  async extendLink(
    id: string,
    dto: ExtendOnboardingLinkDto,
  ): Promise<OnboardingLinkDto> {
    await this.prisma.$transaction(async (tx) => {
      const link = await this.lockLink(tx, id);
      if (link.revokedAt)
        throw conflict(
          'ONBOARDING_LINK_REVOKED',
          'هذا الرابط معطّل: أنشئ رابطًا بديلًا',
        );
      await tx.onboardingLink.update({
        where: { id },
        data: { expiresAt: await this.futureInstant(tx, dto.expiresAt) },
      });
    });
    return this.getLink(id);
  }

  /** «تعطيل الرابط»: no new submission; existing ones stay. */
  async revokeLink(id: string): Promise<OnboardingLinkDto> {
    await this.prisma.$transaction(async (tx) => {
      const link = await this.lockLink(tx, id);
      if (!link.revokedAt)
        await tx.onboardingLink.update({
          where: { id },
          data: { revokedAt: new Date() },
        });
    });
    return this.getLink(id);
  }

  /** «إنشاء رابط بديل»: the old link stops working at once; a new token for the same class. */
  async replaceLink(
    id: string,
    dto: ExtendOnboardingLinkDto,
    actorUserId: string,
  ): Promise<OnboardingLinkCreatedDto> {
    const created = await this.prisma.$transaction(async (tx) => {
      const old = await tx.onboardingLink.findUnique({
        where: { id },
        select: { groupClassId: true },
      });
      if (!old) throw notFound('ONBOARDING_LINK_NOT_FOUND', 'الرابط غير موجود');
      await this.lockClass(tx, old.groupClassId);
      const expiresAt = await this.futureInstant(tx, dto.expiresAt);
      // Every still-open link of the class (normally just this one) is revoked
      await tx.onboardingLink.updateMany({
        where: { groupClassId: old.groupClassId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return this.insertLink(tx, old.groupClassId, expiresAt, actorUserId);
    });
    return this.created(created.id, created.token);
  }

  /** The shareable URL (and QR content) — revealed only on an explicit admin request. */
  async linkUrl(id: string) {
    const link = await this.prisma.onboardingLink.findUnique({
      where: { id },
      select: { tokenSealed: true },
    });
    if (!link) throw notFound('ONBOARDING_LINK_NOT_FOUND', 'الرابط غير موجود');
    const token = unsealToken(link.tokenSealed, this.secret());
    if (!token)
      throw conflict(
        'ONBOARDING_LINK_UNREADABLE',
        'تعذّر استرجاع هذا الرابط: أنشئ رابطًا بديلًا',
      );
    return { url: this.urlOf(token) };
  }

  // ───────────────────────── public ─────────────────────────

  /** What the public form shows (read-only class) — never ids. */
  async resolve(token: string): Promise<OnboardingLinkInfoDto> {
    const link = await this.prisma.onboardingLink.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        expiresAt: true,
        revokedAt: true,
        groupClass: { select: classSelect },
      },
    });
    if (!link || link.revokedAt) throw linkInvalid();
    if (link.expiresAt <= new Date()) throw linkExpired();
    const c = toClass(link.groupClass);
    return {
      branchName: c.branch.name,
      groupName: c.group.name,
      supervisorName: c.supervisorName,
    };
  }

  /**
   * A PENDING submission for the link's class (never a student). The link is
   * re-checked under a share lock, so a concurrent revocation is serialized.
   */
  async submit(dto: OnboardingSubmitDto): Promise<{ received: true }> {
    // Anti-spam honeypot: a filled hidden field is accepted silently, never stored
    if (dto.website?.trim()) return { received: true };
    const today = await platformToday(this.prisma);
    this.assertFields(dto, today);
    await this.prisma.$transaction(async (tx) => {
      const [link] = await tx.$queryRaw<
        {
          id: string;
          groupClassId: string;
          expired: boolean;
          revoked: boolean;
        }[]
      >`SELECT id, "groupClassId", "expiresAt" <= now() AS expired, "revokedAt" IS NOT NULL AS revoked
        FROM onboarding_links WHERE "tokenHash" = ${hashToken(dto.token)} FOR SHARE`;
      if (!link || link.revoked) throw linkInvalid();
      if (link.expired) throw linkExpired();
      const fields = this.normalized(dto);
      await tx.onboardingSubmission.create({
        data: {
          onboardingLinkId: link.id,
          // From the link — never from the request
          groupClassId: link.groupClassId,
          submittedBy: dto.submittedBy,
          ...fields,
          dateOfBirth: toDbDate(fields.dateOfBirth),
          originalData: { ...fields, submittedBy: dto.submittedBy },
        },
      });
    });
    return { received: true };
  }

  // ───────────────────────── submissions ─────────────────────────

  async listSubmissions(
    query: OnboardingSubmissionListQueryDto,
  ): Promise<OnboardingSubmissionListDto> {
    const pageSize = await this.pageSizes.resolve(query.pageSize);
    const bounds = await platformDayBounds(this.prisma, query.from, query.to);
    const q = query.q;
    const where: Prisma.OnboardingSubmissionWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.groupClassId ? { groupClassId: query.groupClassId } : {}),
      ...(query.groupId || query.branchId
        ? {
            groupClass: {
              ...(query.groupId ? { groupId: query.groupId } : {}),
              ...(query.branchId ? { branchId: query.branchId } : {}),
            },
          }
        : {}),
      ...(bounds.gte || bounds.lt ? { createdAt: bounds } : {}),
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: 'insensitive' } },
              { lastName: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q } },
              { guardianPhone: { contains: q } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.onboardingSubmission.count({ where }),
      this.prisma.onboardingSubmission.findMany({
        where,
        include: submissionInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map(toSubmission),
      meta: paginationMeta(query.page, pageSize, total),
    };
  }

  async getSubmission(id: string): Promise<OnboardingSubmissionDetailDto> {
    const row = await this.prisma.onboardingSubmission.findUnique({
      where: { id },
      include: submissionInclude,
    });
    if (!row) throw submissionNotFound();
    return Object.assign(toSubmission(row), {
      originalData: row.originalData as Record<string, unknown>,
      possibleMatches:
        row.status === OnboardingSubmissionStatus.PENDING
          ? await this.possibleMatches(this.prisma, row)
          : [],
    });
  }

  /** «تعديل البيانات» before approval; originalData is never changed. */
  async editSubmission(
    id: string,
    dto: EditOnboardingSubmissionDto,
  ): Promise<OnboardingSubmissionDetailDto> {
    const today = await platformToday(this.prisma);
    this.assertFields(dto, today);
    await this.prisma.$transaction(async (tx) => {
      await this.lockPending(tx, id, dto.version);
      const fields = this.normalized(dto);
      await tx.onboardingSubmission.update({
        where: { id },
        data: {
          ...fields,
          dateOfBirth: toDbDate(fields.dateOfBirth),
          version: { increment: 1 },
        },
      });
    });
    return this.getSubmission(id);
  }

  /**
   * «قبول وإضافة الطالب»: the regular student creation (Person + Student +
   * first enrollment in the LINK's class + status + billing), in one
   * transaction with the decision. Possible duplicates must be confirmed.
   */
  async approve(
    id: string,
    dto: ApproveOnboardingSubmissionDto,
    actorUserId: string,
  ): Promise<OnboardingSubmissionDetailDto> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const sub = await this.lockPending(tx, id, dto.version);
        const matches = await this.possibleMatches(tx, sub);
        if (matches.length && !dto.confirmNoDuplicate)
          throw new ConflictException({
            code: 'ONBOARDING_POSSIBLE_DUPLICATE',
            message: 'قد يكون هذا الطالب مسجلاً مسبقاً في المنظومة.',
            possibleMatches: matches,
          });
        const today = await platformToday(tx);
        const registrationDate = dto.registrationDate ?? today;
        if (registrationDate > today)
          throw badRequest(
            'REGISTRATION_DATE_IN_FUTURE',
            'تاريخ التسجيل لا يمكن أن يكون في المستقبل',
          );
        const studentId = await this.students.createInTx(
          tx,
          {
            person: {
              firstName: sub.firstName,
              lastName: sub.lastName,
              gender: sub.gender,
              dateOfBirth: fromDbDate(sub.dateOfBirth),
              address: sub.address,
              phone: sub.phone,
              email: sub.email,
            },
            groupClassId: sub.groupClassId,
            registrationDate,
            guardianPhone: sub.guardianPhone,
            cin: sub.cin,
          },
          actorUserId,
        );
        await this.decide(tx, id, actorUserId, {
          status: OnboardingSubmissionStatus.APPROVED,
          approvedStudentId: studentId,
        });
      });
    } catch (error) {
      throw mapStudentWriteError(error);
    }
    return this.getSubmission(id);
  }

  /**
   * «ربط بطالب موجود»: the submission is about this existing student — they
   * are placed in the link's class with the regular class-change rules (no
   * duplicate enrollment; nothing if already there). Their personal data is
   * NOT overwritten.
   */
  async linkExisting(
    id: string,
    dto: LinkOnboardingSubmissionDto,
    actorUserId: string,
  ): Promise<OnboardingSubmissionDetailDto> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const sub = await this.lockPending(tx, id, dto.version);
        const student = await tx.student.findUnique({
          where: { id: dto.studentId },
          select: { id: true },
        });
        if (!student) throw notFound('STUDENT_NOT_FOUND', 'الطالب غير موجود');
        await this.students.assignGroupClassInTx(
          tx,
          dto.studentId,
          sub.groupClassId,
          undefined,
          actorUserId,
        );
        await this.decide(tx, id, actorUserId, {
          status: OnboardingSubmissionStatus.APPROVED,
          approvedStudentId: dto.studentId,
          linkedExisting: true,
        });
      });
    } catch (error) {
      throw mapStudentWriteError(error);
    }
    return this.getSubmission(id);
  }

  /** «رفض الطلب»: nothing is created. */
  async reject(
    id: string,
    dto: RejectOnboardingSubmissionDto,
    actorUserId: string,
  ): Promise<OnboardingSubmissionDetailDto> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockPending(tx, id, dto.version);
      await this.decide(tx, id, actorUserId, {
        status: OnboardingSubmissionStatus.REJECTED,
        rejectionReason: dto.reason || null,
      });
    });
    return this.getSubmission(id);
  }

  // ───────────────────────── internals ─────────────────────────

  /**
   * Possible duplicates — shown, never merged: same full name; same birth
   * date with the same first or last name; same guardian phone; same phone.
   * (A shared family phone does not prove it is the same student.)
   */
  private async possibleMatches(
    db: Tx | PrismaService,
    s: {
      firstName: string;
      lastName: string;
      dateOfBirth: Date;
      phone: string | null;
      guardianPhone: string | null;
    },
  ): Promise<PossibleMatchDto[]> {
    const same = (field: 'firstName' | 'lastName', value: string) => ({
      [field]: { equals: value, mode: 'insensitive' as const },
    });
    const rows = await db.student.findMany({
      where: {
        OR: [
          {
            person: {
              AND: [
                same('firstName', s.firstName),
                same('lastName', s.lastName),
              ],
            },
          },
          {
            person: {
              dateOfBirth: s.dateOfBirth,
              OR: [
                same('firstName', s.firstName),
                same('lastName', s.lastName),
              ],
            },
          },
          ...(s.guardianPhone ? [{ guardianPhone: s.guardianPhone }] : []),
          ...(s.phone ? [{ person: { phone: s.phone } }] : []),
        ],
      },
      select: {
        id: true,
        guardianPhone: true,
        person: {
          select: {
            firstName: true,
            lastName: true,
            dateOfBirth: true,
            phone: true,
          },
        },
        groupClass: {
          select: {
            group: { select: { name: true } },
            branch: { select: { name: true } },
          },
        },
      },
      take: 10,
    });
    const eq = (a: string, b: string) =>
      a.localeCompare(b, 'ar', { sensitivity: 'base' }) === 0;
    return rows.map((r) => {
      const dob = fromDbDateOrNull(r.person.dateOfBirth);
      const reasons = [
        ...(eq(r.person.firstName, s.firstName) &&
        eq(r.person.lastName, s.lastName)
          ? ['NAME']
          : []),
        ...(dob === fromDbDate(s.dateOfBirth) ? ['BIRTH_DATE'] : []),
        ...(s.guardianPhone && r.guardianPhone === s.guardianPhone
          ? ['GUARDIAN_PHONE']
          : []),
        ...(s.phone && r.person.phone === s.phone ? ['PHONE'] : []),
      ];
      return {
        studentId: r.id,
        firstName: r.person.firstName,
        lastName: r.person.lastName,
        dateOfBirth: dob,
        guardianPhone: r.guardianPhone,
        groupClassLabel: r.groupClass
          ? `${r.groupClass.group.name} — ${r.groupClass.branch.name}`
          : null,
        reasons,
      };
    });
  }

  /** Row-locked PENDING submission at the version the admin saw (no double decision). */
  private async lockPending(tx: Tx, id: string, version: number) {
    await tx.$queryRaw`SELECT id FROM onboarding_submissions WHERE id = ${id}::uuid FOR UPDATE`;
    const sub = await tx.onboardingSubmission.findUnique({ where: { id } });
    if (!sub) throw submissionNotFound();
    if (sub.status !== OnboardingSubmissionStatus.PENDING) throw notPending();
    if (sub.version !== version) throw changed();
    return sub;
  }

  private async decide(
    tx: Tx,
    id: string,
    actorUserId: string,
    data: Prisma.OnboardingSubmissionUncheckedUpdateInput,
  ) {
    await tx.onboardingSubmission.update({
      where: { id },
      data: {
        ...data,
        reviewedAt: new Date(),
        reviewedByUserId: actorUserId,
        version: { increment: 1 },
      },
    });
  }

  /** The admin student form's rules: real past birth date, contact rule (minor → guardian phone). */
  private assertFields(f: OnboardingStudentFieldsDto, today: string) {
    if (f.dateOfBirth > today || f.dateOfBirth < '1900-01-01')
      throw badRequest('DATE_OF_BIRTH_INVALID', 'تاريخ الولادة غير صالح');
    assertStudentContactRule(f.dateOfBirth, f.phone, f.guardianPhone);
  }

  private normalized(f: OnboardingStudentFieldsDto) {
    return {
      firstName: f.firstName,
      lastName: f.lastName,
      gender: f.gender,
      dateOfBirth: f.dateOfBirth,
      address: f.address,
      phone: f.phone ?? null,
      email: f.email ?? null,
      guardianPhone: f.guardianPhone ?? null,
      cin: f.cin ?? null,
    };
  }

  private async lockClass(tx: Tx, groupClassId: string) {
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM group_classes WHERE id = ${groupClassId}::uuid FOR UPDATE`;
    if (!row) throw notFound('GROUP_CLASS_NOT_FOUND', 'الفوج غير موجود');
  }

  private async lockLink(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM onboarding_links WHERE id = ${id}::uuid FOR UPDATE`;
    const link = await tx.onboardingLink.findUnique({
      where: { id },
      select: { revokedAt: true },
    });
    if (!link) throw notFound('ONBOARDING_LINK_NOT_FOUND', 'الرابط غير موجود');
    return link;
  }

  /** Admin wall-clock (Africa/Tunis) → instant; must be later than now (server clock). */
  private async futureInstant(tx: Tx, local: string) {
    const instant = await localDateTimeToInstant(tx, local);
    if (instant <= new Date())
      throw badRequest(
        'ONBOARDING_EXPIRY_PAST',
        'يجب أن يكون تاريخ انتهاء الصلاحية في المستقبل',
      );
    return instant;
  }

  private async insertLink(
    tx: Tx,
    groupClassId: string,
    expiresAt: Date,
    actorUserId: string,
  ) {
    const token = newToken();
    const link = await tx.onboardingLink.create({
      data: {
        groupClassId,
        tokenHash: hashToken(token),
        tokenSealed: sealToken(token, this.secret()),
        expiresAt,
        createdByUserId: actorUserId,
      },
      select: { id: true },
    });
    return { id: link.id, token };
  }

  private async created(
    id: string,
    token: string,
  ): Promise<OnboardingLinkCreatedDto> {
    return Object.assign(await this.getLink(id), { url: this.urlOf(token) });
  }

  private async getLink(id: string): Promise<OnboardingLinkDto> {
    const link = await this.prisma.onboardingLink.findUnique({
      where: { id },
      include: { groupClass: { select: classSelect } },
    });
    if (!link) throw notFound('ONBOARDING_LINK_NOT_FOUND', 'الرابط غير موجود');
    return this.toLink(link, (await this.counts([id])).get(id), new Date());
  }

  private async counts(linkIds: string[]) {
    const rows = await this.prisma.onboardingSubmission.groupBy({
      by: ['onboardingLinkId', 'status'],
      where: { onboardingLinkId: { in: linkIds } },
      _count: { _all: true },
    });
    const out = new Map<
      string,
      { total: number; pending: number; approved: number; rejected: number }
    >();
    for (const r of rows) {
      const c = out.get(r.onboardingLinkId) ?? {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
      };
      c.total += r._count._all;
      if (r.status === 'PENDING') c.pending += r._count._all;
      if (r.status === 'APPROVED') c.approved += r._count._all;
      if (r.status === 'REJECTED') c.rejected += r._count._all;
      out.set(r.onboardingLinkId, c);
    }
    return out;
  }

  private toLink(
    l: {
      id: string;
      expiresAt: Date;
      revokedAt: Date | null;
      createdAt: Date;
      groupClass: ClassRow;
    },
    counts:
      | { total: number; pending: number; approved: number; rejected: number }
      | undefined,
    now: Date,
  ): OnboardingLinkDto {
    const status: LinkStatus = l.revokedAt
      ? 'REVOKED'
      : l.expiresAt <= now
        ? 'EXPIRED'
        : 'ACTIVE';
    return {
      id: l.id,
      groupClass: toClass(l.groupClass),
      status,
      expiresAt: l.expiresAt,
      revokedAt: l.revokedAt,
      createdAt: l.createdAt,
      submissions: counts ?? { total: 0, pending: 0, approved: 0, rejected: 0 },
    };
  }

  private secret() {
    return this.config.get('JWT_ACCESS_SECRET', { infer: true });
  }

  /** PUBLIC_APP_URL, else the first FRONTEND_URL origin — never a hard-coded domain. */
  private urlOf(token: string) {
    const base =
      this.config.get('PUBLIC_APP_URL', { infer: true }) ??
      this.config.get('FRONTEND_URL', { infer: true }).split(',')[0].trim();
    return `${base.replace(/\/$/, '')}/student-info/${token}`;
  }
}
