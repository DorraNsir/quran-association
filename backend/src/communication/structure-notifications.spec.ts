import type { NotificationActor } from './notification-text.js';
import {
  type ClassSnapshot,
  classLead,
  sessionMessage,
  type SessionSnapshot,
  slotLines,
  structureLines,
} from './structure-notifications.js';

const admin = (gender: NotificationActor['gender']): NotificationActor => ({
  userId: 'u1',
  name: 'أحمد بن علي',
  gender,
});
const C = 'الماهر — فرع المركز';
const klass = (over: Partial<ClassSnapshot> = {}): ClassSnapshot => ({
  id: 'c1',
  group: { id: 'g1', name: 'الماهر' },
  branch: { id: 'b1', name: 'فرع المركز' },
  status: 'ACTIVE',
  supervisorId: 't1',
  assistantIds: [],
  slots: new Map([
    ['s1', { day: 'SUN', start: '17:00', end: '18:00', room: 'القاعة 1' }],
  ]),
  ...over,
});

describe('structure notification wording', () => {
  it('leads agree with the admin’s gender; without it the passive form names them', () => {
    expect(classLead('ASSIGNED_SUPERVISOR', admin('MALE'), C)).toBe(
      'عيّنك المسؤول الإداري أحمد بن علي مشرفًا على قسم الماهر — فرع المركز',
    );
    expect(classLead('REMOVED_ASSISTANT', admin('FEMALE'), C)).toBe(
      'أزالتك المسؤولة الإدارية أحمد بن علي من فريق قسم الماهر — فرع المركز',
    );
    expect(classLead('SCHEDULE', admin(null), C)).toBe(
      'عُدّلت مواعيد قسم الماهر — فرع المركز من طرف أحمد بن علي',
    );
    expect(classLead('CREATED', null, C)).toBe('أُنشئ قسم الماهر — فرع المركز');
  });

  it('slot lines: new, moved, removed', () => {
    const before = klass();
    const after = klass({
      slots: new Map([
        ['s1', { day: 'MON', start: '17:00', end: '18:00', room: 'القاعة 1' }],
        ['s2', { day: 'TUE', start: '09:00', end: '10:00', room: 'القاعة 2' }],
      ]),
    });
    expect(slotLines(before, after)).toEqual([
      'موعد جديد: الثلاثاء من 09:00 إلى 10:00 (القاعة 2)',
      'تغيّر موعد: من الأحد من 17:00 إلى 18:00 (القاعة 1) إلى الاثنين من 17:00 إلى 18:00 (القاعة 1)',
    ]);
    expect(slotLines(after, klass({ slots: new Map() }))).toEqual([
      'موعد محذوف: الاثنين من 17:00 إلى 18:00 (القاعة 1)',
      'موعد محذوف: الثلاثاء من 09:00 إلى 10:00 (القاعة 2)',
    ]);
    expect(slotLines(before, klass())).toEqual([]);
  });

  it('structure lines: group, branch, status (nothing for a new class)', () => {
    expect(
      structureLines(
        klass(),
        klass({
          group: { id: 'g2', name: 'الأرقم' },
          branch: { id: 'b2', name: 'فرع الشاطئ' },
          status: 'INACTIVE',
        }),
      ),
    ).toEqual([
      'المجموعة: من الماهر إلى الأرقم',
      'الفرع: من فرع المركز إلى فرع الشاطئ',
      'الحالة: من نشط إلى غير نشط',
    ]);
    expect(structureLines(undefined, klass())).toEqual([]);
  });

  it('lessons: cancelled with its reason, rescheduled from / to', () => {
    const lesson: SessionSnapshot = {
      id: 'se1',
      date: '2026-11-05',
      start: '17:00',
      end: '18:00',
      room: 'القاعة 1',
      status: 'SCHEDULED',
      classIds: ['c1'],
      classes: [{ group: 'الماهر', branch: 'فرع المركز' }],
      teacherIds: [],
    };
    expect(
      sessionMessage('CANCELLED', admin('FEMALE'), null, lesson, 'عطلة'),
    ).toBe(
      'ألغت المسؤولة الإدارية أحمد بن علي حصة قسم الماهر — فرع المركز: يوم الخميس 5 نوفمبر 2026 من 17:00 إلى 18:00 (القاعة 1)، السبب: عطلة.',
    );
    expect(
      sessionMessage('RESCHEDULED', admin(null), lesson, {
        ...lesson,
        start: '18:00',
        end: '19:00',
      }),
    ).toBe(
      'تغيّر موعد حصة قسم الماهر — فرع المركز من طرف أحمد بن علي: من يوم الخميس 5 نوفمبر 2026 من 17:00 إلى 18:00 (القاعة 1) إلى يوم الخميس 5 نوفمبر 2026 من 18:00 إلى 19:00 (القاعة 1).',
    );
  });

  it('lessons by a supervisor teacher, and a deleted extra lesson', () => {
    const lesson: SessionSnapshot = {
      id: 'se1',
      date: '2026-11-05',
      start: '17:00',
      end: '18:00',
      room: 'القاعة 1',
      status: 'SCHEDULED',
      classIds: ['c1'],
      classes: [{ group: 'الماهر', branch: 'فرع المركز' }],
      teacherIds: [],
    };
    expect(
      sessionMessage('ADDED', admin('MALE'), null, lesson, null, 'TEACHER'),
    ).toBe(
      'أضاف المعلم أحمد بن علي حصة إضافية لقسم الماهر — فرع المركز: يوم الخميس 5 نوفمبر 2026 من 17:00 إلى 18:00 (القاعة 1).',
    );
    expect(
      sessionMessage(
        'CANCELLED',
        admin('FEMALE'),
        null,
        lesson,
        'مرض',
        'TEACHER',
      ),
    ).toBe(
      'ألغت المعلمة أحمد بن علي حصة قسم الماهر — فرع المركز: يوم الخميس 5 نوفمبر 2026 من 17:00 إلى 18:00 (القاعة 1)، السبب: مرض.',
    );
    expect(sessionMessage('DELETED', admin('MALE'), null, lesson)).toBe(
      'حذف المسؤول الإداري أحمد بن علي الحصة الإضافية لقسم الماهر — فرع المركز المبرمجة: يوم الخميس 5 نوفمبر 2026 من 17:00 إلى 18:00 (القاعة 1).',
    );
    expect(sessionMessage('DELETED', admin(null), null, lesson)).toBe(
      'حُذفت الحصة الإضافية لقسم الماهر — فرع المركز المبرمجة من طرف أحمد بن علي: يوم الخميس 5 نوفمبر 2026 من 17:00 إلى 18:00 (القاعة 1).',
    );
  });
});
