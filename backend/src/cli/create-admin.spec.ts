import { describe, expect, it, vi } from 'vitest';

import {
  AdminCreationError,
  createFirstAdmin,
  type AdminDb,
  type FirstAdminInput,
} from './create-admin.js';

const valid: FirstAdminInput = {
  username: '  Admin.Omar ',
  password: 'a-long-temporary-password',
  firstName: 'مسؤول',
  lastName: 'الجمعية',
};

function fakeDb(state: { admins?: number; taken?: string[] } = {}) {
  const create = vi.fn(
    async (args: Parameters<AdminDb['person']['create']>[0]) => ({
      user: { id: 'u1', username: args.data.user.create.username },
    }),
  );
  const db: AdminDb = {
    user: {
      count: vi.fn(async () => state.admins ?? 0),
      findUnique: vi.fn(async ({ where }: { where: { username: string } }) =>
        (state.taken ?? []).includes(where.username) ? { id: 'x' } : null,
      ),
    },
    person: { create },
  };
  return { db, create };
}
const hash = vi.fn(async (p: string) => `hashed:${p.length}`);

describe('admin:create — first administrator', () => {
  it('creates Person + ADMIN account: normalized username, hashed password, change forced at first login', async () => {
    const { db, create } = fakeDb();
    const admin = await createFirstAdmin(db, valid, hash);
    expect(admin).toEqual({ id: 'u1', username: 'admin.omar' });
    const data = create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      firstName: 'مسؤول',
      lastName: 'الجمعية',
      user: {
        create: {
          username: 'admin.omar',
          passwordHash: 'hashed:25',
          mustChangePassword: true,
          roles: { create: [{ role: 'ADMIN' }] },
        },
      },
    });
    // The clear password is never stored
    expect(JSON.stringify(data)).not.toContain(valid.password);
  });

  it('refuses when an active admin already exists (later admins come from the platform)', async () => {
    const { db, create } = fakeDb({ admins: 1 });
    await expect(createFirstAdmin(db, valid, hash)).rejects.toThrow(
      /يوجد مسؤول نشط بالفعل/,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('never touches an existing account with the same username', async () => {
    const { db, create } = fakeDb({ taken: ['admin.omar'] });
    await expect(createFirstAdmin(db, valid, hash)).rejects.toThrow(
      /مستعمل بالفعل/,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    [{ username: 'ab' }, /اسم المستخدم/],
    [{ username: 'مدير' }, /اسم المستخدم/],
    [{ password: 'short' }, /قصيرة جدًا/],
    [{ password: 'x'.repeat(129) }, /طويلة جدًا/],
    [{ firstName: '  ' }, /الاسم مطلوب/],
    [{ lastName: '' }, /اللقب مطلوب/],
  ])('validates like the API: %o', async (change, message) => {
    const { db, create } = fakeDb();
    const error = await createFirstAdmin(
      db,
      { ...valid, ...change },
      hash,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AdminCreationError);
    expect((error as Error).message).toMatch(message);
    expect(create).not.toHaveBeenCalled();
  });
});
