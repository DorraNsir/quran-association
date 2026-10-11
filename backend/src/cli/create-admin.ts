/**
 * `npm run admin:create` — creates the FIRST administrator of a fresh
 * installation (production included). It asks for the values interactively,
 * so no password ever lands in shell history or environment variables.
 *
 * Safe by design:
 *   - refuses when an active ADMIN account already exists (later admins are
 *     granted from the platform: «منح صلاحيات الإدارة»);
 *   - same username and password rules as the API;
 *   - the password is stored as an Argon2id hash and must be changed at the
 *     first login (mustChangePassword).
 *
 * Run (after `npm run build`), with DATABASE_URL pointing at the database:
 *   npm run admin:create
 */
import 'reflect-metadata';
import 'dotenv/config';

import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';

import { PrismaPg } from '@prisma/adapter-pg';

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../auth/password-policy.js';
import { PasswordService } from '../auth/password.service.js';
import {
  normalizeUsername,
  USERNAME_PATTERN,
  USERNAME_RULE_MESSAGE,
} from '../common/username.js';
import { PrismaClient } from '../generated/prisma/client.js';

export interface FirstAdminInput {
  username: string;
  password: string;
  firstName: string;
  lastName: string;
}

/** The part of PrismaClient this command uses (a fake in unit tests). */
export interface AdminDb {
  user: {
    count(args: {
      where: { isActive: boolean; roles: { some: { role: 'ADMIN' } } };
    }): Promise<number>;
    findUnique(args: {
      where: { username: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
  person: {
    create(args: {
      data: {
        firstName: string;
        lastName: string;
        user: {
          create: {
            username: string;
            passwordHash: string;
            mustChangePassword: boolean;
            roles: { create: { role: 'ADMIN' }[] };
          };
        };
      };
      select: { user: { select: { id: true; username: true } } };
    }): Promise<{ user: { id: string; username: string } | null }>;
  };
}

export class AdminCreationError extends Error {}

/** Field problems in Arabic (empty array = valid). */
export function validateFirstAdmin(input: FirstAdminInput): string[] {
  const problems: string[] = [];
  if (!USERNAME_PATTERN.test(normalizeUsername(input.username)))
    problems.push(USERNAME_RULE_MESSAGE);
  if (input.password.length < PASSWORD_MIN_LENGTH)
    problems.push(
      `كلمة المرور قصيرة جدًا (${PASSWORD_MIN_LENGTH} أحرف على الأقل)`,
    );
  if (input.password.length > PASSWORD_MAX_LENGTH)
    problems.push(
      `كلمة المرور طويلة جدًا (${PASSWORD_MAX_LENGTH} حرفًا على الأكثر)`,
    );
  if (!input.firstName.trim() || input.firstName.trim().length > 80)
    problems.push('الاسم مطلوب (80 حرفًا على الأكثر)');
  if (!input.lastName.trim() || input.lastName.trim().length > 80)
    problems.push('اللقب مطلوب (80 حرفًا على الأكثر)');
  return problems;
}

/**
 * Creates Person + User(ADMIN). Refuses when an active admin already exists
 * or the username is taken; never modifies an existing account.
 */
export async function createFirstAdmin(
  db: AdminDb,
  input: FirstAdminInput,
  hash: (password: string) => Promise<string>,
): Promise<{ id: string; username: string }> {
  const problems = validateFirstAdmin(input);
  if (problems.length) throw new AdminCreationError(problems.join('\n'));
  const admins = await db.user.count({
    where: { isActive: true, roles: { some: { role: 'ADMIN' } } },
  });
  if (admins > 0)
    throw new AdminCreationError(
      'يوجد مسؤول نشط بالفعل: تُمنح صلاحيات الإدارة الإضافية من داخل المنصة («منح صلاحيات الإدارة»).',
    );
  const username = normalizeUsername(input.username);
  if (await db.user.findUnique({ where: { username }, select: { id: true } }))
    throw new AdminCreationError(`اسم المستخدم «${username}» مستعمل بالفعل.`);
  const created = await db.person.create({
    data: {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      user: {
        create: {
          username,
          passwordHash: await hash(input.password),
          // Typed by whoever deploys: the admin chooses their own at first login
          mustChangePassword: true,
          roles: { create: [{ role: 'ADMIN' }] },
        },
      },
    },
    select: { user: { select: { id: true, username: true } } },
  });
  return created.user!;
}

/* ------------------------------ command line ------------------------------ */

async function ask() {
  if (!stdin.isTTY)
    throw new AdminCreationError(
      'هذا الأمر تفاعلي: شغّله من طرفية (terminal) حتى تُكتب كلمة المرور دون أن تظهر.',
    );
  let muted = false;
  const output = new Writable({
    write(chunk: Buffer, _encoding, done) {
      if (!muted) stdout.write(chunk);
      done();
    },
  });
  const rl = createInterface({ input: stdin, output, terminal: true });
  const hidden = async (question: string) => {
    stdout.write(question);
    muted = true;
    const answer = await rl.question('');
    muted = false;
    stdout.write('\n');
    return answer;
  };
  try {
    const username = await rl.question('اسم المستخدم (Latin): ');
    const firstName = await rl.question('الاسم: ');
    const lastName = await rl.question('اللقب: ');
    const password = await hidden(
      `كلمة المرور المؤقتة (${PASSWORD_MIN_LENGTH}+ أحرف): `,
    );
    const confirm = await hidden('أعد كتابة كلمة المرور: ');
    if (password !== confirm)
      throw new AdminCreationError('كلمتا المرور غير متطابقتين.');
    return { username, firstName, lastName, password };
  } finally {
    rl.close();
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString)
    throw new AdminCreationError('DATABASE_URL غير معرّف.');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString, options: '-c TimeZone=UTC' }),
  });
  try {
    const input = await ask();
    const passwords = new PasswordService();
    const admin = await createFirstAdmin(prisma, input, (p) =>
      passwords.hash(p),
    );
    console.log(
      `\nتم إنشاء المسؤول «${admin.username}». سيُطلب تغيير كلمة المرور عند أول دخول.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Run only as a command (importing this file, e.g. in tests, does nothing)
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    console.error(
      `\n${error instanceof AdminCreationError ? error.message : String(error)}`,
    );
    process.exit(1);
  });
}
