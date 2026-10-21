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
import { onlyId } from './cleanup-ids.js';

const RUN = randomUUID().slice(0, 8);
const PASSWORD = 'initial-pass-123';
const tag = (s: string) => `${s} ${RUN}`;
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const TODAY = todayIn('Africa/Tunis');
const dbDate = (d: string) => new Date(`${d}T00:00:00Z`);

type Obligation = {
  id: string;
  expectedAmount: string;
  requiredAmount: string;
  totalPaid: string;
  creditIn: string;
  creditOut: string;
  settledAmount: string;
  remainingAmount: string;
  excessAmount: string;
  status: string;
  closed: { toGroup: { id: string }; creditAmount: string } | null;
  voided: { reason: string } | null;
  replacesObligationId: string | null;
};
type Plan = {
  sameGroup: boolean;
  transfers: {
    from: { obligationId: string; settledAmount: string };
    to: { requiredAmount: string | null };
    creditAmount: string;
    excessAmount: string;
    remainingAfter: string | null;
    blocked: string | null;
  }[];
};

/**
 * «تعديل المعلوم» repricing and «نقل مالي» transfers between groups:
 * one yearly total per student, free partial payments, never-paid
 * obligations repriced (confirmed), every other one protected; a student
 * moving to another group has the old obligation released and closed and
 * its settled amount carried as credit — cash is never moved or counted twice.
 */
