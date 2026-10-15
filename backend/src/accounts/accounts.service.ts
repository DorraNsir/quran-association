import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthPrincipal } from '../auth/auth.types.js';
import { PasswordService } from '../auth/password.service.js';
import { SessionService } from '../auth/session.service.js';
import { PageSizeService } from '../common/page-size.service.js';
import { paginationMeta } from '../common/pagination.js';
import { Prisma } from '../generated/prisma/client.js';
import { Role } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  AccountListQueryDto,
  CreateAccountDto,
  SetRolesDto,
  UpdateAccountDto,
} from './dto/account-request.dto.js';
import type {
  AccountDetailDto,
  AccountDto,
  AccountListDto,
} from './dto/account-response.dto.js';

export const AccountErrorCode = {
  NotFound: 'ACCOUNT_NOT_FOUND',
  PersonNotFound: 'PERSON_NOT_FOUND',
  PersonHasAccount: 'PERSON_ALREADY_HAS_ACCOUNT',
  PersonChoice: 'PERSON_REQUIRED',
  UsernameTaken: 'USERNAME_TAKEN',
  LastActiveAdmin: 'LAST_ACTIVE_ADMIN',
  SelfLockout: 'SELF_LOCKOUT',
} as const;

type Tx = Prisma.TransactionClient;

/** Admin-facing account shape (explicit select: hashes are never read). */
const accountSelect = {
  id: true,
  username: true,
  isActive: true,
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  roles: { select: { role: true }, orderBy: { role: 'asc' } },
  person: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      gender: true,
      photoUrl: true,
      phone: true,
      email: true,
      address: true,
      teacher: { select: { id: true } },
      student: { select: { id: true } },
    },
  },
} satisfies Prisma.UserSelect;

type AccountRow = Prisma.UserGetPayload<{ select: typeof accountSelect }>;

function toAccount(row: AccountRow): AccountDto {
  const { teacher, student, ...person } = row.person;
  return {
    id: row.id,
    username: row.username,
    isActive: row.isActive,
    roles: row.roles.map((r) => r.role),
    mustChangePassword: row.mustChangePassword,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    person,
    teacherId: teacher?.id ?? null,
    studentId: student?.id ?? null,
  };
}

const notFound = () =>
  new NotFoundException({
    code: AccountErrorCode.NotFound,
    message: 'الحساب غير موجود',
  });
const usernameTaken = () =>
  new ConflictException({
    code: AccountErrorCode.UsernameTaken,
    message: 'اسم المستخدم مستعمل من حساب آخر',
  });

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

/**
 * Account administration (ADMIN only, enforced by the controller):
 * provisioning, username, roles, activation and temporary passwords.
 * Identity data lives on Person — never copied onto User. Domain profiles
 * (Teacher / Student) are NOT created here: a role grants a workspace, the
 * academic module (Part 10.4) owns the profiles; accounts can link to an
 * existing Person that already has one.
 */
