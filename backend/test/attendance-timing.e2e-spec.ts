import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { vi } from 'vitest';
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
/** Days well ahead of the real clock: the faked clock is set there. */
const D = addDays(TODAY, 20);
const D1 = addDays(D, 1);
const D2 = addDays(D, 2);
const D3 = addDays(D, 3);
/** The instant of a local Africa/Tunis wall-clock time (UTC+1 all year, no DST). */
const tunis = (date: string, time: string) =>
  new Date(`${date}T${time}:00+01:00`);

/**
 * Attendance is recorded once the lesson has STARTED (its date and start
 * time in Africa/Tunis) — from the start minute itself, and after its end.
 * The clock is faked (Date only) so every boundary is exact; each step logs
 * in again so the access token is valid at the faked time.
 */
describe('Attendance timing: not before the lesson starts (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const id: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const login = async (key: string) =>
    (
      await http()
        .post('/api/auth/login')
        .send({
          username: `e2e-${RUN}-${key}`.toLowerCase(),
          password: PASSWORD,
        })
        .expect(200)
    ).body.accessToken as string;
  /** Sets the platform clock (Date only), then signs `key` in at that time. */
  async function at(instant: Date, key = 'admin') {
    vi.setSystemTime(instant);
    return { Authorization: `Bearer ${await login(key)}` };
  }
  const save = (
    auth: Record<string, string>,
    sessionId: string,
    scope: 'admin' | 'teacher' = 'admin',
  ) =>
    http()
      .put(`/api/${scope}/sessions/${sessionId}/attendance`)
      .set(auth)
      .send({ records: [{ studentId: id.s1, status: 'PRESENT' }] });
  const roster = (auth: Record<string, string>, sessionId: string) =>
    http().get(`/api/admin/sessions/${sessionId}/attendance`).set(auth);

  async function account(key: string, roles: Role[], teacher = false) {
    const person = await prisma.person.create({
      data: {
        firstName: key,
        lastName: tag('حساب'),
        gender: 'MALE',
        dateOfBirth: new Date('2000-01-01'),
        address: 'نابل',
        phone: '22345678',
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
    id[`person:${key}`] = person.id;
    if (teacher) id[`teacher:${key}`] = person.teacher!.id;
  }

  /** A manual lesson of class A (the unchanged manual endpoint: any date). */
  async function lesson(
    auth: Record<string, string>,
    date: string,
    start: string,
    end: string,
  ) {
    return (
      await http()
        .post('/api/admin/sessions')
        .set(auth)
        .send({
          groupClassId: id.A,
          roomId: id.R1,
          date,
          startTime: start,
          endTime: end,
        })
        .expect(201)
    ).body.id as string;
  }

  beforeAll(async () => {
    // Only Date is faked: timers, sockets and the database keep running
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date());
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await account('admin', [Role.ADMIN]);
    await account('sup', [Role.TEACHER], true);
    await account('s1', [Role.STUDENT]);
    const auth = { Authorization: `Bearer ${await login('admin')}` };
    const post = async (path: string, body: object) =>
      (await http().post(`/api/admin/${path}`).set(auth).send(body).expect(201))
        .body.id as string;
    id.B = await post('branches', { name: tag('فرع'), address: 'نابل' });
    id.R1 = await post('rooms', { branchId: id.B, name: tag('قاعة') });
    id.G = await post('groups', { name: tag('مجموعة') });
    id.A = await post('group-classes', {
      groupId: id.G,
      branchId: id.B,
      supervisorId: id['teacher:sup'],
      assistantTeacherIds: [],
    });
    id.s1 = await post('students', {
      personId: id['person:s1'],
      groupClassId: id.A,
      registrationDate: addDays(TODAY, -10),
      guardianPhone: '98765432',
    });
  });

  afterAll(async () => {
    vi.useRealTimers();
    const persons = { lastName: { endsWith: RUN } };
    const students = { person: persons };
    const sessions = { groupClass: { group: { name: { endsWith: RUN } } } };
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
    await prisma.groupClass.deleteMany({
      where: { group: { name: { endsWith: RUN } } },
    });
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

  it('before the start: refused with the start time, roster not editable; exactly at the start: allowed', async () => {
    let auth = await at(tunis(D, '21:35'));
    const s = await lesson(auth, D, '22:30', '23:30');
    const early = await save(auth, s).expect(409);
    expect(early.body.code).toBe('ATTENDANCE_SESSION_FUTURE');
    expect(early.body.message).toContain('يبدأ تسجيل الحضور عند الساعة 22:30');
    expect((await roster(auth, s).expect(200)).body.editable).toBe(false);
    // One minute before
    auth = await at(tunis(D, '22:29'));
    await save(auth, s).expect(409);
    expect(
      await prisma.studentAttendance.count({ where: { sessionId: s } }),
    ).toBe(0);
    // The start minute itself
    auth = await at(tunis(D, '22:30'));
    expect((await roster(auth, s).expect(200)).body.editable).toBe(true);
    await save(auth, s).expect(200);
    expect(
      await prisma.studentAttendance.count({ where: { sessionId: s } }),
    ).toBe(1);
  });

  it('during the lesson and after its end (late recording) are allowed', async () => {
    let auth = await at(tunis(D, '08:00'));
    const during = await lesson(auth, D, '09:00', '10:00');
    const after = await lesson(auth, D, '11:00', '12:00');
    auth = await at(tunis(D, '09:20'));
    await save(auth, during).expect(200);
    auth = await at(tunis(D, '15:00'));
    await save(auth, after).expect(200);
    // A later day too
    const nextDay = await at(tunis(D1, '10:00'));
    const late = await lesson(nextDay, D, '13:00', '14:00');
    await save(nextDay, late).expect(200);
  });

  it('late at night and across midnight: the date AND time decide', async () => {
    let auth = await at(tunis(D2, '22:00'));
    const lateNight = await lesson(auth, D2, '23:45', '23:59');
    const afterMidnight = await lesson(auth, D3, '00:10', '01:00');
    auth = await at(tunis(D2, '23:44'));
    await save(auth, lateNight).expect(409);
    auth = await at(tunis(D2, '23:50'));
    await save(auth, lateNight).expect(200);
    // 23:59 the day before is earlier than 00:10 the next day
    auth = await at(tunis(D2, '23:59'));
    await save(auth, afterMidnight).expect(409);
    auth = await at(tunis(D3, '00:10'));
    await save(auth, afterMidnight).expect(200);
  });

  it('Africa/Tunis, not UTC: at 23:20 UTC it is already 00:20 the next day in Tunis', async () => {
    let auth = await at(tunis(D, '20:00'));
    const s = await lesson(auth, D1, '00:15', '01:00');
    // 23:10 UTC = 00:10 Tunis (D1): not started yet
    auth = await at(new Date(`${D}T23:10:00Z`));
    await save(auth, s).expect(409);
    // 23:20 UTC (still D in UTC) = 00:20 Tunis (D1): started
    auth = await at(new Date(`${D}T23:20:00Z`));
    await save(auth, s).expect(200);
  });

  it('the teacher endpoint follows the same rule', async () => {
    let auth = await at(tunis(D1, '16:00'));
    const s = await lesson(auth, D1, '17:00', '18:00');
    let teacher = await at(tunis(D1, '16:59'), 'sup');
    const early = await save(teacher, s, 'teacher').expect(409);
    expect(early.body.code).toBe('ATTENDANCE_SESSION_FUTURE');
    teacher = await at(tunis(D1, '17:00'), 'sup');
    await save(teacher, s, 'teacher').expect(200);
    // A correction within the window keeps working after the start
    teacher = await at(tunis(D1, '18:30'), 'sup');
    await http()
      .put(`/api/teacher/sessions/${s}/attendance`)
      .set(teacher)
      .send({ records: [{ studentId: id.s1, status: 'LATE' }] })
      .expect(200);
    auth = await at(tunis(D1, '18:31'));
    expect(
      (await roster(auth, s).expect(200)).body.students.find(
        (x: { studentId: string }) => x.studentId === id.s1,
      ).status,
    ).toBe('LATE');
  });

  it('a cancelled lesson refuses attendance, before and after its start', async () => {
    let auth = await at(tunis(D1, '08:00'));
    const s = await lesson(auth, D1, '09:00', '10:00');
    await http()
      .patch(`/api/admin/sessions/${s}/status`)
      .set(auth)
      .send({ status: 'CANCELLED' })
      .expect(200);
    expect((await save(auth, s).expect(409)).body.code).toBe(
      'ATTENDANCE_SESSION_CANCELLED',
    );
    auth = await at(tunis(D1, '11:00'));
    expect((await save(auth, s).expect(409)).body.code).toBe(
      'ATTENDANCE_SESSION_CANCELLED',
    );
  });
});