describe('Fee repricing & financial transfers (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token = '';
  const id: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const as = () => ({ Authorization: `Bearer ${token}` });
  const admin = {
    get: (path: string, query: object = {}) =>
      http().get(`/api/admin/${path}`).query(query).set(as()),
    post: (path: string, body: object = {}) =>
      http().post(`/api/admin/${path}`).set(as()).send(body),
    put: (path: string, body: object) =>
      http().put(`/api/admin/${path}`).set(as()).send(body),
    patch: (path: string, body: object) =>
      http().patch(`/api/admin/${path}`).set(as()).send(body),
  };

  const yearly = (amount: string, label = 'معلوم السنة') => ({
    academicYearId: id.year,
    label,
    amount,
  });
  const repricePreview = async (
    groupKey: string,
    amount: string,
    yearId = id.year,
  ) =>
    (
      await admin
        .get(`groups/${id[groupKey]}/fees/reprice-preview`, {
          academicYearId: yearId,
          amount,
        })
        .expect(200)
    ).body as {
      toUpdate: { obligationId: string; student: { id: string } }[];
      protected: {
        obligationId: string;
        student: { id: string };
        reasons: string[];
      }[];
      unchangedCount: number;
    };
  /** «تعديل المعلوم» as the form does it: preview, then the confirmed ids */
  const setFee = async (groupKey: string, body: object, status = 200) => {
    const b = body as { amount: string; academicYearId: string };
    const preview = await repricePreview(groupKey, b.amount, b.academicYearId);
    return admin
      .put(`groups/${id[groupKey]}/fees`, {
        ...body,
        repriceObligationIds: preview.toUpdate.map((o) => o.obligationId),
      })
      .expect(status);
  };
  const student = async (key: string, classKey: string) => {
    id[key] = (
      await admin
        .post('students', {
          person: {
            firstName: key,
            lastName: tag('طالب'),
            gender: 'MALE',
            dateOfBirth: '2012-05-01',
            address: 'نابل',
          },
          groupClassId: id[classKey],
          registrationDate: addDays(TODAY, -30),
          guardianPhone: '98765432',
        })
        .expect(201)
    ).body.id;
  };
  /** The student's live (not voided, not closed) obligation in a group for the year */
  const liveIn = async (
    studentKey: string,
    groupKey: string,
    yearId = id.year,
  ) =>
    prisma.paymentObligation.findFirst({
      where: {
        studentId: id[studentKey],
        groupId: id[groupKey],
        academicYearId: yearId,
        voidedAt: null,
        closedAt: null,
      },
      select: { id: true },
    });
  const obligation = async (obligationId: string) =>
    (await admin.get(`payment-obligations/${obligationId}`).expect(200))
      .body as Obligation;
  const pay = (obligationId: string, amount: string, extra: object = {}) =>
    admin.post('payments', { obligationId, amount, ...extra });
  const preview = async (studentKey: string, classKey: string) =>
    (
      await admin
        .get(`students/${id[studentKey]}/group-class/preview`, {
          groupClassId: id[classKey],
        })
        .expect(200)
    ).body as Plan;
  const confirmOf = (plan: Plan) =>
    plan.transfers.map((t) => ({
      fromObligationId: t.from.obligationId,
      creditAmount: t.creditAmount,
    }));
  /** «تغيير المجموعة» as the dialog does it: preview, then confirm it */
  const move = async (studentKey: string, classKey: string, status = 200) =>
    admin
      .patch(`students/${id[studentKey]}/group-class`, {
        groupClassId: id[classKey],
        financialTransfers: confirmOf(await preview(studentKey, classKey)),
      })
      .expect(status);
  const groupTotals = async (groupKey: string) =>
    (
      await admin
        .get('finance/summary', {
          academicYearId: id.year,
          groupId: id[groupKey],
        })
        .expect(200)
    ).body.totals as Record<string, string>;
  const delta = (
    after: Record<string, string>,
    before: Record<string, string>,
  ) =>
    Object.fromEntries(
      Object.keys(after).map((k) => [
        k,
        (Number(after[k]) - Number(before[k])).toFixed(3),
      ]),
    );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const person = await prisma.person.create({
      data: {
        firstName: 'admin',
        lastName: tag('حساب'),
        teacher: { create: { joinedAt: new Date('2024-09-01') } },
        user: {
          create: {
            username: `e2e-${RUN}-admin`,
            passwordHash: await new PasswordService().hash(PASSWORD),
            mustChangePassword: false,
            roles: { create: [{ role: Role.ADMIN }] },
          },
        },
      },
      select: { teacher: { select: { id: true } } },
    });
    id.sup = person.teacher!.id;
    token = (
      await http()
        .post('/api/auth/login')
        .send({ username: `e2e-${RUN}-admin`, password: PASSWORD })
        .expect(200)
    ).body.accessToken;

    id.branch = (
      await admin
        .post('branches', { name: tag('فرع'), address: 'نابل' })
        .expect(201)
    ).body.id;
    for (const g of ['A', 'B', 'C', 'D', 'E', 'R', 'M', 'Y']) {
      id[g] = (
        await admin
          .post('groups', { name: tag(`مجموعة ${g}`), audience: 'أطفال' })
          .expect(201)
      ).body.id;
    }
    for (const [cls, g] of [
      ['A1', 'A'],
      ['A2', 'A'],
      ['B1', 'B'],
      ['C1', 'C'],
      ['D1', 'D'],
      ['E1', 'E'],
      ['R1', 'R'],
      ['M1', 'M'],
      ['Y1', 'Y'],
    ])
      id[cls] = (
        await admin
          .post('group-classes', {
            groupId: id[g],
            branchId: id.branch,
            supervisorId: id.sup,
          })
          .expect(201)
      ).body.id;
    // The current year (not over) and a later one
    id.year = (
      await prisma.academicYear.create({
        data: {
          label: tag('سنة'),
          startDate: dbDate(addDays(TODAY, -60)),
          endDate: dbDate(addDays(TODAY, 250)),
          semester2StartDate: dbDate(addDays(TODAY, 90)),
        },
        select: { id: true },
      })
    ).id;
    id.year2 = (
      await prisma.academicYear.create({
        data: {
          label: tag('سنة لاحقة'),
          startDate: dbDate(addDays(TODAY, 260)),
          endDate: dbDate(addDays(TODAY, 600)),
          semester2StartDate: dbDate(addDays(TODAY, 400)),
        },
        select: { id: true },
      })
    ).id;
    for (const [g, amount] of [
      ['A', '120'],
      ['B', '200'],
      ['C', '150'],
      ['E', '100'],
      ['R', '120'],
    ])
      await admin.put(`groups/${id[g]}/fees`, yearly(amount)).expect(200);
  });

  afterAll(async () => {
    const groups = { name: { endsWith: RUN } };
    const persons = (
      await prisma.person.findMany({
        where: { lastName: { endsWith: RUN } },
        select: { id: true },
      })
    ).map((p) => p.id);
    const students = { personId: { in: persons } };
    await prisma.obligationTransfer.deleteMany({
      where: { student: students },
    });
    await prisma.payment.deleteMany({
      where: { obligation: { group: groups } },
    });
    // Replacements before the obligations they replace (RESTRICT)
    await prisma.paymentObligation.deleteMany({
      where: { group: groups, replacesObligationId: { not: null } },
    });
    await prisma.paymentObligation.deleteMany({ where: { group: groups } });
    await prisma.groupFee.deleteMany({ where: { group: groups } });
    await prisma.studentEnrollment.deleteMany({ where: { student: students } });
    await prisma.studentStatusChange.deleteMany({
      where: { student: students },
    });
    await prisma.student.deleteMany({ where: students });
    await prisma.groupClass.deleteMany({ where: { group: groups } });
    await prisma.academicYear.deleteMany({ where: onlyId(id.year) });
    await prisma.academicYear.deleteMany({ where: onlyId(id.year2) });
    await prisma.teacher.deleteMany({ where: { personId: { in: persons } } });
    await prisma.user.deleteMany({ where: { personId: { in: persons } } });
    await prisma.person.deleteMany({ where: { id: { in: persons } } });
    await prisma.branch.deleteMany({ where: { name: { endsWith: RUN } } });
    await prisma.group.deleteMany({ where: groups });
    await app.close();
  });

  /* ================================================================ */
  /* Fee configuration                                                */
  /* ================================================================ */

  describe('fee configuration', () => {
    it('a yearly TOTAL per student by default (no billing type, no periods)', async () => {
      const fee = (
        await admin.get(`groups/${id.A}/fees`, { academicYearId: id.year })
      ).body.data[0];
      expect(fee).toMatchObject({
        billingType: 'YEARLY',
        numberOfPeriods: 1,
        amount: '120.000',
        totalAmount: '120.000',
        isActive: true,
        status: 'ACTIVE',
      });
    });

    it('free partial payments at any date, without periods: 30 + 20 + 70 = 120', async () => {
      await student('free', 'Y1');
      await admin.put(`groups/${id.Y}/fees`, yearly('120')).expect(200);
      const o = (await liveIn('free', 'Y'))!.id;
      await pay(o, '30', { paidAt: addDays(TODAY, -20) }).expect(201);
      await pay(o, '20', { paidAt: addDays(TODAY, -5) }).expect(201);
      expect(await obligation(o)).toMatchObject({
        totalPaid: '50.000',
        remainingAmount: '70.000',
        status: 'PARTIAL',
      });
      await pay(o, '70', { receiptIssued: true }).expect(201);
      expect(await obligation(o)).toMatchObject({
        requiredAmount: '120.000',
        totalPaid: '120.000',
        remainingAmount: '0.000',
        status: 'PAID',
      });
      expect((await pay(o, '0.001').expect(409)).body.code).toBe(
        'OBLIGATION_FULLY_PAID',
      );
      // Receipts kept per payment
      const payments = (
        await admin.get(`payment-obligations/${o}/payments`).expect(200)
      ).body as { receiptIssued: boolean }[];
      expect(payments.map((p) => p.receiptIssued)).toEqual([
        false,
        false,
        true,
      ]);
    });

    it('an existing MONTHLY fee stays readable and correct (amount × months, periods)', async () => {
      await student('monthly', 'M1');
      await admin
        .put(`groups/${id.M}/fees`, {
          ...yearly('20', 'برنامج صيفي'),
          billingType: 'MONTHLY',
          numberOfPeriods: 2,
        })
        .expect(200);
      const o = (await liveIn('monthly', 'M'))!.id;
      expect(await obligation(o)).toMatchObject({
        expectedAmount: '40.000',
        requiredAmount: '40.000',
        status: 'UNPAID',
      });
      await pay(o, '20', { periodNumber: 1 }).expect(201);
      expect(await obligation(o)).toMatchObject({
        totalPaid: '20.000',
        remainingAmount: '20.000',
      });
      // Repricing to a yearly total: the paid monthly obligation is protected
      const p = await repricePreview('M', '60');
      expect(p.toUpdate).toEqual([]);
      expect(p.protected[0].reasons).toEqual(['HAS_PAYMENTS']);
    });

    it('one ACTIVE fee per group and year (database); versions kept with their status', async () => {
      const [active] = (
        await admin.get(`groups/${id.A}/fees`, { academicYearId: id.year })
      ).body.data;
      await expect(
        prisma.groupFee.create({
          data: {
            groupId: id.A,
            academicYearId: id.year,
            label: 'x',
            billingType: 'YEARLY',
            amount: '1',
          },
        }),
      ).rejects.toThrow(/group_fees_one_active_key|Unique constraint/);
      expect(active.isActive).toBe(true);
    });
  });

  /* ================================================================ */
  /* Repricing                                                        */
  /* ================================================================ */

  describe('«تعديل المعلوم» repricing', () => {
    beforeAll(async () => {
      for (const s of ['ahmed', 'mariem', 'fatma', 'rami', 'ines', 'leila'])
        await student(s, 'R1');
      await pay((await liveIn('mariem', 'R'))!.id, '60').expect(201);
      await pay((await liveIn('fatma', 'R'))!.id, '120').expect(201);
      const rami = (
        await pay((await liveIn('rami', 'R'))!.id, '10').expect(201)
      ).body.id;
      await admin
        .post(`payments/${rami}/void`, { reason: 'دفعة مسجّلة خطأ' })
        .expect(200);
      await admin
        .patch(`students/${id.ines}/status`, { status: 'INACTIVE' })
        .expect(200);
      // Left the group without a transfer (data from before «نقل مالي»)
      await prisma.studentEnrollment.updateMany({
        where: { studentId: id.leila, endDate: null },
        data: { endDate: dbDate(addDays(TODAY, -1)) },
      });
      await prisma.studentEnrollment.create({
        data: {
          studentId: id.leila,
          groupClassId: id.D1,
          startDate: dbDate(addDays(TODAY, -1)),
        },
      });
      await prisma.student.update({
        where: { id: id.leila },
        data: { groupClassId: id.D1 },
      });
      // Another year of the same group: never touched by this year's repricing
      await admin
        .put(`groups/${id.R}/fees`, {
          academicYearId: id.year2,
          label: 'السنة الموالية',
          amount: '90',
        })
        .expect(200);
      id.ahmedYear2 = (await liveIn('ahmed', 'R', id.year2))!.id;
    });

    it('the preview: never-paid active members updated; the others protected, with reasons', async () => {
      const p = await repricePreview('R', '200');
      expect(p.toUpdate.map((o) => o.student.id)).toEqual([id.ahmed]);
      const reasons = Object.fromEntries(
        p.protected.map((o) => [o.student.id, o.reasons]),
      );
      expect(reasons).toEqual({
        [id.mariem]: ['HAS_PAYMENTS'],
        [id.fatma]: ['HAS_PAYMENTS'],
        [id.rami]: ['HAS_VOIDED_PAYMENTS'],
        [id.ines]: ['STUDENT_INACTIVE'],
        [id.leila]: ['LEFT_GROUP'],
      });
    });

    it('not confirmed, or a stale confirmation: 409 and nothing changes', async () => {
      const before = await prisma.paymentObligation.count({
        where: { groupId: id.R },
      });
      const versions = await prisma.groupFee.count({
        where: { groupId: id.R },
      });
      expect(
        (await admin.put(`groups/${id.R}/fees`, yearly('200')).expect(409)).body
          .code,
      ).toBe('FEE_REPRICE_CONFIRMATION_REQUIRED');
      // A new member joins after the preview
      const stale = (await repricePreview('R', '200')).toUpdate.map(
        (o) => o.obligationId,
      );
      await student('nour', 'R1');
      expect(
        (
          await admin
            .put(`groups/${id.R}/fees`, {
              ...yearly('200'),
              repriceObligationIds: stale,
            })
            .expect(409)
        ).body.code,
      ).toBe('FEE_REPRICE_STALE');
      expect(await prisma.groupFee.count({ where: { groupId: id.R } })).toBe(
        versions,
      );
      expect(
        await prisma.paymentObligation.count({ where: { groupId: id.R } }),
      ).toBe(before + 2); // nour's own charges only (this year and the next)
    });

    it('confirmed: never-paid obligations replaced at 200 (linked, audited); paid / reversed / inactive / left unchanged', async () => {
      const totalsBefore = await groupTotals('R');
      const oldAhmed = (await liveIn('ahmed', 'R'))!.id;
      const protectedBefore = await Promise.all(
        ['mariem', 'fatma', 'rami', 'ines', 'leila'].map(
          async (s) => (await liveIn(s, 'R'))!.id,
        ),
      );
      await setFee('R', yearly('200', 'المعلوم المعدّل'));
      // Ahmed: the old one voided «تعديل المعلوم», kept; a replacement at 200 points to it
      const old = await obligation(oldAhmed);
      expect(old.voided?.reason).toBe('تعديل المعلوم');
      expect(old.expectedAmount).toBe('120.000');
      const replacement = await obligation((await liveIn('ahmed', 'R'))!.id);
      expect(replacement).toMatchObject({
        expectedAmount: '200.000',
        remainingAmount: '200.000',
        replacesObligationId: oldAhmed,
      });
      expect(
        (await obligation((await liveIn('nour', 'R'))!.id)).expectedAmount,
      ).toBe('200.000');
      // Protected: same rows, same amounts
      for (const [i, s] of [
        'mariem',
        'fatma',
        'rami',
        'ines',
        'leila',
      ].entries())
        expect([s, (await liveIn(s, 'R'))!.id]).toEqual([
          s,
          protectedBefore[i],
        ]);
      expect(await obligation(protectedBefore[0])).toMatchObject({
        expectedAmount: '120.000',
        totalPaid: '60.000',
        remainingAmount: '60.000',
      });
      expect(await obligation(protectedBefore[1])).toMatchObject({
        status: 'PAID',
      });
      // Other year untouched
      expect((await obligation(id.ahmedYear2)).expectedAmount).toBe('90.000');
      // Dashboard: required +80 × 2 (ahmed, nour), paid unchanged, no double count
      const d = delta(await groupTotals('R'), totalsBefore);
      expect(d).toMatchObject({
        expectedAmount: '160.000',
        totalPaid: '0.000',
        remainingAmount: '160.000',
      });
      // History: the replaced version reads «استُبدل»
      const versions = (
        await admin.get(`groups/${id.R}/fees`, { academicYearId: id.year })
      ).body.data as { status: string; amount: string }[];
      expect(versions.map((v) => [v.amount, v.status])).toEqual([
        ['200.000', 'ACTIVE'],
        ['120.000', 'REPLACED'],
      ]);
    });

    it('the same amount again: nothing to reprice, no duplicate', async () => {
      const count = await prisma.paymentObligation.count({
        where: { groupId: id.R },
      });
      const p = await repricePreview('R', '200');
      expect(p.toUpdate).toEqual([]);
      expect(p.unchangedCount).toBeGreaterThanOrEqual(2);
      await setFee('R', yearly('200'));
      expect(
        await prisma.paymentObligation.count({ where: { groupId: id.R } }),
      ).toBe(count);
    });

    it('a payment at the same moment as the repricing: never lost, never on a voided obligation', async () => {
      const ids = (await repricePreview('R', '250')).toUpdate.map(
        (o) => o.obligationId,
      );
      const target = (await liveIn('ahmed', 'R'))!.id;
      expect(ids).toContain(target);
      const [reprice, payment] = await Promise.all([
        admin.put(`groups/${id.R}/fees`, {
          ...yearly('250'),
          repriceObligationIds: ids,
        }),
        pay(target, '10'),
      ]);
      const live = await prisma.payment.findMany({
        where: { obligationId: target, voidedAt: null },
      });
      if (reprice.status === 200) {
        // Repriced first: the payment was refused (obligation voided)
        expect(payment.status).toBe(409);
        expect(live).toEqual([]);
        expect((await obligation(target)).voided).not.toBeNull();
      } else {
        // Paid first: the confirmation is stale; the payment stands
        expect(reprice.body.code).toBe('FEE_REPRICE_STALE');
        expect(payment.status).toBe(201);
        expect(live).toHaveLength(1);
        expect((await obligation(target)).voided).toBeNull();
      }
    });

    it('the database: a replacement only replaces a voided obligation of the same student/group/year', async () => {
      const fee = await prisma.groupFee.findFirstOrThrow({
        where: { groupId: id.R, academicYearId: id.year, isActive: true },
      });
      const liveOne = (await liveIn('mariem', 'R'))!.id;
      await expect(
        prisma.paymentObligation.create({
          data: {
            studentId: id.mariem,
            groupFeeId: fee.id,
            groupId: id.R,
            academicYearId: id.year,
            expectedAmount: fee.amount,
            replacesObligationId: liveOne,
          },
        }),
      ).rejects.toThrow(/payment_obligations_replacement|one_live_key|Unique/);
    });

    it('«إيقاف»: the version reads «موقوف»', async () => {
      const [active] = (
        await admin.get(`groups/${id.M}/fees`, { academicYearId: id.year })
      ).body.data;
      expect(
        (await admin.post(`group-fees/${active.id}/deactivate`).expect(200))
          .body.status,
      ).toBe('STOPPED');
    });
  });

  /* ================================================================ */
  /* Transfers between groups                                         */
  /* ================================================================ */

  describe('«نقل مالي» transfers between groups', () => {
    it('no payment: the old obligation is closed (credit 0), the new group charged in full', async () => {
      await student('tz', 'A1');
      const old = (await liveIn('tz', 'A'))!.id;
      const plan = await preview('tz', 'B1');
      expect(plan.transfers).toEqual([
        expect.objectContaining({
          creditAmount: '0.000',
          excessAmount: '0.000',
          remainingAfter: '200.000',
          blocked: null,
        }),
      ]);
      await move('tz', 'B1');
      expect(await obligation(old)).toMatchObject({
        requiredAmount: '0.000',
        remainingAmount: '0.000',
        status: 'CLOSED',
        closed: expect.objectContaining({ creditAmount: '0.000' }),
      });
      expect(await obligation((await liveIn('tz', 'B'))!.id)).toMatchObject({
        requiredAmount: '200.000',
        creditIn: '0.000',
        remainingAmount: '200.000',
      });
    });

    it('partial payment (60 of 120 → 200): 60 carried, 140 left; cash stays 60, credit is not cash', async () => {
      await student('tp', 'A1');
      const old = (await liveIn('tp', 'A'))!.id;
      const cash = (await pay(old, '60', { receiptIssued: true }).expect(201))
        .body.id;
      const [aBefore, bBefore] = [
        await groupTotals('A'),
        await groupTotals('B'),
      ];
      const plan = await preview('tp', 'B1');
      expect(plan.transfers[0]).toMatchObject({
        from: expect.objectContaining({ settledAmount: '60.000' }),
        to: { requiredAmount: '200.000' },
        creditAmount: '60.000',
        excessAmount: '0.000',
        remainingAfter: '140.000',
      });
      await move('tp', 'B1');
      expect(await obligation(old)).toMatchObject({
        expectedAmount: '120.000',
        requiredAmount: '0.000',
        totalPaid: '60.000',
        creditOut: '60.000',
        remainingAmount: '0.000',
        excessAmount: '0.000',
        status: 'CLOSED',
      });
      const fresh = await obligation((await liveIn('tp', 'B'))!.id);
      expect(fresh).toMatchObject({
        requiredAmount: '200.000',
        totalPaid: '0.000',
        creditIn: '60.000',
        settledAmount: '60.000',
        remainingAmount: '140.000',
        status: 'PARTIAL',
      });
      // The payment and its receipt are untouched
      expect(
        (await admin.get(`payments/${cash}`).expect(200)).body,
      ).toMatchObject({
        obligationId: old,
        amount: '60.000',
        receiptIssued: true,
        voided: null,
      });
      // Reports: group A loses 120 required and 60 remaining, its cash stays; B gains 200 / 140
      expect(delta(await groupTotals('A'), aBefore)).toMatchObject({
        expectedAmount: '-120.000',
        totalPaid: '0.000',
        creditAmount: '-60.000',
        remainingAmount: '-60.000',
      });
      expect(delta(await groupTotals('B'), bBefore)).toMatchObject({
        expectedAmount: '200.000',
        totalPaid: '0.000',
        creditAmount: '60.000',
        remainingAmount: '140.000',
      });
      // The student's own summary: cash 60, net credit 0, 140 to pay
      expect(
        (
          await admin
            .get(`students/${id.tp}/finance/summary`, {
              academicYearId: id.year,
            })
            .expect(200)
        ).body.totals,
      ).toEqual({
        expectedAmount: '200.000',
        totalPaid: '60.000',
        creditAmount: '0.000',
        remainingAmount: '140.000',
        excessAmount: '0.000',
      });
      // The credit counts toward the limit: 141 refused, 140 settles it
      expect((await pay(fresh.id, '140.001').expect(409)).body.code).toBe(
        'AMOUNT_EXCEEDS_REMAINING',
      );
      await pay(fresh.id, '140').expect(201);
      expect((await obligation(fresh.id)).status).toBe('PAID');
    });

    it('fully paid (120 → 200): 120 carried, 80 left', async () => {
      await student('tf', 'A1');
      await pay((await liveIn('tf', 'A'))!.id, '120').expect(201);
      await move('tf', 'B1');
      expect(await obligation((await liveIn('tf', 'B'))!.id)).toMatchObject({
        creditIn: '120.000',
        remainingAmount: '80.000',
      });
    });

    it('excess (paid 120 → fee 100): 100 carried, 20 stays as «رصيد زائد» on the old obligation', async () => {
      await student('tx', 'A1');
      const old = (await liveIn('tx', 'A'))!.id;
      await pay(old, '120').expect(201);
      const before = await groupTotals('A');
      expect((await preview('tx', 'E1')).transfers[0]).toMatchObject({
        creditAmount: '100.000',
        excessAmount: '20.000',
        remainingAfter: '0.000',
      });
      await move('tx', 'E1');
      expect(await obligation(old)).toMatchObject({
        requiredAmount: '0.000',
        totalPaid: '120.000',
        creditOut: '100.000',
        excessAmount: '20.000',
        remainingAmount: '0.000',
        status: 'CLOSED',
      });
      expect(await obligation((await liveIn('tx', 'E'))!.id)).toMatchObject({
        creditIn: '100.000',
        remainingAmount: '0.000',
        status: 'PAID',
      });
      expect(delta(await groupTotals('A'), before)).toMatchObject({
        excessAmount: '20.000',
      });
    });

    it('repeated transfers A → B → C: what was settled follows (60 cash in A + 40 in B → 100 credit in C)', async () => {
      await student('tr', 'A1');
      await pay((await liveIn('tr', 'A'))!.id, '60').expect(201);
      await move('tr', 'B1');
      const inB = (await liveIn('tr', 'B'))!.id;
      await pay(inB, '40').expect(201);
      expect((await preview('tr', 'C1')).transfers[0]).toMatchObject({
        from: expect.objectContaining({
          cashPaid: '40.000',
          creditIn: '60.000',
          settledAmount: '100.000',
        }),
        creditAmount: '100.000',
      });
      await move('tr', 'C1');
      expect(await obligation(inB)).toMatchObject({
        status: 'CLOSED',
        requiredAmount: '0.000',
        settledAmount: '0.000',
      });
      expect(await obligation((await liveIn('tr', 'C'))!.id)).toMatchObject({
        requiredAmount: '150.000',
        creditIn: '100.000',
        remainingAmount: '50.000',
      });
      // Cash recorded once: 60 + 40
      const cash = await prisma.payment.aggregate({
        where: { obligation: { studentId: id.tr }, voidedAt: null },
        _sum: { amount: true },
      });
      expect(cash._sum.amount?.toFixed(3)).toBe('100.000');
    });

    it('back to the first group A → B → A: billed again, the credit follows', async () => {
      await student('tb', 'A1');
      const first = (await liveIn('tb', 'A'))!.id;
      await pay(first, '30').expect(201);
      await move('tb', 'B1');
      await move('tb', 'A2');
      const again = (await liveIn('tb', 'A'))!.id;
      expect(again).not.toBe(first);
      expect((await obligation(first)).status).toBe('CLOSED');
      expect(await obligation(again)).toMatchObject({
        requiredAmount: '120.000',
        creditIn: '30.000',
        remainingAmount: '90.000',
      });
    });

    it('a class of the same group: no financial change', async () => {
      await student('ts', 'A1');
      const before = (await liveIn('ts', 'A'))!.id;
      expect(await preview('ts', 'A2')).toMatchObject({
        sameGroup: true,
        transfers: [],
      });
      await admin
        .patch(`students/${id.ts}/group-class`, { groupClassId: id.A2 })
        .expect(200);
      expect((await liveIn('ts', 'A'))!.id).toBe(before);
      expect(
        await prisma.obligationTransfer.count({ where: { studentId: id.ts } }),
      ).toBe(0);
    });

    it('a group without an active fee: refused with an explanation; nothing changes', async () => {
      await student('td', 'A1');
      const old = (await liveIn('td', 'A'))!.id;
      expect((await preview('td', 'D1')).transfers[0].blocked).toBe(
        'NO_TARGET_FEE',
      );
      const res = await admin
        .patch(`students/${id.td}/group-class`, {
          groupClassId: id.D1,
          financialTransfers: [],
        })
        .expect(409);
      expect(res.body.code).toBe('TRANSFER_TARGET_HAS_NO_FEE');
      expect(res.body.message).toMatch(/حدّد معلومها أولًا/);
      expect(
        (await admin.get(`students/${id.td}`).expect(200)).body.groupClass.id,
      ).toBe(id.A1);
      expect((await obligation(old)).status).toBe('UNPAID');
    });

    it('not confirmed, or stale (a payment after the preview): 409 and nothing changes', async () => {
      await student('tc', 'A1');
      const old = (await liveIn('tc', 'A'))!.id;
      await pay(old, '50').expect(201);
      expect(
        (
          await admin
            .patch(`students/${id.tc}/group-class`, { groupClassId: id.B1 })
            .expect(409)
        ).body.code,
      ).toBe('FINANCIAL_TRANSFER_REQUIRED');
      const plan = await preview('tc', 'B1');
      await pay(old, '10').expect(201);
      expect(
        (
          await admin
            .patch(`students/${id.tc}/group-class`, {
              groupClassId: id.B1,
              financialTransfers: confirmOf(plan),
            })
            .expect(409)
        ).body.code,
      ).toBe('FINANCIAL_TRANSFER_STALE');
      expect((await obligation(old)).closed).toBeNull();
      expect(await liveIn('tc', 'B')).toBeNull();
    });

    it('the same confirmed request twice (even at once): one transfer only', async () => {
      const plan = await preview('tc', 'B1');
      const body = {
        groupClassId: id.B1,
        financialTransfers: confirmOf(plan),
      };
      const results = await Promise.all([
        admin.patch(`students/${id.tc}/group-class`, body),
        admin.patch(`students/${id.tc}/group-class`, body),
      ]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      expect(
        await prisma.obligationTransfer.count({ where: { studentId: id.tc } }),
      ).toBe(1);
      expect(
        await prisma.paymentObligation.count({
          where: { studentId: id.tc, groupId: id.B, voidedAt: null },
        }),
      ).toBe(1);
      expect(await obligation((await liveIn('tc', 'B'))!.id)).toMatchObject({
        creditIn: '60.000',
        remainingAmount: '140.000',
      });
    });

    it('a payment at the same moment as the transfer: never lost, never counted twice', async () => {
      await student('tq', 'A1');
      const old = (await liveIn('tq', 'A'))!.id;
      await pay(old, '20').expect(201);
      const plan = await preview('tq', 'B1');
      const [transfer, payment] = await Promise.all([
        admin.patch(`students/${id.tq}/group-class`, {
          groupClassId: id.B1,
          financialTransfers: confirmOf(plan),
        }),
        pay(old, '30'),
      ]);
      const o = await obligation(old);
      if (transfer.status === 200) {
        expect(payment.body.code).toBe('OBLIGATION_CLOSED');
        expect(o).toMatchObject({ totalPaid: '20.000', creditOut: '20.000' });
      } else {
        expect(transfer.body.code).toBe('FINANCIAL_TRANSFER_STALE');
        expect(payment.status).toBe(201);
        expect(o).toMatchObject({ totalPaid: '50.000', closed: null });
      }
    });

    it('a payment void at the same moment as the transfer: the carried credit is never invalidated', async () => {
      await student('tv', 'A1');
      const old = (await liveIn('tv', 'A'))!.id;
      const p = (await pay(old, '40').expect(201)).body.id;
      const plan = await preview('tv', 'B1');
      const [transfer, voiding] = await Promise.all([
        admin.patch(`students/${id.tv}/group-class`, {
          groupClassId: id.B1,
          financialTransfers: confirmOf(plan),
        }),
        admin.post(`payments/${p}/void`, { reason: 'خطأ' }),
      ]);
      if (transfer.status === 200) {
        expect(voiding.body.code).toBe('PAYMENT_CREDIT_TRANSFERRED');
        expect((await obligation((await liveIn('tv', 'B'))!.id)).creditIn).toBe(
          '40.000',
        );
      } else {
        expect(transfer.body.code).toBe('FINANCIAL_TRANSFER_STALE');
        expect(voiding.status).toBe(200);
      }
    });

    it('after a transfer: the carried payment cannot be voided, the closed obligation takes no payment', async () => {
      const closed = await prisma.paymentObligation.findFirstOrThrow({
        where: { studentId: id.tp, groupId: id.A },
        select: { id: true, payments: { select: { id: true } } },
      });
      const res = await admin
        .post(`payments/${closed.payments[0].id}/void`, { reason: 'خطأ' })
        .expect(409);
      expect(res.body.code).toBe('PAYMENT_CREDIT_TRANSFERRED');
      expect(res.body.message).toMatch(/حُوِّل مبلغها رصيدًا/);
      expect((await pay(closed.id, '1').expect(409)).body.code).toBe(
        'OBLIGATION_CLOSED',
      );
      // Neither the old nor the new obligation of a transfer can be voided
      const fresh = (await liveIn('tp', 'B'))!.id;
      for (const o of [closed.id, fresh])
        expect(
          (
            await admin
              .post(`payment-obligations/${o}/void`, { reason: 'x' })
              .expect(409)
          ).body.code,
        ).toMatch(/OBLIGATION_HAS_TRANSFER|OBLIGATION_HAS_PAYMENTS/);
    });

    it('the database enforces it even without the API', async () => {
      const closed = await prisma.paymentObligation.findFirstOrThrow({
        where: { studentId: id.tp, groupId: id.A },
        select: { id: true, payments: { select: { id: true } } },
      });
      const adminUser = await prisma.user.findFirstOrThrow({
        where: { username: `e2e-${RUN}-admin` },
      });
      await expect(
        prisma.payment.update({
          where: { id: closed.payments[0].id },
          data: {
            voidedAt: new Date(),
            voidedByUserId: adminUser.id,
            voidReason: 'x',
          },
        }),
      ).rejects.toThrow(/payments_credit_transferred/);
      await expect(
        prisma.payment.create({
          data: {
            obligationId: closed.id,
            amount: '1',
            paidAt: dbDate(TODAY),
            recordedByUserId: adminUser.id,
          },
        }),
      ).rejects.toThrow(/payments_closed_obligation/);
      const transfer = await prisma.obligationTransfer.findFirstOrThrow({
        where: { studentId: id.tp },
      });
      await expect(
        prisma.obligationTransfer.update({
          where: { id: transfer.id },
          data: { creditAmount: '1' },
        }),
      ).rejects.toThrow(/obligation_transfers_immutable/);
      // Closing only through a transfer; an obligation is never reopened
      const open = (await liveIn('ts', 'A'))!.id;
      await expect(
        prisma.paymentObligation.update({
          where: { id: open },
          data: { closedAt: new Date() },
        }),
      ).rejects.toThrow(/payment_obligations_close_by_transfer/);
      await expect(
        prisma.paymentObligation.update({
          where: { id: closed.id },
          data: { closedAt: null },
        }),
      ).rejects.toThrow(/payment_obligations_immutable/);
      // A second transfer out of the same obligation is refused
      await expect(
        prisma.obligationTransfer.create({
          data: {
            studentId: id.tp,
            fromObligationId: closed.id,
            toObligationId: (await liveIn('tp', 'B'))!.id,
            releasedAmount: '120',
            creditAmount: '0',
            excessAmount: '0',
            effectiveDate: dbDate(TODAY),
            reason: 'x',
            createdByUserId: adminUser.id,
          },
        }),
      ).rejects.toThrow(/obligation_transfers_invalid|fromObligationId/);
    });

    it('an obligation that received a transfer is protected from repricing', async () => {
      const p = await repricePreview('B', '210');
      const tz = p.protected.find((o) => o.student.id === id.tz);
      expect(tz?.reasons).toEqual(['HAS_TRANSFER_CREDIT']);
      expect(p.toUpdate).toEqual([]);
    });
  });
});
