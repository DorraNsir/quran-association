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
const TODAY = todayIn('Africa/Tunis');
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dbDate = (d: string) => new Date(`${d}T00:00:00.000Z`);

// Fixed past dates (all before today): the joining dates and the lessons
const SEP_1 = '2026-09-01';
const SEP_15 = '2026-09-15';
const OCT_1 = '2026-10-01';

/**
 * «تاريخ الالتحاق» (Teacher.joinedAt): set at creation, never changed after.
 * A teacher newly assigned as ASSISTANT joins the team of the class's
 * sessions from that date on (past ones included, hosted or shared),
 * additively: attendance, supervisors and statuses are untouched, the teacher
 * starts «not recorded». Cancelled sessions and lessons clashing with the
 * teacher's own are skipped.
 */
describe('Teacher joining date and the past sessions of a new assistant (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const id: Record<string, string> = {};
  const token: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const as = (who = 'admin') => ({ Authorization: `Bearer ${token[who]}` });
  const get = (path: string) => http().get(`/api/admin/${path}`).set(as());
  const post = (path: string, body: object) =>
    http().post(`/api/admin/${path}`).set(as()).send(body);
  const patch = (path: string, body: object) =>
    http().patch(`/api/admin/${path}`).set(as()).send(body);
  const put = (path: string, body: object) =>
    http().put(`/api/admin/${path}`).set(as()).send(body);

  /** An account; a teacher profile with its joining date when asked. */
  async function account(key: string, roles: Role[], joinedAt?: string) {
    const person = await prisma.person.create({
      data: {
        firstName: key,
        lastName: tag('حساب'),
        gender: 'MALE',
        dateOfBirth: new Date('2000-01-01'),
        address: 'نابل',
        phone: '22345678',
        ...(joinedAt
          ? { teacher: { create: { joinedAt: dbDate(joinedAt) } } }
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
    id[`person:${key}`] = person.id;
    if (joinedAt) id[key] = person.teacher!.id;
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
  /** A lesson through the manual endpoint (past dates allowed). */
  const lesson = async (
    classKey: string,
    date: string,
    start: string,
    end: string,
    extra: object = {},
  ) =>
    (
      await post('sessions', {
        groupClassId: id[classKey],
        roomId: id[classKey === 'O' ? 'R2' : 'R1'],
        date,
        startTime: start,
        endTime: end,
        ...extra,
      }).expect(201)
    ).body.id as string;
  const teamOf = async (sessionId: string) =>
    (
      await prisma.sessionTeacher.findMany({
        where: { sessionId },
        select: { teacherId: true, role: true },
      })
    )
      .map((t) => `${t.teacherId}:${t.role}`)
      .sort();
  const assistant = (key: string) => `${id[key]}:ASSISTANT`;
  /** PATCH /admin/group-classes/:id — the assistant list. */
  const setAssistants = (classKey: string, teacherKeys: string[]) =>
    patch(`group-classes/${id[classKey]}`, {
      assistantTeacherIds: teacherKeys.map((k) => id[k]),
    }).expect(200);
  /** «حفظ القسم» — PUT /admin/group-classes/:id/save, the class form's path. */
  async function saveForm(classKey: string, teacherKeys: string[]) {
    const c = (await get(`group-classes/${id[classKey]}`).expect(200)).body;
    return put(`group-classes/${id[classKey]}/save`, {
      version: c.version,
      branchId: c.branch.id,
      status: c.status,
      supervisorId: c.supervisor.id,
      assistantTeacherIds: teacherKeys.map((k) => id[k]),
      slots: [],
    }).expect(200);
  }
  const statusesOf = (classKey: string) =>
    prisma.session.findMany({
      where: { groupClassId: id[classKey] },
      select: {
        id: true,
        status: true,
        completedAt: true,
        completionSource: true,
      },
      orderBy: { id: 'asc' },
    });
  const studentRecordsOf = (classKey: string) =>
    prisma.studentAttendance.findMany({
      where: { session: { groupClassId: id[classKey] } },
      orderBy: { id: 'asc' },
    });
  const teacherRecordsOf = (classKey: string) =>
    prisma.teacherAttendance.findMany({
      where: { session: { groupClassId: id[classKey] } },
      orderBy: { id: 'asc' },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await account('admin', [Role.ADMIN]);
    await account('sup', [Role.TEACHER], '2024-09-01');
    await account('existing', [Role.TEACHER], '2024-09-01');
    // The joining dates under test
    await account('sep1', [Role.TEACHER], SEP_1);
    await account('sep15', [Role.TEACHER], SEP_15);
    await account('oct1', [Role.TEACHER], OCT_1);
    await account('pupil', [Role.STUDENT]);

    id.B = (
      await post('branches', { name: tag('فرع'), address: 'نابل' }).expect(201)
    ).body.id;
    for (const r of ['R1', 'R2'])
      id[r] = (
        await post('rooms', { branchId: id.B, name: tag(r) }).expect(201)
      ).body.id;
    id.G = (await post('groups', { name: tag('مجموعة') }).expect(201)).body.id;
    const make = async (key: string, sup: string, assistants: string[] = []) =>
      (id[key] = (
        await post('group-classes', {
          groupId: id.G,
          branchId: id.B,
          supervisorId: id[sup],
          assistantTeacherIds: assistants.map((a) => id[a]),
        }).expect(201)
      ).body.id);
    // A: the class under test (an assistant already there); P shares a lesson
    // with A (same supervisor); O is supervised by «sep1» (its lesson clashes)
    await make('A', 'sup', ['existing']);
    await make('P', 'sup');
    await make('O', 'sep1');
    id.s1 = (
      await post('students', {
        personId: id['person:pupil'],
        groupClassId: id.A,
        registrationDate: '2026-08-01',
        guardianPhone: '98765432',
      }).expect(201)
    ).body.id;

    // A's sessions — before both joining dates, between them, after them
    id.aug25 = await lesson('A', '2026-08-25', '10:00', '11:00', {
      status: 'COMPLETED',
    });
    id.sep5 = await lesson('A', '2026-09-05', '10:00', '11:00', {
      status: 'COMPLETED',
    });
    id.sep20 = await lesson('A', '2026-09-20', '10:00', '11:00', {
      status: 'COMPLETED',
    });
    id.shared = await lesson('A', '2026-10-01', '14:00', '15:00', {
      additionalGroupClassIds: [id.P],
    });
    // «sep1» teaches O at the same time as A's lesson of October 5: a clash
    id.clash = await lesson('A', '2026-10-05', '17:00', '18:00');
    await lesson('O', '2026-10-05', '17:30', '18:30');
    id.oct10 = await lesson('A', '2026-10-10', '10:00', '11:00');
    id.cancelled = await lesson('A', '2026-10-12', '10:00', '11:00');
    await patch(`sessions/${id.cancelled}/status`, {
      status: 'CANCELLED',
    }).expect(200);
    // Attendance already recorded (a student absent, the supervisor present)
    id.nov1 = await lesson('A', '2026-11-01', '10:00', '11:00');
    await put(`sessions/${id.nov1}/attendance`, {
      records: [{ studentId: id.s1, status: 'ABSENT' }],
      teachers: [{ teacherId: id.sup, status: 'PRESENT' }],
    }).expect(200);
    id.upcoming = await lesson('A', addDays(TODAY, 3), '10:00', '11:00');
  });

  afterAll(async () => {
    const persons = { lastName: { endsWith: RUN } };
    const students = { person: persons };
    const classes = { group: { name: { endsWith: RUN } } };
    const sessions = { groupClass: classes };
    await prisma.notification.deleteMany({
      where: { user: { person: persons } },
    });
    await prisma.attendanceChange.deleteMany({ where: { session: sessions } });
    await prisma.studentAttendance.deleteMany({ where: { session: sessions } });
    await prisma.teacherAttendance.deleteMany({ where: { session: sessions } });
    await prisma.paymentObligation.deleteMany({ where: { student: students } });
    await prisma.studentEnrollment.deleteMany({ where: { student: students } });
    await prisma.studentStatusChange.deleteMany({
      where: { student: students },
    });
    await prisma.student.deleteMany({ where: students });
    await prisma.session.deleteMany({ where: sessions });
    await prisma.groupClassAssistant.deleteMany({
      where: { groupClass: classes },
    });
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

  /* ─────────────────────── 1. the date is set at creation only ─────────────────────── */

  describe('«تاريخ الالتحاق» is set at creation only', () => {
    it('is required at creation', async () => {
      await post('teachers', {
        person: {
          firstName: 'بلا',
          lastName: tag('تاريخ'),
          gender: 'MALE',
          phone: '22345670',
        },
      }).expect(400);
    });

    it('a different value is refused (the whole request), the same value and the other fields still save', async () => {
      const created = (
        await post('teachers', {
          person: {
            firstName: 'سامي',
            lastName: tag('حساب'),
            gender: 'MALE',
            phone: '22345671',
          },
          joinedAt: SEP_1,
        }).expect(201)
      ).body;
      expect(created.joinedAt).toBe(SEP_1);

      const refused = await patch(`teachers/${created.id}`, {
        joinedAt: '2026-10-01',
      }).expect(409);
      expect(refused.body.code).toBe('TEACHER_JOINED_AT_LOCKED');
      expect(refused.body.message).toContain(
        'لا يمكن تعديل تاريخ الالتحاق بعد إنشاء ملف المعلم',
      );
      // Refused as a whole: nothing else of that request is saved either
      await patch(`teachers/${created.id}`, {
        joinedAt: '2025-01-01',
        qualification: 'إجازة',
        person: { firstName: 'اسم مرفوض' },
      }).expect(409);
      expect(
        (await get(`teachers/${created.id}`).expect(200)).body,
      ).toMatchObject({
        joinedAt: SEP_1,
        qualification: null,
        person: { firstName: 'سامي' },
      });

      // The same value (a form resending it) is accepted with other changes
      await patch(`teachers/${created.id}`, {
        joinedAt: SEP_1,
        qualification: 'إجازة في رواية حفص',
      }).expect(200);
      // No value at all: the other profile fields are editable
      const after = (
        await patch(`teachers/${created.id}`, {
          person: { firstName: 'سامي الجديد', phone: '22345672' },
        }).expect(200)
      ).body;
      expect(after).toMatchObject({
        joinedAt: SEP_1,
        qualification: 'إجازة في رواية حفص',
        person: { firstName: 'سامي الجديد', phone: '22345672' },
      });
      // Status changes are another endpoint, which never touches the date
      await patch(`teachers/${created.id}/status`, {
        status: 'INACTIVE',
      }).expect(200);
      expect(
        (await prisma.teacher.findUniqueOrThrow({ where: { id: created.id } }))
          .joinedAt,
      ).toEqual(dbDate(SEP_1));
    });
  });

  /* ─────────────── 2–6. a new assistant joins the sessions from that date ─────────────── */

  describe('a new assistant joins the class’s sessions from their joining date', () => {
    it('joinedAt = September 1: eligible sessions from September 1 on — completed and shared included; cancelled and clashing skipped; nothing else changed', async () => {
      const before = {
        statuses: await statusesOf('A'),
        students: await studentRecordsOf('A'),
        teachers: await teacherRecordsOf('A'),
        teams: Object.fromEntries(
          await Promise.all(
            ['sep5', 'sep20', 'shared', 'oct10', 'nov1'].map(
              async (k) => [k, await teamOf(id[k])] as const,
            ),
          ),
        ),
      };
      await setAssistants('A', ['existing', 'sep1']);

      // From September 1 on: completed, shared, scheduled, with attendance
      for (const k of ['sep5', 'sep20', 'shared', 'oct10', 'nov1'])
        expect(await teamOf(id[k])).toEqual(
          [...before.teams[k], assistant('sep1')].sort(),
        );
      // Never: before the joining date, a cancelled session, a clash with
      // the teacher's own lesson at the same time
      for (const k of ['aug25', 'cancelled', 'clash'])
        expect(await teamOf(id[k])).not.toContain(assistant('sep1'));
      // The clashing lesson of O keeps «sep1» there only
      expect(
        await prisma.sessionTeacher.count({
          where: {
            teacherId: id.sep1,
            session: { date: dbDate('2026-10-05') },
          },
        }),
      ).toBe(1);
      // Upcoming: the existing upcoming sync, as before
      expect(await teamOf(id.upcoming)).toContain(assistant('sep1'));

      // Supervisors and the rest of every team stay (additive only)
      for (const k of ['aug25', 'sep5', 'sep20', 'shared', 'oct10', 'nov1'])
        expect(await teamOf(id[k])).toContain(`${id.sup}:SUPERVISOR`);
      expect(
        await prisma.sessionTeacher.count({
          where: {
            session: { groupClassId: id.A },
            role: 'SUPERVISOR',
            teacherId: { not: id.sup },
          },
        }),
      ).toBe(0);
      // Statuses, completion and every attendance record are unchanged
      expect(await statusesOf('A')).toEqual(before.statuses);
      expect(await studentRecordsOf('A')).toEqual(before.students);
      expect(await teacherRecordsOf('A')).toEqual(before.teachers);
    });

    it('joinedAt = September 15: not added to earlier sessions', async () => {
      await setAssistants('A', ['existing', 'sep1', 'sep15']);
      for (const k of ['aug25', 'sep5', 'cancelled'])
        expect(await teamOf(id[k])).not.toContain(assistant('sep15'));
      // From September 15 on (no clash for this teacher on October 5)
      for (const k of ['sep20', 'shared', 'clash', 'oct10', 'nov1', 'upcoming'])
        expect(await teamOf(id[k])).toContain(assistant('sep15'));
    });

    it('the class form’s «حفظ القسم» applies the same rule (joinedAt = October 1)', async () => {
      await saveForm('A', ['existing', 'sep1', 'sep15', 'oct1']);
      for (const k of ['sep5', 'sep20'])
        expect(await teamOf(id[k])).not.toContain(assistant('oct1'));
      for (const k of ['shared', 'clash', 'oct10', 'nov1', 'upcoming'])
        expect(await teamOf(id[k])).toContain(assistant('oct1'));
    });

    it('a shared lesson keeps both classes and its supervisor; the other class is not touched', async () => {
      expect(
        (
          await prisma.sessionClass.findMany({
            where: { sessionId: id.shared },
          })
        ).map((c) => c.groupClassId),
      ).toEqual([id.P]);
      expect(await teamOf(id.shared)).toContain(`${id.sup}:SUPERVISOR`);
      expect(
        await prisma.groupClassAssistant.count({
          where: { groupClassId: id.P },
        }),
      ).toBe(0);
    });
  });

  /* ─────────────── 7. «not recorded», and accurate statistics ─────────────── */

  describe('historical teacher attendance starts unrecorded', () => {
    it('listed on the past sheets as «not recorded»; its statistics count nothing until something is recorded', async () => {
      const sheet = (await get(`sessions/${id.sep20}/attendance`).expect(200))
        .body;
      expect(
        sheet.teachers.find(
          (t: { teacherId: string }) => t.teacherId === id.sep1,
        ),
      ).toMatchObject({ role: 'ASSISTANT', recorded: false, status: null });
      // The supervisor's own record of November 1 is still there, unchanged
      const nov1 = (await get(`sessions/${id.nov1}/attendance`).expect(200))
        .body;
      expect(
        nov1.teachers.find(
          (t: { teacherId: string }) => t.teacherId === id.sup,
        ),
      ).toMatchObject({ recorded: true, status: 'PRESENT' });
      expect(
        nov1.teachers.find(
          (t: { teacherId: string }) => t.teacherId === id.sep1,
        ),
      ).toMatchObject({ recorded: false, status: null });
      // Missing is neither presence nor absence
      expect(
        (await get(`teachers/${id.sep1}/attendance/summary`).expect(200)).body,
      ).toMatchObject({ recorded: 0, present: 0, absent: 0, rate: null });
      // Recording is now possible (it was refused as «not in the team»)
      await put(`sessions/${id.sep20}/attendance`, {
        teachers: [{ teacherId: id.sep1, status: 'PRESENT' }],
      }).expect(200);
      await put(`sessions/${id.oct10}/attendance`, {
        teachers: [{ teacherId: id.sep1, status: 'ABSENT' }],
      }).expect(200);
      expect(
        (await get(`teachers/${id.sep1}/attendance/summary`).expect(200)).body,
      ).toMatchObject({ recorded: 2, present: 1, absent: 1, rate: 50 });
      // A session before the joining date still refuses this teacher
      expect(
        (
          await put(`sessions/${id.aug25}/attendance`, {
            teachers: [{ teacherId: id.sep1, status: 'PRESENT' }],
          }).expect(400)
        ).body.code,
      ).toBe('ATTENDANCE_TEACHER_NOT_IN_SESSION');
    });
  });

  /* ─────────────── 8. authorization follows the existing rules ─────────────── */

  describe('teacher access', () => {
    it('the teacher reaches the sessions they were added to — not those before their joining date, nor the skipped ones', async () => {
      await http()
        .get(`/api/teacher/sessions/${id.sep5}`)
        .set(as('sep1'))
        .expect(200);
      await http()
        .get(`/api/teacher/sessions/${id.sep5}/attendance`)
        .set(as('sep1'))
        .expect(200);
      for (const k of ['aug25', 'cancelled'])
        await http()
          .get(`/api/teacher/sessions/${id[k]}`)
          .set(as('sep1'))
          .expect(403);
      // «sep15» never reaches September 5
      await http()
        .get(`/api/teacher/sessions/${id.sep5}`)
        .set(as('sep15'))
        .expect(403);
    });

    it('the admin endpoints stay admin-only; the teacher list shows the session in «my sessions»', async () => {
      await http()
        .patch(`/api/admin/group-classes/${id.A}`)
        .set(as('sep1'))
        .send({ assistantTeacherIds: [id.sep1] })
        .expect(403);
      const mine = await http()
        .get('/api/teacher/sessions')
        .query({ from: '2026-08-20', to: '2026-09-30', pageSize: 100 })
        .set(as('sep1'))
        .expect(200);
      const ids = mine.body.data.map((s: { id: string }) => s.id);
      expect(ids).toEqual(expect.arrayContaining([id.sep5, id.sep20]));
      expect(ids).not.toContain(id.aug25);
    });
  });

  /* ─────────────── 9. no duplicates, no recalculation ─────────────── */

  describe('repeated saves and profile edits', () => {
    it('saving the class again (both paths) and editing teacher profiles never duplicate or recalculate assignments', async () => {
      const rows = () =>
        prisma.sessionTeacher.findMany({
          where: {
            session: { groupClass: { group: { name: { endsWith: RUN } } } },
          },
          select: { sessionId: true, teacherId: true, role: true },
          orderBy: [{ sessionId: 'asc' }, { teacherId: 'asc' }],
        });
      const before = await rows();
      const team = ['existing', 'sep1', 'sep15', 'oct1'];
      await setAssistants('A', team);
      await saveForm('A', team);
      await saveForm('A', team);
      await patch(`teachers/${id.sep1}`, { qualification: 'إجازة' }).expect(
        200,
      );
      await patch(`teachers/${id.sep15}`, {
        person: { firstName: 'sep15-new' },
      }).expect(200);
      expect(await rows()).toEqual(before);
      // One row per teacher and session, never two
      const keys = before.map((r) => `${r.sessionId}|${r.teacherId}`);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('an assistant who is not new (already assigned) is never re-applied to history', async () => {
      // «existing» was assigned before any of these sessions existed: its
      // past teams are as they were planned (it is in them from creation)
      expect(await teamOf(id.aug25)).toContain(assistant('existing'));
      const n = await prisma.sessionTeacher.count({
        where: { teacherId: id.existing },
      });
      await setAssistants('A', ['existing', 'sep1', 'sep15', 'oct1']);
      expect(
        await prisma.sessionTeacher.count({
          where: { teacherId: id.existing },
        }),
      ).toBe(n);
    });
  });
});
