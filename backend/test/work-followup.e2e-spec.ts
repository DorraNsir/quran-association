import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';

import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PasswordService } from '../src/auth/password.service.js';
import { todayIn } from '../src/common/dates.js';
import { Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const RUN = randomUUID().slice(0, 8);
const PASSWORD = 'initial-pass-123';
const tag = (s: string) => `${s} ${RUN}`;
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const TODAY = todayIn('Africa/Tunis');
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const weekdayOf = (d: string) =>
  WEEKDAYS[new Date(`${d}T00:00:00Z`).getUTCDay()];

interface Item {
  id: string;
  version: number;
  type: string;
  description: string;
  status: string;
  recitationNumber: number | null;
  evaluationComment: string | null;
  evaluatedAt: string | null;
  carriedFrom: {
    itemId: string;
    sessionId: string;
    sessionDate: string;
    status: string;
  } | null;
  continuedFrom: { itemId: string; recitationNumber: number | null } | null;
  carriedTo: { sessionId: string }[];
  continuedBy: { sessionId: string }[];
}
interface Program {
  id: string;
  version: number;
  session: { id: string; date: string; startTime: string; status: string };
  items: Item[];
  progress: Record<string, number | null>;
  lastEditedBy: string | null;
  generalNotes: string | null;
}

/**
 * «متابعة العمل»: programs (one per student per session), items, evaluation,
 * transfer, next recitation — authorization (team snapshot), roster
 * (enrolment on the date), concurrency and history.
 * Class C: SUP supervises, ASST assists; class X: OTHER. s1, s2 in C; s3 in X.
 */
describe('Work follow-up — متابعة العمل (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const id: Record<string, string> = {};
  const token: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ Authorization: `Bearer ${token[who]}` });
  const scope = (who: string) => (who === 'admin' ? 'admin' : 'teacher');
  const api = {
    get: (who: string, path: string, query: object = {}) =>
      http()
        .get(`/api/${scope(who)}/${path}`)
        .query(query)
        .set(as(who)),
    post: (who: string, path: string, body: object = {}) =>
      http()
        .post(`/api/${scope(who)}/${path}`)
        .set(as(who))
        .send(body),
    patch: (who: string, path: string, body: object) =>
      http()
        .patch(`/api/${scope(who)}/${path}`)
        .set(as(who))
        .send(body),
  };
  const admin = {
    post: (path: string, body: object = {}) =>
      http().post(`/api/admin/${path}`).set(as('admin')).send(body),
    patch: (path: string, body: object) =>
      http().patch(`/api/admin/${path}`).set(as('admin')).send(body),
  };
  const programOf = async (who: string, programId: string) =>
    (await api.get(who, `work-programs/${programId}`).expect(200))
      .body as Program;
  const create = (
    who: string,
    studentKey: string,
    sessionKey: string,
    items: object[],
    extra: object = {},
  ) =>
    api.post(who, 'work-programs', {
      studentId: id[studentKey],
      sessionId: id[sessionKey],
      items,
      ...extra,
    });
  const evaluate = (
    who: string,
    program: Program,
    itemId: string,
    status: string,
    extra: object = {},
  ) =>
    api.patch(who, `work-items/${itemId}/evaluation`, {
      status,
      version: program.items.find((i) => i.id === itemId)!.version,
      ...extra,
    });

  async function account(key: string, roles: Role[], teacher = false) {
    const person = await prisma.person.create({
      data: {
        firstName: key,
        lastName: tag('حساب'),
        ...(teacher
          ? { teacher: { create: { joinedAt: new Date('2024-09-01') } } }
          : {}),
        user: {
          create: {
            username: `e2e-${RUN}-${key}`.toLowerCase(),
            passwordHash: await new PasswordService().hash(PASSWORD),
            mustChangePassword: false,
            roles: { create: roles.map((role) => ({ role })) },
          },
        },
      },
      select: { id: true, teacher: { select: { id: true } } },
    });
    if (teacher) id[key] = person.teacher!.id;
    id[`person:${key}`] = person.id;
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

  const session = async (classKey: string, date: string, start: string) =>
    (
      await admin
        .post('sessions', {
          groupClassId: id[classKey],
          roomId: id[classKey === 'X' ? 'roomX' : 'room'],
          date,
          startTime: start,
          endTime: `${String(Number(start.slice(0, 2)) + 1).padStart(2, '0')}:${start.slice(3)}`,
        })
        .expect(201)
    ).body.id as string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await account('admin', [Role.ADMIN]);
    await account('sup', [Role.TEACHER], true);
    await account('asst', [Role.TEACHER], true);
    await account('other', [Role.TEACHER], true);
    await account('newcomer', [Role.TEACHER], true);

    id.branch = (
      await admin
        .post('branches', { name: tag('فرع'), address: 'نابل' })
        .expect(201)
    ).body.id;
    id.room = (
      await admin
        .post('rooms', { branchId: id.branch, name: tag('قاعة') })
        .expect(201)
    ).body.id;
    id.roomX = (
      await admin
        .post('rooms', { branchId: id.branch, name: tag('قاعة 2') })
        .expect(201)
    ).body.id;
    id.group = (
      await admin.post('groups', { name: tag('مجموعة الماهر') }).expect(201)
    ).body.id;
    id.C = (
      await admin
        .post('group-classes', {
          groupId: id.group,
          branchId: id.branch,
          supervisorId: id.sup,
          assistantTeacherIds: [id.asst],
        })
        .expect(201)
    ).body.id;
    id.X = (
      await admin
        .post('group-classes', {
          groupId: id.group,
          branchId: id.branch,
          supervisorId: id.other,
        })
        .expect(201)
    ).body.id;
    const student = async (key: string, classKey: string) => {
      id[key] = (
        await admin
          .post('students', {
            person: {
              firstName: key,
              lastName: tag('طالب'),
              gender: 'FEMALE',
              dateOfBirth: '2014-05-01',
              address: 'نابل',
            },
            groupClassId: id[classKey],
            registrationDate: addDays(TODAY, -60),
            guardianPhone: '98765432',
          })
          .expect(201)
      ).body.id;
    };
    await student('s1', 'C');
    await student('s2', 'C');
    await student('s3', 'X');
    // A student account (s1)
    const s1 = await prisma.student.findUniqueOrThrow({
      where: { id: id.s1 },
      select: { personId: true },
    });
    await prisma.user.create({
      data: {
        personId: s1.personId,
        username: `e2e-${RUN}-pupil`,
        passwordHash: await new PasswordService().hash(PASSWORD),
        mustChangePassword: false,
        roles: { create: [{ role: Role.STUDENT }] },
      },
    });
    token.pupil = (
      await http()
        .post('/api/auth/login')
        .send({ username: `e2e-${RUN}-pupil`, password: PASSWORD })
        .expect(200)
    ).body.accessToken;

    id.past = await session('C', addDays(TODAY, -2), '16:00');
    id.u1 = await session('C', addDays(TODAY, 2), '16:00');
    id.u2 = await session('C', addDays(TODAY, 4), '16:00');
    id.u3 = await session('C', addDays(TODAY, 6), '16:00');
    id.u4 = await session('C', addDays(TODAY, 8), '16:00');
    id.cancelled = await session('C', addDays(TODAY, 3), '16:00');
    await admin
      .patch(`sessions/${id.cancelled}/status`, { status: 'CANCELLED' })
      .expect(200);
    id.x1 = await session('X', addDays(TODAY, 2), '08:00');
  });

  afterAll(async () => {
    const classes = { group: { name: { endsWith: RUN } } };
    const persons = (
      await prisma.person.findMany({
        where: { lastName: { endsWith: RUN } },
        select: { id: true },
      })
    ).map((p) => p.id);
    const programs = { program: { session: { groupClass: classes } } };
    // Items reference each other (RESTRICT): unlink, then delete
    await prisma.workItem.updateMany({
      where: programs,
      data: {
        carriedFromItemId: null,
        carriedFromStatus: null,
        continuedFromItemId: null,
      },
    });
    await prisma.workItem.deleteMany({ where: programs });
    await prisma.workProgram.deleteMany({
      where: { session: { groupClass: classes } },
    });
    await prisma.studentAttendance.deleteMany({
      where: { session: { groupClass: classes } },
    });
    await prisma.session.deleteMany({ where: { groupClass: classes } });
    await prisma.weeklySchedule.deleteMany({ where: { groupClass: classes } });
    await prisma.studentEnrollment.deleteMany({
      where: { student: { personId: { in: persons } } },
    });
    await prisma.studentStatusChange.deleteMany({
      where: { student: { personId: { in: persons } } },
    });
    await prisma.paymentObligation.deleteMany({
      where: { student: { personId: { in: persons } } },
    });
    await prisma.student.deleteMany({ where: { personId: { in: persons } } });
    await prisma.groupClassAssistant.deleteMany({
      where: { groupClass: classes },
    });
    await prisma.groupClass.deleteMany({ where: classes });
    await prisma.teacher.deleteMany({ where: { personId: { in: persons } } });
    await prisma.user.deleteMany({ where: { personId: { in: persons } } });
    await prisma.person.deleteMany({ where: { id: { in: persons } } });
    await prisma.room.deleteMany({
      where: { branch: { name: { endsWith: RUN } } },
    });
    await prisma.branch.deleteMany({ where: { name: { endsWith: RUN } } });
    await prisma.group.deleteMany({ where: { name: { endsWith: RUN } } });
    await app.close();
  });

  // ───────────────────────── creation ─────────────────────────

  describe('program creation', () => {
    const LONG = `مراجعة من سورة الزمر إلى سورة الناس\nمع التركيز على المدود\n${'ا'.repeat(300)}`;

    it('the supervisor creates ONE program with several items, for a real student and session', async () => {
      const res = await create('sup', 's1', 'u1', [
        { type: 'REVISION', description: `  ${LONG}  ` },
        {
          type: 'RECITATION',
          description: 'العرضة الثانية من سورة التوبة',
          recitationNumber: 2,
        },
        {
          type: 'EXAM',
          description: 'اختبار من سورة الروم إلى سورة الناس',
          recitationNumber: 7,
        },
        { type: 'MEMORIZATION', description: 'حفظ صفحتين من سورة البقرة' },
      ]).expect(201);
      const p = res.body as Program;
      id.p1 = p.id;
      expect(p.session).toMatchObject({
        id: id.u1,
        date: addDays(TODAY, 2),
        startTime: '16:00',
        status: 'SCHEDULED',
      });
      expect(p.items.map((i) => [i.type, i.status])).toEqual([
        ['REVISION', 'NOT_EVALUATED'],
        ['RECITATION', 'NOT_EVALUATED'],
        ['EXAM', 'NOT_EVALUATED'],
        ['MEMORIZATION', 'NOT_EVALUATED'],
      ]);
      // Multiline text kept whole (only the ends trimmed); a number only for a recitation
      expect(p.items[0].description).toBe(LONG);
      expect(p.items.map((i) => i.recitationNumber)).toEqual([
        null,
        2,
        null,
        null,
      ]);
      expect(p.progress).toMatchObject({
        total: 4,
        active: 4,
        completed: 0,
        pending: 4,
        cancelled: 0,
        rate: 0,
      });
      expect(p.lastEditedBy).toBe(`sup ${tag('حساب')}`);
      const rows = await prisma.workItem.count({
        where: { workProgramId: p.id },
      });
      expect(rows).toBe(4);
    });

    it('a second program for the same student and session is refused (with the existing id)', async () => {
      const res = await create('asst', 's1', 'u1', [
        { type: 'REVISION', description: 'x' },
      ]).expect(409);
      expect(res.body).toMatchObject({
        code: 'WORK_PROGRAM_EXISTS',
        programId: id.p1,
      });
    });

    it('two teachers creating the same program at once: exactly one program', async () => {
      const both = await Promise.all([
        create('sup', 's2', 'u2', [{ type: 'REVISION', description: 'أ' }]),
        create('asst', 's2', 'u2', [{ type: 'REVISION', description: 'ب' }]),
      ]);
      expect(both.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);
      expect(
        await prisma.workProgram.count({
          where: { studentId: id.s2, sessionId: id.u2 },
        }),
      ).toBe(1);
    });

    it('validation: student, session, items, description, recitation number', async () => {
      await api
        .post('admin', 'work-programs', {
          studentId: randomUUID(),
          sessionId: id.u3,
          items: [{ type: 'EXAM', description: 'x' }],
        })
        .expect(404);
      await api
        .post('admin', 'work-programs', {
          studentId: id.s1,
          sessionId: randomUUID(),
          items: [{ type: 'EXAM', description: 'x' }],
        })
        .expect(404);
      await create('admin', 's1', 'u3', []).expect(400);
      await create('admin', 's1', 'u3', [
        { type: 'EXAM', description: '   ' },
      ]).expect(400);
      await create('admin', 's1', 'u3', [
        { type: 'BOGUS', description: 'x' },
      ]).expect(400);
      await create('admin', 's1', 'u3', [
        { type: 'RECITATION', description: 'x', recitationNumber: 0 },
      ]).expect(400);
      await create('admin', 's1', 'u3', [
        { type: 'EXAM', description: 'x'.repeat(2001) },
      ]).expect(400);
      // A student of another class is not in this session
      expect(
        (
          await create('admin', 's3', 'u3', [
            { type: 'EXAM', description: 'x' },
          ]).expect(400)
        ).body.code,
      ).toBe('WORK_STUDENT_NOT_IN_SESSION');
    });

    it('only upcoming, scheduled sessions receive new programs', async () => {
      expect(
        (
          await create('sup', 's1', 'cancelled', [
            { type: 'EXAM', description: 'x' },
          ]).expect(409)
        ).body.code,
      ).toBe('WORK_SESSION_CANCELLED');
      expect(
        (
          await create('sup', 's1', 'past', [
            { type: 'EXAM', description: 'x' },
          ]).expect(409)
        ).body.code,
      ).toBe('WORK_SESSION_NOT_UPCOMING');
    });

    it('authorization: another class’s teacher and students are refused', async () => {
      await create('other', 's1', 'u3', [
        { type: 'EXAM', description: 'x' },
      ]).expect(403);
      await http()
        .post('/api/teacher/work-programs')
        .set(as('pupil'))
        .send({
          studentId: id.s1,
          sessionId: id.u3,
          items: [{ type: 'EXAM', description: 'x' }],
        })
        .expect(403);
      await http()
        .get('/api/teacher/work-programs')
        .set(as('pupil'))
        .expect(403);
      await http().get('/api/admin/work-programs').set(as('sup')).expect(403);
      await api.get('other', `work-programs/${id.p1}`).expect(403);
    });

    it('the assistant creates and reads programs of the class too', async () => {
      const p = (
        await create('asst', 's2', 'u1', [
          { type: 'MEMORIZATION', description: 'حفظ سورة الملك' },
        ]).expect(201)
      ).body;
      id.p2 = p.id;
      await programOf('sup', p.id);
    });
  });

  // ───────────────────────── sessions ─────────────────────────

  describe('eligible sessions', () => {
    it('existing upcoming scheduled sessions of the student’s class, with an existing program flagged', async () => {
      const list = (
        await api
          .get('sup', 'work-programs/eligible-sessions', { studentId: id.s1 })
          .expect(200)
      ).body as { id: string; programId: string | null; groupName: string }[];
      const ids = list.map((s) => s.id);
      expect(ids).toEqual(expect.arrayContaining([id.u1, id.u2, id.u3, id.u4]));
      expect(ids).not.toContain(id.past);
      expect(ids).not.toContain(id.cancelled);
      expect(ids).not.toContain(id.x1);
      expect(list.find((s) => s.id === id.u1)!.programId).toBe(id.p1);
      expect(list[0].groupName).toBe(tag('مجموعة الماهر'));
      // Later than a source session only
      const later = (
        await api
          .get('sup', 'work-programs/eligible-sessions', {
            studentId: id.s1,
            afterSessionId: id.u2,
          })
          .expect(200)
      ).body.map((s: { id: string }) => s.id);
      expect(later).toEqual(expect.arrayContaining([id.u3, id.u4]));
      expect(later).not.toContain(id.u1);
      expect(later).not.toContain(id.u2);
      // Another class's teacher sees none of them
      expect(
        (
          await api
            .get('other', 'work-programs/eligible-sessions', {
              studentId: id.s1,
            })
            .expect(200)
        ).body,
      ).toEqual([]);
    });
  });

  // ───────────────────────── evaluation ─────────────────────────

  describe('evaluation', () => {
    it('one item at a time: others untouched, time and evaluator stored, comment kept', async () => {
      const before = await programOf('sup', id.p1);
      const target = before.items[0];
      const after = (
        await evaluate('asst', before, target.id, 'COMPLETED', {
          evaluationComment: '  أداء متقن  ',
        }).expect(200)
      ).body as Program;
      const item = after.items[0];
      expect(item).toMatchObject({
        status: 'COMPLETED',
        evaluationComment: 'أداء متقن',
        version: target.version + 1,
      });
      expect(item.evaluatedAt).toBeTruthy();
      expect(after.items.slice(1).map((i) => [i.status, i.version])).toEqual(
        before.items.slice(1).map((i) => [i.status, i.version]),
      );
      expect(after.items[0].description).toBe(target.description);
      expect(after.progress).toMatchObject({ completed: 1, pending: 3 });
      // Evaluation never touches attendance or the session
      expect(
        await prisma.studentAttendance.count({ where: { sessionId: id.u1 } }),
      ).toBe(0);
      expect(after.session.status).toBe('SCHEDULED');
    });

    it('accepts every status (the six), refuses others', async () => {
      let p = await programOf('sup', id.p1);
      const item = p.items[2];
      for (const status of [
        'NOT_COMPLETED',
        'PARTIAL',
        'POSTPONED',
        'CANCELLED',
        'NOT_EVALUATED',
        'COMPLETED',
      ]) {
        p = (await evaluate('sup', p, item.id, status).expect(200)).body;
        expect(p.items[2].status).toBe(status);
      }
      await evaluate('sup', p, item.id, 'DONE').expect(400);
    });

    it('a stale client cannot overwrite a newer evaluation', async () => {
      const seen = await programOf('sup', id.p1);
      await evaluate('sup', seen, seen.items[3].id, 'PARTIAL').expect(200);
      // Same version seen by another teacher
      const res = await evaluate(
        'asst',
        seen,
        seen.items[3].id,
        'COMPLETED',
      ).expect(409);
      expect(res.body).toMatchObject({
        code: 'WORK_ITEM_CHANGED',
        conflicts: [seen.items[3].id],
      });
      expect((await programOf('sup', id.p1)).items[3].status).toBe('PARTIAL');
    });

    it('batch evaluation with notes is atomic: one stale line refuses everything', async () => {
      const seen = await programOf('sup', id.p1);
      const res = await api
        .patch('sup', `work-programs/${id.p1}/evaluation`, {
          version: seen.version,
          generalNotes: 'ملاحظة',
          items: [
            {
              id: seen.items[1].id,
              status: 'NOT_COMPLETED',
              version: seen.items[1].version,
            },
            {
              id: seen.items[3].id,
              status: 'POSTPONED',
              version: seen.items[3].version - 1,
            },
          ],
        })
        .expect(409);
      expect(res.body.code).toBe('WORK_ITEM_CHANGED');
      const after = await programOf('sup', id.p1);
      expect([after.items[1].status, after.generalNotes]).toEqual([
        seen.items[1].status,
        null,
      ]);
      // Now valid
      const ok = (
        await api
          .patch('sup', `work-programs/${id.p1}/evaluation`, {
            version: seen.version,
            generalNotes: 'تحتاج الطالبة إلى تحسين التجويد',
            items: [
              {
                id: seen.items[1].id,
                status: 'NOT_COMPLETED',
                version: seen.items[1].version,
              },
              {
                id: seen.items[3].id,
                status: 'POSTPONED',
                version: seen.items[3].version,
              },
            ],
          })
          .expect(200)
      ).body as Program;
      expect(ok.generalNotes).toBe('تحتاج الطالبة إلى تحسين التجويد');
      expect(ok.version).toBe(seen.version + 1);
      // Notes from a stale program version are refused
      await api
        .patch('asst', `work-programs/${id.p1}/evaluation`, {
          version: seen.version,
          generalNotes: 'x',
          items: [],
        })
        .expect(409);
    });
  });

  // ───────────────────────── editing ─────────────────────────

  describe('editing', () => {
    it('edits planning and adds items without resetting results; never deletes', async () => {
      const seen = await programOf('sup', id.p1);
      const evaluated = seen.items[0]; // COMPLETED
      const res = (
        await api
          .patch('asst', `work-programs/${id.p1}`, {
            items: [
              {
                id: evaluated.id,
                version: evaluated.version,
                description: 'مراجعة سورة الزمر',
              },
            ],
            newItems: [
              {
                type: 'RECITATION',
                description: 'العرضة الأولى من سورة يس',
                recitationNumber: 1,
              },
            ],
          })
          .expect(200)
      ).body as Program;
      expect(res.items[0]).toMatchObject({
        description: 'مراجعة سورة الزمر',
        status: 'COMPLETED',
      });
      expect(res.items).toHaveLength(5);
      expect(res.items[4]).toMatchObject({
        status: 'NOT_EVALUATED',
        recitationNumber: 1,
      });
      expect(res.lastEditedBy).toBe(`asst ${tag('حساب')}`);
      // A stale edit is refused
      await api
        .patch('sup', `work-items/${evaluated.id}`, {
          version: evaluated.version,
          description: 'قديم',
        })
        .expect(409);
    });
  });

  // ───────────────────────── transfer ─────────────────────────

  describe('transfer «نقل إلى الحصة القادمة»', () => {
    it('only غير منجز / جزئي / مؤجل / ملغى can be carried', async () => {
      const p = await programOf('sup', id.p1);
      // items: 0 COMPLETED, 1 NOT_COMPLETED (عرضة 2), 2 COMPLETED, 3 POSTPONED, 4 NOT_EVALUATED
      for (const i of [0, 4])
        expect(
          (
            await api
              .post('sup', `work-items/${p.items[i].id}/transfer`, {
                targetSessionId: id.u2,
              })
              .expect(409)
          ).body.code,
        ).toBe('WORK_ITEM_NOT_TRANSFERABLE');
    });

    it('carries the same task into a later session (new program), source untouched; recitation keeps its number', async () => {
      const p = await programOf('sup', id.p1);
      const recitation = p.items[1];
      const target = (
        await api
          .post('asst', `work-items/${recitation.id}/transfer`, {
            targetSessionId: id.u3,
          })
          .expect(201)
      ).body as Program;
      id.p3 = target.id;
      expect(target.session.id).toBe(id.u3);
      expect(target.items).toHaveLength(1);
      expect(target.items[0]).toMatchObject({
        type: 'RECITATION',
        description: recitation.description,
        recitationNumber: 2,
        status: 'NOT_EVALUATED',
        carriedFrom: {
          itemId: recitation.id,
          sessionId: id.u1,
          sessionDate: addDays(TODAY, 2),
          status: 'NOT_COMPLETED',
        },
      });
      const source = await programOf('sup', id.p1);
      expect(source.items[1]).toMatchObject({
        status: 'NOT_COMPLETED',
        version: recitation.version,
      });
      expect(source.items[1].carriedTo.map((c) => c.sessionId)).toEqual([
        id.u3,
      ]);
    });

    it('a second item into the same session reuses its program; PARTIAL and CANCELLED carry too', async () => {
      let p = await programOf('sup', id.p1);
      p = (await evaluate('sup', p, p.items[2].id, 'CANCELLED').expect(200))
        .body;
      const postponed = (
        await api
          .post('sup', `work-items/${p.items[3].id}/transfer`, {
            targetSessionId: id.u3,
          })
          .expect(201)
      ).body as Program;
      expect(postponed.id).toBe(id.p3);
      const cancelled = (
        await api
          .post('sup', `work-items/${p.items[2].id}/transfer`, {
            targetSessionId: id.u3,
          })
          .expect(201)
      ).body as Program;
      expect(cancelled.items.map((i) => i.carriedFrom?.status)).toEqual([
        'NOT_COMPLETED',
        'POSTPONED',
        'CANCELLED',
      ]);
      // The cancelled source stays in its program, still «ملغى»
      expect((await programOf('sup', id.p1)).items[2].status).toBe('CANCELLED');
      // PARTIAL
      p = (await evaluate('sup', p, p.items[4].id, 'PARTIAL').expect(200)).body;
      await api
        .post('sup', `work-items/${p.items[4].id}/transfer`, {
          targetSessionId: id.u4,
        })
        .expect(201);
    });

    it('the transfer-time status is kept even if the source is re-evaluated later', async () => {
      let p = await programOf('sup', id.p1);
      p = (await evaluate('sup', p, p.items[3].id, 'COMPLETED').expect(200))
        .body;
      const target = await programOf('sup', id.p3);
      expect(target.items[1].carriedFrom!.status).toBe('POSTPONED');
    });

    it('no duplicate: again, or twice at once, into the same session', async () => {
      const p = await programOf('sup', id.p1);
      expect(
        (
          await api
            .post('sup', `work-items/${p.items[1].id}/transfer`, {
              targetSessionId: id.u3,
            })
            .expect(409)
        ).body.code,
      ).toBe('WORK_ITEM_ALREADY_TRANSFERRED');
      const both = await Promise.all([
        api.post('sup', `work-items/${p.items[1].id}/transfer`, {
          targetSessionId: id.u4,
        }),
        api.post('asst', `work-items/${p.items[1].id}/transfer`, {
          targetSessionId: id.u4,
        }),
      ]);
      expect(both.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);
      expect(
        await prisma.workItem.count({
          where: { carriedFromItemId: p.items[1].id },
        }),
      ).toBe(2);
    });

    it('target rules: later, scheduled, upcoming, the same student’s class, authorized', async () => {
      const later = await programOf('sup', id.p3);
      const back = later.items[0];
      await evaluate('sup', later, back.id, 'POSTPONED').expect(200);
      expect(
        (
          await api
            .post('sup', `work-items/${back.id}/transfer`, {
              targetSessionId: id.u1,
            })
            .expect(400)
        ).body.code,
      ).toBe('WORK_TARGET_SESSION_NOT_LATER');
      expect(
        (
          await api
            .post('sup', `work-items/${back.id}/transfer`, {
              targetSessionId: id.cancelled,
            })
            .expect(409)
        ).body.code,
      ).toBe('WORK_SESSION_CANCELLED');
      // The admin may act on class X, but the student is not in that session
      expect(
        (
          await api
            .post('admin', `work-items/${back.id}/transfer`, {
              targetSessionId: id.x1,
            })
            .expect(400)
        ).body.code,
      ).toBe('WORK_STUDENT_NOT_IN_SESSION');
      // A teacher not on the target's team is refused
      await api
        .post('sup', `work-items/${back.id}/transfer`, {
          targetSessionId: id.x1,
        })
        .expect(403);
      // Nor on the source's
      await api
        .post('other', `work-items/${back.id}/transfer`, {
          targetSessionId: id.x1,
        })
        .expect(403);
      await api
        .post('sup', `work-items/${back.id}/transfer`, {
          targetSessionId: randomUUID(),
        })
        .expect(404);
    });
  });

  // ───────────────────────── next recitation ─────────────────────────

  describe('next recitation «إضافة العرضة التالية»', () => {
    it('number + 1, next ordinal in the text, linked; the previous one untouched; no duplicate', async () => {
      const p = await programOf('sup', id.p1);
      const second = p.items[1]; // العرضة الثانية من سورة التوبة, NOT_COMPLETED
      const target = (
        await api
          .post('asst', `work-items/${second.id}/next-recitation`, {
            targetSessionId: id.u2,
          })
          .expect(201)
      ).body as Program;
      const next = target.items.find(
        (i) => i.continuedFrom?.itemId === second.id,
      )!;
      expect(next).toMatchObject({
        type: 'RECITATION',
        recitationNumber: 3,
        description: 'العرضة الثالثة من سورة التوبة',
        status: 'NOT_EVALUATED',
        carriedFrom: null,
      });
      expect((await programOf('sup', id.p1)).items[1]).toMatchObject({
        status: 'NOT_COMPLETED',
        recitationNumber: 2,
      });
      expect(
        (
          await api
            .post('sup', `work-items/${second.id}/next-recitation`, {
              targetSessionId: id.u2,
            })
            .expect(409)
        ).body.code,
      ).toBe('WORK_RECITATION_ALREADY_PLANNED');
    });

    it('no maximum; the teacher may word it; non-recitations and unnumbered ones are refused', async () => {
      const p = await programOf('sup', id.p1);
      const high = (
        await api
          .patch('sup', `work-programs/${id.p1}`, {
            newItems: [
              {
                type: 'RECITATION',
                description: 'العرضة الثانية عشرة من سورة يس',
                recitationNumber: 12,
              },
            ],
          })
          .expect(200)
      ).body as Program;
      const twelfth = high.items.at(-1)!;
      const t = (
        await api
          .post('sup', `work-items/${twelfth.id}/next-recitation`, {
            targetSessionId: id.u4,
            description: 'العرضة 13 من سورة يس',
          })
          .expect(201)
      ).body as Program;
      expect(
        t.items.find((i) => i.continuedFrom?.itemId === twelfth.id),
      ).toMatchObject({
        recitationNumber: 13,
        description: 'العرضة 13 من سورة يس',
      });
      expect(
        (
          await api
            .post('sup', `work-items/${p.items[0].id}/next-recitation`, {
              targetSessionId: id.u4,
            })
            .expect(400)
        ).body.code,
      ).toBe('WORK_ITEM_NOT_RECITATION');
      const unnumbered = (
        await api
          .patch('sup', `work-programs/${id.p1}`, {
            newItems: [{ type: 'RECITATION', description: 'عرضة سورة ق' }],
          })
          .expect(200)
      ).body.items.at(-1);
      expect(
        (
          await api
            .post('sup', `work-items/${unnumbered.id}/next-recitation`, {
              targetSessionId: id.u4,
            })
            .expect(400)
        ).body.code,
      ).toBe('WORK_RECITATION_NUMBER_REQUIRED');
      // A past session cannot receive new work
      expect(
        (
          await api
            .post('sup', `work-items/${twelfth.id}/next-recitation`, {
              targetSessionId: id.past,
            })
            .expect(409)
        ).body.code,
      ).toBe('WORK_SESSION_NOT_UPCOMING');
    });
  });

  // ───────────────────────── listing ─────────────────────────

  describe('listing and filters', () => {
    it('a teacher sees only programs of sessions they teach; the admin sees all', async () => {
      const mine = (
        await api.get('sup', 'work-programs', { pageSize: 100 }).expect(200)
      ).body;
      expect(mine.data.length).toBeGreaterThanOrEqual(4);
      expect(
        (await api.get('other', 'work-programs', { pageSize: 100 }).expect(200))
          .body.meta.total,
      ).toBe(0);
      const all = (
        await api
          .get('admin', 'work-programs', { groupClassId: id.C, pageSize: 100 })
          .expect(200)
      ).body;
      expect(all.meta.total).toBe(mine.meta.total);
    });

    it('filters: student search, student, session, period, state; sessions of the session filter', async () => {
      const q = (
        await api
          .get('sup', 'work-programs', { q: 's2', pageSize: 100 })
          .expect(200)
      ).body.data;
      expect(
        q.every(
          (p: Program & { student: { id: string } }) => p.student.id === id.s2,
        ),
      ).toBe(true);
      expect(q.length).toBe(2);
      expect(
        (
          await api
            .get('sup', 'work-programs', { sessionId: id.u1 })
            .expect(200)
        ).body.meta.total,
      ).toBe(2);
      expect(
        (await api.get('sup', 'work-programs', { period: 'past' }).expect(200))
          .body.meta.total,
      ).toBe(0);
      const cancelled = (
        await api
          .get('sup', 'work-programs', { state: 'cancelled' })
          .expect(200)
      ).body.data;
      expect(cancelled.map((p: Program) => p.id)).toEqual([id.p1]);
      const pending = (
        await api
          .get('sup', 'work-programs', { state: 'pending', pageSize: 100 })
          .expect(200)
      ).body.data;
      expect(
        pending.every((p: Program) =>
          p.items.some((i) => i.status === 'NOT_EVALUATED'),
        ),
      ).toBe(true);
      await api.get('sup', 'work-programs', { state: 'bogus' }).expect(400);
      const options = (
        await api.get('sup', 'work-programs/session-options').expect(200)
      ).body.map((s: { id: string }) => s.id);
      expect(options).toEqual(
        expect.arrayContaining([id.u1, id.u2, id.u3, id.u4]),
      );
    });
  });

  // ───────────────────────── history ─────────────────────────

  describe('history and integrity', () => {
    it('a cancelled session keeps its work (results still editable), but receives no new item', async () => {
      await admin
        .patch(`sessions/${id.u4}/status`, { status: 'CANCELLED' })
        .expect(200);
      const list = (
        await api.get('sup', 'work-programs', { sessionId: id.u4 }).expect(200)
      ).body.data as Program[];
      expect(list.length).toBe(1);
      const p = list[0];
      expect(p.session.status).toBe('CANCELLED');
      expect(p.items.length).toBeGreaterThan(0);
      await evaluate('sup', p, p.items[0].id, 'CANCELLED').expect(200);
      expect(
        (
          await api
            .patch('sup', `work-programs/${p.id}`, {
              newItems: [{ type: 'EXAM', description: 'x' }],
            })
            .expect(409)
        ).body.code,
      ).toBe('WORK_SESSION_CANCELLED');
      await admin
        .patch(`sessions/${id.u4}/status`, { status: 'SCHEDULED' })
        .expect(200);
    });

    it('a past session keeps the team that taught it: a later teacher has no access, the former one keeps it', async () => {
      // History: a program on a past session (planned when it was upcoming)
      const past = await prisma.workProgram.create({
        data: {
          studentId: id.s1,
          sessionId: id.past,
          items: {
            create: [
              {
                position: 0,
                type: 'REVISION',
                description: 'مراجعة سورة مريم',
              },
            ],
          },
        },
      });
      id.pastProgram = past.id;
      await admin
        .patch(`group-classes/${id.C}`, {
          supervisorId: id.sup,
          assistantTeacherIds: [id.newcomer],
        })
        .expect(200);
      // The former assistant still evaluates the session they taught…
      const p = await programOf('asst', past.id);
      await evaluate('asst', p, p.items[0].id, 'COMPLETED').expect(200);
      expect(p.session.date).toBe(addDays(TODAY, -2));
      // …the newcomer cannot see it, but now works on the upcoming sessions
      await api.get('newcomer', `work-programs/${past.id}`).expect(403);
      await programOf('newcomer', id.p1);
      await api.get('asst', `work-programs/${id.p1}`).expect(403);
    });

    it('moving a weekly slot keeps (cancels) a planned lesson instead of deleting it; deleting the slot keeps the work', async () => {
      const day = addDays(TODAY, 9);
      const slot = (
        await admin
          .post(`group-classes/${id.C}/schedules`, {
            dayOfWeek: weekdayOf(day),
            startTime: '19:00',
            endTime: '20:00',
            roomId: id.room,
          })
          .expect(201)
      ).body.id;
      await admin
        .post('sessions/generate', { from: day, to: day, groupClassId: id.C })
        .expect(200);
      const generated = await prisma.session.findFirstOrThrow({
        where: { weeklyScheduleId: slot, date: new Date(`${day}T00:00:00Z`) },
      });
      const planned = (
        await create(
          'sup',
          's1',
          'unused',
          [{ type: 'EXAM', description: 'اختبار' }],
          { sessionId: generated.id },
        ).expect(201)
      ).body as Program;
      await admin
        .patch(`group-classes/${id.C}/schedules/${slot}`, {
          startTime: '19:30',
          endTime: '20:30',
        })
        .expect(200);
      const kept = await prisma.session.findUniqueOrThrow({
        where: { id: generated.id },
      });
      expect(kept).toMatchObject({
        status: 'CANCELLED',
        cancellationReason: 'تغيّر موعد الحصة الأسبوعي',
      });
      expect((await programOf('sup', planned.id)).items).toHaveLength(1);
      // The moved slot still plans its new lesson on that date
      expect(
        await prisma.session.count({
          where: {
            weeklyScheduleId: slot,
            date: new Date(`${day}T00:00:00Z`),
            status: 'SCHEDULED',
          },
        }),
      ).toBe(1);
      // Deleting the slot: the program (and its session, unlinked) remain
      await http()
        .delete(`/api/admin/group-classes/${id.C}/schedules/${slot}`)
        .set(as('admin'))
        .expect(204);
      const after = await programOf('admin', planned.id);
      expect(after.session.id).toBe(generated.id);
      expect(
        (
          await prisma.session.findUniqueOrThrow({
            where: { id: generated.id },
          })
        ).weeklyScheduleId,
      ).toBeNull();
    });
  });

  // ───────────────────────── student space (read-only) ─────────────────────────

  describe('student space: my work programs (read-only)', () => {
    const student = (path = '', query: object = {}) =>
      http()
        .get(`/api/student/work-programs${path}`)
        .query(query)
        .set(as('pupil'));

    it('lists ONLY my programs, with session, teacher, types, descriptions and results', async () => {
      const mine = (await student('', { pageSize: 100 }).expect(200)).body;
      const all = await prisma.workProgram.findMany({
        where: { studentId: id.s1 },
        select: { id: true },
      });
      expect(mine.meta.total).toBe(all.length);
      expect(mine.data.map((p: { id: string }) => p.id).sort()).toEqual(
        all.map((p) => p.id).sort(),
      );
      const p1 = mine.data.find((p: { id: string }) => p.id === id.p1);
      expect(p1.session).toMatchObject({
        id: id.u1,
        date: addDays(TODAY, 2),
        groupName: tag('مجموعة الماهر'),
      });
      expect(p1.teacherName).toBe(`sup ${tag('حساب')}`);
      expect(p1.items[0]).toMatchObject({
        type: 'REVISION',
        status: expect.any(String),
      });
      expect(p1.progress).toMatchObject({ total: p1.items.length });
      // Nothing internal: no versions, editors, links or the teachers' program notes
      expect(p1).not.toHaveProperty('generalNotes');
      expect(p1).not.toHaveProperty('version');
      expect(p1).not.toHaveProperty('lastEditedBy');
      expect(p1.items[0]).not.toHaveProperty('version');
      expect(p1.items[0]).not.toHaveProperty('carriedTo');
      // A carried item says where it came from
      const target = mine.data.find((p: { id: string }) => p.id === id.p3);
      expect(target.items[0].carriedFrom).toEqual({
        sessionDate: addDays(TODAY, 2),
        status: 'NOT_COMPLETED',
      });
    });

    it('an evaluation comment is shown once the item is evaluated, never before', async () => {
      let p = await programOf('sup', id.p1);
      const pending = p.items.find((i) => i.status === 'NOT_EVALUATED')!;
      p = (
        await evaluate('sup', p, pending.id, 'NOT_EVALUATED', {
          evaluationComment: 'ملاحظة قبل التقييم',
        }).expect(200)
      ).body;
      const seen = (await student(`/${id.p1}`).expect(200)).body.items.find(
        (i: { id: string }) => i.id === pending.id,
      );
      expect(seen.evaluationComment).toBeNull();
      await evaluate('sup', p, pending.id, 'PARTIAL', {
        evaluationComment: 'حفظ نصف الصفحة',
      }).expect(200);
      const after = (await student(`/${id.p1}`).expect(200)).body.items.find(
        (i: { id: string }) => i.id === pending.id,
      );
      expect(after).toMatchObject({
        status: 'PARTIAL',
        evaluationComment: 'حفظ نصف الصفحة',
      });
    });

    it('upcoming vs. history', async () => {
      const upcoming = (
        await student('', { period: 'upcoming', pageSize: 100 }).expect(200)
      ).body.data;
      const past = (
        await student('', { period: 'past', pageSize: 100 }).expect(200)
      ).body.data;
      expect(
        upcoming.every(
          (p: { session: { date: string } }) => p.session.date >= TODAY,
        ),
      ).toBe(true);
      expect(past.map((p: { id: string }) => p.id)).toContain(id.pastProgram);
      expect(upcoming.map((p: { id: string }) => p.id)).not.toContain(
        id.pastProgram,
      );
    });

    it('another student’s program is not found; nothing can be written; staff routes are refused', async () => {
      await student(`/${id.p2}`).expect(404); // s2's
      await http()
        .post('/api/student/work-programs')
        .set(as('pupil'))
        .send({})
        .expect(404);
      await http()
        .patch(`/api/student/work-programs/${id.p1}`)
        .set(as('pupil'))
        .send({})
        .expect(404);
      await http()
        .get('/api/teacher/work-programs')
        .set(as('pupil'))
        .expect(403);
      await http()
        .patch(`/api/teacher/work-programs/${id.p1}/evaluation`)
        .set(as('pupil'))
        .send({ items: [] })
        .expect(403);
      // Teachers do not use the student route
      await http().get('/api/student/work-programs').set(as('sup')).expect(403);
    });
  });
});
