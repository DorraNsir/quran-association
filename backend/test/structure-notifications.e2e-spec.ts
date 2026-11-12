import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PasswordService } from '../src/auth/password.service.js';
import { todayIn } from '../src/common/dates.js';
import { sessionWhenAr } from '../src/communication/notification-text.js';
import { Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const RUN = randomUUID().slice(0, 8);
const PASSWORD = 'initial-pass-123';
const tag = (s: string) => `${s} ${RUN}`;
const TODAY = todayIn('Africa/Tunis');
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Phase 5: groups, classes (team, branch, status, group, weekly slots) and
 * upcoming lessons changed by an admin — each operation tells the people
 * concerned ONCE each, in its own transaction, naming the admin; a no-op,
 * a refused or a stale operation tells nobody.
 */
describe('Structure, team and schedule notifications (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const id: Record<string, string> = {};
  const uid: Record<string, string> = {};
  const token: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const as = () => ({ Authorization: `Bearer ${token.admin}` });
  const get = (path: string) => http().get(`/api/admin/${path}`).set(as());
  const post = (path: string, body: object = {}) =>
    http().post(`/api/admin/${path}`).set(as()).send(body);
  const patch = (path: string, body: object = {}) =>
    http().patch(`/api/admin/${path}`).set(as()).send(body);
  const put = (path: string, body: object) =>
    http().put(`/api/admin/${path}`).set(as()).send(body);
  const del = (path: string) => http().delete(`/api/admin/${path}`).set(as());
  const actor = `المسؤول الإداري admin ${tag('حساب')}`;
  const cls = (g: string, b = 'B1') => `${tag(g)} — ${tag(b)}`;

  /** This run's notifications since `since`, per account key: [type, title, message]. */
  async function since(t: Date) {
    const keyOf = new Map(Object.entries(uid).map(([k, v]) => [v, k]));
    const rows = await prisma.notification.findMany({
      where: { createdAt: { gte: t }, userId: { in: Object.values(uid) } },
      orderBy: { createdAt: 'asc' },
    });
    const out: Record<
      string,
      {
        type: string;
        title: string;
        message: string;
        entityType: string | null;
        entityId: string | null;
        actorUserId: string | null;
      }[]
    > = {};
    for (const r of rows)
      (out[keyOf.get(r.userId)!] ??= []).push({
        type: r.type,
        title: r.title,
        message: r.message,
        entityType: r.entityType,
        entityId: r.entityId,
        actorUserId: r.actorUserId,
      });
    return out;
  }
  const keys = (got: Record<string, unknown>) => Object.keys(got).sort();
  const mark = () => new Date(Date.now() - 1);

  /** The class form as it is now, with changes on top. */
  async function form(classId: string, changes: object = {}) {
    const c = (await get(`group-classes/${classId}`).expect(200)).body;
    const slots = (
      await get(`group-classes/${classId}/schedules`).expect(200)
    ).body.filter(
      // Only the slots it hosts (a shared slot hosted elsewhere is not its own)
      (s: { groupClass: { id: string } }) => s.groupClass.id === classId,
    );
    return {
      version: c.version,
      branchId: c.branch.id,
      status: c.status,
      supervisorId: c.supervisor.id,
      assistantTeacherIds: c.assistants.map((a: { id: string }) => a.id),
      slots: slots.map(
        (s: {
          id: string;
          dayOfWeek: string;
          startTime: string;
          endTime: string;
          roomId?: string;
          room?: { id: string };
        }) => ({
          id: s.id,
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          roomId: s.roomId ?? s.room!.id,
        }),
      ),
      ...changes,
    };
  }

  async function account(
    key: string,
    roles: Role[],
    opts: { teacher?: boolean; isActive?: boolean } = {},
  ) {
    const person = await prisma.person.create({
      data: {
        firstName: key,
        lastName: tag('حساب'),
        gender: 'MALE',
        dateOfBirth: new Date('2000-01-01'),
        address: 'نابل',
        phone: '22345678',
        ...(opts.teacher
          ? { teacher: { create: { joinedAt: new Date('2024-09-01') } } }
          : {}),
        user: {
          create: {
            username: `e2e-${RUN}-${key}`.toLowerCase(),
            passwordHash: await new PasswordService().hash(PASSWORD),
            mustChangePassword: false,
            isActive: opts.isActive ?? true,
            roles: { create: roles.map((role) => ({ role })) },
          },
        },
      },
      select: {
        id: true,
        teacher: { select: { id: true } },
        user: { select: { id: true } },
      },
    });
    uid[key] = person.user!.id;
    id[`person:${key}`] = person.id;
    if (opts.teacher) id[`teacher:${key}`] = person.teacher!.id;
    if (opts.isActive === false) return;
    token[key] = (
      await http()
        .post('/api/auth/login')
        .send({
          username: `e2e-${RUN}-${key}`.toLowerCase(),
          password: PASSWORD,
        })
        .expect(200)
    ).body.accessToken;
  }
  const enroll = async (key: string, classKey: string) =>
    (id[`student:${key}`] = (
      await post('students', {
        personId: id[`person:${key}`],
        groupClassId: id[classKey],
        registrationDate: addDays(TODAY, -10),
        guardianPhone: '98765432',
      }).expect(201)
    ).body.id);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await account('admin', [Role.ADMIN]);
    await account('admin2', [Role.ADMIN]);
    await account('adminTeacher', [Role.ADMIN, Role.TEACHER], {
      teacher: true,
    });
    for (const t of ['T1', 'T2', 'T3', 'T5', 'TX'])
      await account(t, [Role.TEACHER], { teacher: true });
    await account('disabledT', [Role.TEACHER], {
      teacher: true,
      isActive: false,
    });
    for (const s of ['sA', 'sP', 'sO']) await account(s, [Role.STUDENT]);

    id.B1 = (
      await post('branches', { name: tag('B1'), address: 'نابل' })
    ).body.id;
    id.B2 = (
      await post('branches', { name: tag('B2'), address: 'قربة' })
    ).body.id;
    for (const [k, b] of [
      ['R1', 'B1'],
      ['R2', 'B1'],
      ['R3', 'B2'],
    ])
      id[k] = (
        await post('rooms', { branchId: id[b], name: tag(k) }).expect(201)
      ).body.id;
    // Created by setup: notifications from here on are cleared below
    id.G = (await post('groups', { name: tag('G') }).expect(201)).body.id;
    const make = async (key: string, sup: string, assistants: string[]) =>
      (id[key] = (
        await post('group-classes', {
          groupId: id.G,
          branchId: id.B1,
          supervisorId: id[`teacher:${sup}`],
          assistantTeacherIds: assistants.map((a) => id[`teacher:${a}`]),
        }).expect(201)
      ).body.id);
    // A and P share a weekly slot hosted by A (same supervisor, same branch)
    await make('A', 'T1', ['T2', 'adminTeacher', 'disabledT']);
    await make('P', 'T1', ['T5']);
    await make('O', 'TX', []);
    id.shared = (
      await post(`group-classes/${id.A}/schedules`, {
        dayOfWeek: 'WED',
        startTime: '17:00',
        endTime: '18:00',
        roomId: id.R1,
        additionalGroupClassIds: [id.P],
      }).expect(201)
    ).body.id;
    await post(`group-classes/${id.O}/schedules`, {
      dayOfWeek: 'THU',
      startTime: '17:00',
      endTime: '18:00',
      roomId: id.R2,
    }).expect(201);
    await enroll('sA', 'A');
    await enroll('sP', 'P');
    await enroll('sO', 'O');
    await prisma.notification.deleteMany({
      where: { userId: { in: Object.values(uid) } },
    });
  });

  afterAll(async () => {
    const classes = { group: { name: { endsWith: RUN } } };
    const persons = { lastName: { endsWith: RUN } };
    const students = { person: persons };
    await prisma.notification.deleteMany({
      where: { userId: { in: Object.values(uid) } },
    });
    await prisma.paymentObligation.deleteMany({ where: { student: students } });
    await prisma.studentEnrollment.deleteMany({ where: { student: students } });
    await prisma.studentStatusChange.deleteMany({
      where: { student: students },
    });
    await prisma.student.deleteMany({ where: students });
    await prisma.session.deleteMany({ where: { groupClass: classes } });
    await prisma.weeklyScheduleClass.deleteMany({
      where: { groupClass: classes },
    });
    await prisma.weeklySchedule.deleteMany({ where: { groupClass: classes } });
    await prisma.groupClassAssistant.deleteMany({
      where: { groupClass: classes },
    });
    await prisma.groupClassMove.deleteMany({ where: { groupClass: classes } });
    await prisma.groupClass.deleteMany({ where: classes });
    await prisma.group.deleteMany({ where: { name: { endsWith: RUN } } });
    await prisma.room.deleteMany({
      where: { branch: { name: { endsWith: RUN } } },
    });
    await prisma.branch.deleteMany({ where: { name: { endsWith: RUN } } });
    await prisma.teacher.deleteMany({ where: { person: persons } });
    await prisma.user.deleteMany({ where: { person: persons } });
    await prisma.person.deleteMany({ where: persons });
    await app.close();
  });

  describe('groups', () => {
    it('a new group: the other admins only, naming the admin', async () => {
      const t = mark();
      const g = (await post('groups', { name: tag('النور') }).expect(201)).body
        .id;
      const got = await since(t);
      expect(keys(got)).toEqual(['admin2', 'adminTeacher']);
      expect(got.admin2[0]).toMatchObject({
        type: 'GROUP_CHANGED',
        title: 'مجموعة جديدة',
        message: `أنشأ ${actor} مجموعة ${tag('النور')}.`,
        entityType: 'GROUP',
        entityId: g,
        actorUserId: uid.admin,
      });
      id.G2 = g;
    });

    it('rename + status in one request: other admins and the teachers of its classes, once each', async () => {
      const t = mark();
      await patch(`groups/${id.G2}`, {
        name: tag('النور الجديد'),
        status: 'INACTIVE',
      }).expect(200);
      // G2 has no class yet: admins only
      expect(keys(await since(t))).toEqual(['admin2', 'adminTeacher']);
      const t2 = mark();
      await patch(`groups/${id.G}`, {
        name: tag('G') + ' ج',
        audience: 'كبار',
      }).expect(200);
      const got = await since(t2);
      // Teachers of A, P, O (an admin who teaches once; a disabled account never)
      expect(keys(got)).toEqual(
        ['T1', 'T2', 'T5', 'TX', 'admin2', 'adminTeacher'].sort(),
      );
      expect(Object.values(got).every((l) => l.length === 1)).toBe(true);
      expect(got.T5[0].message).toBe(
        `عدّل ${actor} مجموعة ${tag('G')} ج: الاسم: من ${tag('G')} إلى ${tag('G')} ج؛ الفئة المستهدفة: «كبار».`,
      );
      // Back, and a no-op save tells nobody
      await patch(`groups/${id.G}`, { name: tag('G'), audience: '' }).expect(
        200,
      );
      const t3 = mark();
      await patch(`groups/${id.G}`, { name: tag('G') }).expect(200);
      expect(await since(t3)).toEqual({});
    });
  });

  describe('classes: creation, team, structure', () => {
    it('a new class with its slots: admins once, its teachers with their role and its schedule', async () => {
      const t = mark();
      id.N = (
        await post('group-classes', {
          groupId: id.G,
          branchId: id.B1,
          supervisorId: id['teacher:T3'],
          assistantTeacherIds: [id['teacher:adminTeacher']],
          slots: [
            {
              dayOfWeek: 'SAT',
              startTime: '10:00',
              endTime: '11:00',
              roomId: id.R2,
            },
          ],
        }).expect(201)
      ).body.id;
      const got = await since(t);
      expect(keys(got)).toEqual(['T3', 'admin2', 'adminTeacher']);
      expect(got.admin2[0].message).toBe(`أنشأ ${actor} قسم ${cls('G')}.`);
      expect(got.T3[0]).toMatchObject({
        title: 'تكليف جديد',
        message: `أنشأ ${actor} قسم ${cls('G')} وعيّنك مشرفًا عليه: موعد جديد: السبت من 10:00 إلى 11:00 (${tag('R2')}).`,
      });
      // An admin who teaches it: one notification, the teacher's
      expect(got.adminTeacher).toHaveLength(1);
      expect(got.adminTeacher[0].message).toContain(
        'وأضافك معلمًا مساعدًا فيه',
      );
    });

    it('a team save: the removed and added assistants, and the supervisor, each once; nobody else', async () => {
      const t = mark();
      await put(
        `group-classes/${id.A}/save`,
        await form(id.A, {
          assistantTeacherIds: [
            id['teacher:adminTeacher'],
            id['teacher:disabledT'],
            id['teacher:T3'],
          ],
        }),
      ).expect(200);
      const got = await since(t);
      expect(keys(got)).toEqual(['T1', 'T2', 'T3']);
      expect(got.T2[0]).toMatchObject({
        title: 'إنهاء تكليف',
        message: `أزالك ${actor} من فريق قسم ${cls('G')}.`,
      });
      expect(got.T3[0]).toMatchObject({
        title: 'تكليف جديد',
        message: `أضافك ${actor} معلمًا مساعدًا في قسم ${cls('G')}.`,
      });
      expect(got.T1[0].message).toBe(
        `عدّل ${actor} قسم ${cls('G')}: معلم مساعد جديد: T3 ${tag('حساب')}؛ لم يعد معلمًا مساعدًا: T2 ${tag('حساب')}.`,
      );
    });

    it('team and slots in one save: the supervisor gets one «عدّل … قسم» with both', async () => {
      const t = mark();
      const body = await form(id.N);
      await put(`group-classes/${id.N}/save`, {
        ...body,
        assistantTeacherIds: [],
        slots: [
          ...body.slots,
          {
            dayOfWeek: 'FRI',
            startTime: '10:00',
            endTime: '11:00',
            roomId: id.R2,
          },
        ],
      }).expect(200);
      const got = await since(t);
      expect(got.T3).toHaveLength(1);
      expect(got.T3[0].message).toBe(
        `عدّل ${actor} قسم ${cls('G')}: لم يعد معلمًا مساعدًا: adminTeacher ${tag('حساب')}؛ موعد جديد: الجمعة من 10:00 إلى 11:00 (${tag('R2')}).`,
      );
      expect(got.adminTeacher[0].message).toBe(
        `أزالك ${actor} من فريق قسم ${cls('G')}.`,
      );
    });

    it('a branch change: admins and teachers get the branch, the students their slot’s new room', async () => {
      const t = mark();
      const body = await form(id.O);
      await put(`group-classes/${id.O}/save`, {
        ...body,
        branchId: id.B2,
        slots: body.slots.map((s: object) => ({ ...s, roomId: id.R3 })),
      }).expect(200);
      const got = await since(t);
      expect(keys(got)).toEqual(['TX', 'admin2', 'adminTeacher', 'sO'].sort());
      const name = cls('G', 'B2');
      expect(got.admin2[0].message).toBe(
        `عدّل ${actor} قسم ${name}: الفرع: من ${tag('B1')} إلى ${tag('B2')}.`,
      );
      const move = `تغيّر موعد: من الخميس من 17:00 إلى 18:00 (${tag('R2')}) إلى الخميس من 17:00 إلى 18:00 (${tag('R3')})`;
      expect(got.TX[0].message).toBe(
        `عدّل ${actor} قسم ${name}: الفرع: من ${tag('B1')} إلى ${tag('B2')}؛ ${move}.`,
      );
      expect(got.sO[0]).toMatchObject({
        title: 'تعديل المواعيد',
        message: `عدّل ${actor} مواعيد قسم ${name}: ${move}.`,
      });
    });

    it('a status change through the legacy endpoint: admins and its teachers', async () => {
      const t = mark();
      await patch(`group-classes/${id.N}/status`, {
        status: 'INACTIVE',
      }).expect(200);
      const got = await since(t);
      expect(keys(got)).toEqual(['T3', 'admin2', 'adminTeacher']);
      expect(got.T3[0].message).toBe(
        `عدّل ${actor} قسم ${cls('G')}: الحالة: من نشط إلى غير نشط.`,
      );
      await patch(`group-classes/${id.N}/status`, { status: 'ACTIVE' }).expect(
        200,
      );
    });

    it('a supervisor change through the legacy endpoint: the new and the former supervisor', async () => {
      const t = mark();
      await patch(`group-classes/${id.N}`, {
        supervisorId: id['teacher:T5'],
        assistantTeacherIds: [],
      }).expect(200);
      const got = await since(t);
      expect(keys(got)).toEqual(['T3', 'T5']);
      expect(got.T5[0].message).toBe(
        `عيّنك ${actor} مشرفًا على قسم ${cls('G')}.`,
      );
      expect(got.T3[0].message).toBe(
        `أعفاك ${actor} من الإشراف على قسم ${cls('G')}.`,
      );
    });

    it('moving a class to another group: admins and its teachers see the group change', async () => {
      const q = (
        await post('group-classes', {
          groupId: id.G,
          branchId: id.B1,
          supervisorId: id['teacher:TX'],
        }).expect(201)
      ).body.id;
      await patch(`groups/${id.G2}`, { status: 'ACTIVE' }).expect(200);
      const t = mark();
      await post(`group-classes/${q}/move`, { groupId: id.G2 }).expect(200);
      const got = await since(t);
      expect(keys(got)).toEqual(['TX', 'admin2', 'adminTeacher']);
      expect(got.TX[0].message).toBe(
        `عدّل ${actor} قسم ${tag('النور الجديد')} — ${tag('B1')}: المجموعة: من ${tag('G')} إلى ${tag('النور الجديد')}.`,
      );
    });
  });

  describe('weekly slots, shared slots', () => {
    it('a hosted shared slot moved: both classes’ teachers and students, a teacher of both once', async () => {
      const t = mark();
      const body = await form(id.A);
      await put(`group-classes/${id.A}/save`, {
        ...body,
        slots: body.slots.map((s: { id: string }) =>
          s.id === id.shared
            ? { ...s, startTime: '18:00', endTime: '19:00' }
            : s,
        ),
      }).expect(200);
      const got = await since(t);
      // A: T1, T3, adminTeacher, sA — P: T1 (again), T5, sP; a disabled account never
      expect(keys(got)).toEqual(
        ['T1', 'T3', 'T5', 'adminTeacher', 'sA', 'sP'].sort(),
      );
      expect(Object.values(got).every((l) => l.length === 1)).toBe(true);
      const move = `تغيّر موعد: من الأربعاء من 17:00 إلى 18:00 (${tag('R1')}) إلى الأربعاء من 18:00 إلى 19:00 (${tag('R1')})`;
      expect(got.sA[0].message).toBe(
        `عدّل ${actor} مواعيد قسم ${cls('G')}: ${move}.`,
      );
      expect(got.sP[0].entityId).toBe(id.P);
      // The supervisor of both: one message, both classes
      expect(got.T1[0].message).toContain(`وفي قسم ${cls('G')}: ${move}`);
    });

    it('legacy slot endpoints: added, then removed — the class’s people each time', async () => {
      let t = mark();
      const slot = (
        await post(`group-classes/${id.O}/schedules`, {
          dayOfWeek: 'SUN',
          startTime: '09:00',
          endTime: '10:00',
          roomId: id.R3,
        }).expect(201)
      ).body.id;
      let got = await since(t);
      expect(keys(got)).toEqual(['TX', 'sO']);
      expect(got.sO[0].message).toBe(
        `عدّل ${actor} مواعيد قسم ${cls('G', 'B2')}: موعد جديد: الأحد من 09:00 إلى 10:00 (${tag('R3')}).`,
      );
      t = mark();
      await del(`group-classes/${id.O}/schedules/${slot}`).expect(204);
      got = await since(t);
      expect(got.sO[0].message).toContain(
        'موعد محذوف: الأحد من 09:00 إلى 10:00',
      );
    });
  });

  describe('nothing for no-op, refused, stale or lost saves', () => {
    it('no-op save, stale form, refused save: nobody notified', async () => {
      const t = mark();
      await put(`group-classes/${id.A}/save`, await form(id.A)).expect(200);
      const stale = await form(id.A, { assistantTeacherIds: [] });
      await patch(`group-classes/${id.A}/schedules/${id.shared}`, {
        roomId: id.R2,
      }).expect(200);
      const t2 = mark();
      await put(`group-classes/${id.A}/save`, stale).expect(409);
      // A room conflict in a new slot (O holds R3 … another class): refused as a whole
      await put(
        `group-classes/${id.A}/save`,
        await form(id.A, {
          assistantTeacherIds: [],
          slots: [
            ...(await form(id.A)).slots,
            {
              dayOfWeek: 'WED',
              startTime: '18:30',
              endTime: '19:30',
              roomId: id.R2,
            },
          ],
        }),
      ).expect(409);
      expect(await since(t2)).toEqual({});
      // (the legacy room change in between did notify, on its own)
      expect(Object.keys(await since(t)).length).toBeGreaterThan(0);
    });

    it('two admins saving at once: only the winner’s change is announced', async () => {
      const a = await form(id.A, { assistantTeacherIds: [id['teacher:T3']] });
      const b = await form(id.A, {
        assistantTeacherIds: [id['teacher:T2'], id['teacher:T3']],
      });
      const t = mark();
      const res = await Promise.all([
        put(`group-classes/${id.A}/save`, a),
        put(`group-classes/${id.A}/save`, b),
      ]);
      expect(res.map((r) => r.status).sort((x, y) => x - y)).toEqual([
        200, 409,
      ]);
      const got = await since(t);
      if (res[0].status === 200) {
        // a: adminTeacher removed
        expect(keys(got)).toEqual(['T1', 'adminTeacher']);
      } else {
        // b: T2 added, adminTeacher removed
        expect(keys(got)).toEqual(['T1', 'T2', 'adminTeacher']);
      }
    });
  });

  describe('upcoming lessons', () => {
    it('an extra lesson, rescheduled, cancelled (kept in history), restored: its teachers and students each time', async () => {
      const date = addDays(TODAY, 3);
      let t = mark();
      const lesson = (
        await post('sessions/extra', {
          groupClassId: id.O,
          roomId: id.R3,
          date,
          startTime: '20:00',
          endTime: '21:00',
        }).expect(201)
      ).body.id;
      let got = await since(t);
      expect(keys(got)).toEqual(['TX', 'sO']);
      const c = cls('G', 'B2');
      expect(got.sO[0]).toMatchObject({
        type: 'SESSION_CHANGED',
        title: 'حصة إضافية',
        message: `أضاف ${actor} حصة إضافية لقسم ${c}: ${sessionWhenAr(date, '20:00', '21:00')} (${tag('R3')}).`,
        entityType: 'SESSION',
        entityId: lesson,
      });
      t = mark();
      await patch(`sessions/${lesson}`, {
        startTime: '19:00',
        endTime: '20:00',
      }).expect(200);
      got = await since(t);
      expect(got.TX[0].message).toBe(
        `غيّر ${actor} موعد حصة قسم ${c}: من ${sessionWhenAr(date, '20:00', '21:00')} (${tag('R3')}) إلى ${sessionWhenAr(date, '19:00', '20:00')} (${tag('R3')}).`,
      );
      t = mark();
      await patch(`sessions/${lesson}/status`, {
        status: 'CANCELLED',
        cancellationReason: 'عطلة',
      }).expect(200);
      got = await since(t);
      expect(got.sO[0]).toMatchObject({
        title: 'إلغاء حصة',
        message: `ألغى ${actor} حصة قسم ${c}: ${sessionWhenAr(date, '19:00', '20:00')} (${tag('R3')})، السبب: عطلة.`,
      });
      // Cancelled: still listed, still opens the lesson
      const list = (
        await http()
          .get('/api/notifications')
          .query({ pageSize: 50 })
          .set({ Authorization: `Bearer ${token.sO}` })
          .expect(200)
      ).body.data.filter((n: { entityId: string }) => n.entityId === lesson);
      expect(list).toHaveLength(3);
      expect(list.every((n: { available: boolean }) => n.available)).toBe(true);
      t = mark();
      await patch(`sessions/${lesson}/status`, { status: 'SCHEDULED' }).expect(
        200,
      );
      got = await since(t);
      expect(got.TX[0].title).toBe('إعادة برمجة حصة');
    });

    it('a past lesson changed by hand notifies nobody; generated lessons never do', async () => {
      const past = addDays(TODAY, -2);
      const t = mark();
      const lesson = (
        await post('sessions', {
          groupClassId: id.O,
          roomId: id.R3,
          date: past,
          startTime: '06:00',
          endTime: '07:00',
        }).expect(201)
      ).body.id;
      await patch(`sessions/${lesson}/status`, { status: 'CANCELLED' }).expect(
        200,
      );
      await post('sessions/generate', {
        from: TODAY,
        to: addDays(TODAY, 14),
        groupClassId: id.O,
      });
      expect(await since(t)).toEqual({});
    });
  });

  describe('access', () => {
    it('a removed teacher can no longer open the class; a current teacher and the admin can', async () => {
      const ws = async (who: string) =>
        (
          await http()
            .get('/api/teacher/workspace')
            .set({ Authorization: `Bearer ${token[who]}` })
            .expect(200)
        ).body as {
          groupClasses: { id: string }[];
          groups: { id: string }[];
        };
      expect((await ws('T2')).groupClasses.map((c) => c.id)).not.toContain(
        id.A,
      );
      expect((await ws('T1')).groupClasses.map((c) => c.id)).toContain(id.A);
      expect((await ws('T1')).groups.map((g) => g.id)).toContain(id.G);
      await get(`group-classes/${id.A}`).expect(200);
      await http()
        .get(`/api/admin/groups/${id.G}`)
        .set({ Authorization: `Bearer ${token.T1}` })
        .expect(403);
    });
  });
});