@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly pageSizes: PageSizeService,
  ) {}

  async list(query: AccountListQueryDto): Promise<AccountListDto> {
    const pageSize = await this.pageSizes.resolve(query.pageSize);
    const search = query.search?.trim();
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { roles: { some: { role: query.role } } } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(search
        ? {
            OR: [
              { username: { contains: search.toLowerCase() } },
              {
                person: {
                  firstName: { contains: search, mode: 'insensitive' },
                },
              },
              {
                person: { lastName: { contains: search, mode: 'insensitive' } },
              },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: accountSelect,
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
      data: rows.map(toAccount),
      meta: paginationMeta(query.page, pageSize, total),
    };
  }

  async get(id: string): Promise<AccountDetailDto> {
    const row = await this.prisma.user.findUnique({
      where: { id },
      select: accountSelect,
    });
    if (!row) throw notFound();
    const activeSessions = await this.prisma.authSession.count({
      where: { userId: id, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    return Object.assign(toAccount(row), { activeSessions });
  }

  /** Person (existing or new) + User + roles, atomically; mustChangePassword = true. */
  async create(dto: CreateAccountDto): Promise<AccountDetailDto> {
    if (Boolean(dto.personId) === Boolean(dto.person)) {
      throw new BadRequestException({
        code: AccountErrorCode.PersonChoice,
        message:
          'حدّد شخصًا موجودًا (personId) أو بيانات شخص جديد (person) — واحدًا منهما فقط',
      });
    }
    // Argon2 is slow on purpose: hash before opening the transaction
    const passwordHash = await this.passwords.hash(dto.temporaryPassword);
    const account = {
      username: dto.username,
      passwordHash,
      isActive: true,
      mustChangePassword: true,
      roles: { create: dto.roles.map((role) => ({ role })) },
    };

    try {
      const id = await this.prisma.$transaction(async (tx) => {
        await this.assertUsernameFree(tx, dto.username);
        if (dto.personId) {
          const person = await tx.person.findUnique({
            where: { id: dto.personId },
            select: { user: { select: { id: true } } },
          });
          if (!person)
            throw new NotFoundException({
              code: AccountErrorCode.PersonNotFound,
              message: 'الشخص غير موجود',
            });
          if (person.user) {
            throw new ConflictException({
              code: AccountErrorCode.PersonHasAccount,
              message: 'لهذا الشخص حساب بالفعل',
            });
          }
          return (
            await tx.user.create({
              data: { ...account, personId: dto.personId },
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
            user: { create: account },
          },
          select: { user: { select: { id: true } } },
        });
        return person.user!.id;
      });
      return this.get(id);
    } catch (error) {
      if (isUniqueViolation(error)) throw usernameTaken();
      throw error;
    }
  }

  /**
   * Username and/or canonical Person fields, atomically. Sessions are kept
   * on a username change: tokens identify the user by id, never by name.
   */
  async update(id: string, dto: UpdateAccountDto): Promise<AccountDetailDto> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { id },
          select: { username: true, personId: true },
        });
        if (!user) throw notFound();
        if (dto.username && dto.username !== user.username) {
          await this.assertUsernameFree(tx, dto.username);
          await tx.user.update({
            where: { id },
            data: { username: dto.username },
          });
        }
        if (dto.person) {
          // Explicit canonical fields only (photo: file-storage module later)
          const { firstName, lastName, gender, phone, email, address } =
            dto.person;
          await tx.person.update({
            where: { id: user.personId },
            data: { firstName, lastName, gender, phone, email, address },
          });
        }
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw usernameTaken();
      throw error;
    }
    return this.get(id);
  }

  /**
   * Replaces the role set. Takes effect on the very next request (roles are
   * re-read per request by the JWT strategy); no session revocation needed.
   * Never leaves the platform without an active ADMIN.
   */
  async setRoles(
    actor: AuthPrincipal,
    id: string,
    { roles }: SetRolesDto,
  ): Promise<AccountDetailDto> {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id },
        select: { roles: { select: { role: true } } },
      });
      if (!user) throw notFound();
      const removesAdmin =
        user.roles.some((r) => r.role === Role.ADMIN) &&
        !roles.includes(Role.ADMIN);
      if (removesAdmin) {
        if (id === actor.userId)
          throw this.selfLockout('لا يمكنك سحب دور المسؤول من حسابك');
        await this.assertAnotherActiveAdmin(tx, id);
      }
      await tx.userRole.deleteMany({
        where: { userId: id, role: { notIn: roles } },
      });
      await tx.userRole.createMany({
        data: roles.map((role) => ({ userId: id, role })),
        skipDuplicates: true,
      });
    });
    return this.get(id);
  }

  /** Reactivation never restores revoked sessions: the user signs in again. */
  async activate(id: string): Promise<AccountDetailDto> {
    await this.prisma.user
      .update({ where: { id }, data: { isActive: true } })
      .catch((error: unknown) => {
        throw this.mapNotFound(error);
      });
    return this.get(id);
  }

  /** isActive = false + every session revoked, in one transaction. */
  async deactivate(
    actor: AuthPrincipal,
    id: string,
  ): Promise<AccountDetailDto> {
    if (id === actor.userId) throw this.selfLockout('لا يمكنك تعطيل حسابك');
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id },
        select: { isActive: true, roles: { select: { role: true } } },
      });
      if (!user) throw notFound();
      if (user.isActive && user.roles.some((r) => r.role === Role.ADMIN))
        await this.assertAnotherActiveAdmin(tx, id);
      await tx.user.update({ where: { id }, data: { isActive: false } });
      await this.sessions.revokeAllForUser(id, undefined, tx);
    });
    return this.get(id);
  }

  /**
   * Replaces the password with a temporary one (the old one is never
   * readable), forces a change at next login and signs the user out everywhere.
   */
  async resetPassword(
    actor: AuthPrincipal,
    id: string,
    temporaryPassword: string,
  ): Promise<AccountDetailDto> {
    if (id === actor.userId) {
      throw this.selfLockout(
        'لتغيير كلمة مرورك استعمل «تغيير كلمة المرور» من حسابك',
      );
    }
    const passwordHash = await this.passwords.hash(temporaryPassword);
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!user) throw notFound();
      await tx.user.update({
        where: { id },
        data: { passwordHash, mustChangePassword: true },
      });
      await this.sessions.revokeAllForUser(id, undefined, tx);
    });
    return this.get(id);
  }

  // ───────────────────────── helpers ─────────────────────────

  private async assertUsernameFree(tx: Tx, username: string) {
    if (await tx.user.findUnique({ where: { username }, select: { id: true } }))
      throw usernameTaken();
  }

  /**
   * Locks every active ADMIN row (FOR UPDATE), so two concurrent operations
   * cannot each remove "the other" last admin, then checks that an active
   * admin other than `userId` remains.
   */
  private async assertAnotherActiveAdmin(tx: Tx, userId: string) {
    const admins = await tx.$queryRaw<{ id: string }[]>`
      SELECT u.id FROM users u
      JOIN user_roles r ON r."userId" = u.id AND r.role = 'ADMIN'
      WHERE u."isActive"
      FOR UPDATE OF u`;
    if (!admins.some((a) => a.id !== userId)) {
      throw new ConflictException({
        code: AccountErrorCode.LastActiveAdmin,
        message: 'لا يمكن تنفيذ العملية: هذا آخر حساب مسؤول مفعّل في المنصة',
      });
    }
  }

  private selfLockout(message: string) {
    return new ConflictException({
      code: AccountErrorCode.SelfLockout,
      message,
    });
  }

  private mapNotFound(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
      ? notFound()
      : error;
  }
}
