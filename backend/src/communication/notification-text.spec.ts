import {
  actorSentence,
  classNameAr,
  type NotificationActor,
  onboardingSubmissionMessage,
  registrationRequestMessage,
  sessionClassesAr,
  sessionWhenAr,
  studentNamesAr,
} from './notification-text.js';

const actor = (gender: NotificationActor['gender']): NotificationActor => ({
  userId: 'u1',
  name: 'أحمد بن علي',
  gender,
});
const forms = {
  male: (who: string) => `نشر ${who} موردًا`,
  female: (who: string) => `نشرت ${who} موردًا`,
  passive: (by: string) => `نُشر مورد ${by}`,
};

describe('notification wording', () => {
  it('names the actor with a title and verb agreeing with their gender', () => {
    expect(actorSentence(actor('MALE'), 'TEACHER', forms)).toBe(
      'نشر المعلم أحمد بن علي موردًا',
    );
    expect(actorSentence(actor('FEMALE'), 'TEACHER', forms)).toBe(
      'نشرت المعلمة أحمد بن علي موردًا',
    );
    expect(actorSentence(actor('MALE'), 'ADMIN', forms)).toBe(
      'نشر المسؤول الإداري أحمد بن علي موردًا',
    );
    expect(actorSentence(actor('FEMALE'), 'ADMIN', forms)).toBe(
      'نشرت المسؤولة الإدارية أحمد بن علي موردًا',
    );
  });

  it('without a known gender, still names them (passive form, no title)', () => {
    expect(actorSentence(actor(null), 'ADMIN', forms)).toBe(
      'نُشر مورد من طرف أحمد بن علي',
    );
  });

  it('lists at most three students, then how many more', () => {
    expect(studentNamesAr(['أ'])).toBe('أ');
    expect(studentNamesAr(['أ', 'ب', 'ج'])).toBe('أ، ب، ج');
    expect(studentNamesAr(['أ', 'ب', 'ج', 'د'])).toBe('أ، ب، ج وطالب آخر');
    expect(studentNamesAr(['أ', 'ب', 'ج', 'د', 'ه'])).toBe(
      'أ، ب، ج وطالبان آخران',
    );
    expect(studentNamesAr(['أ', 'ب', 'ج', 'د', 'ه', 'و', 'ز', 'ح'])).toBe(
      'أ، ب، ج و5 طلبة آخرين',
    );
  });

  it('says when a session takes place: weekday, date and times', () => {
    // 2026-11-05 is a Thursday
    expect(sessionWhenAr('2026-11-05', '17:00', '18:30')).toBe(
      'يوم الخميس 5 نوفمبر 2026 من 17:00 إلى 18:30',
    );
  });

  it('names a session’s classes by group and branch (a shared branch once)', () => {
    expect(sessionClassesAr([{ group: 'الماهر', branch: 'المركز' }])).toBe(
      'الماهر — المركز',
    );
    expect(
      sessionClassesAr([
        { group: 'الماهر', branch: 'المركز' },
        { group: 'النور', branch: 'المركز' },
      ]),
    ).toBe('الماهر + النور — المركز');
    expect(
      sessionClassesAr([
        { group: 'الماهر', branch: 'المركز' },
        { group: 'النور', branch: 'الشاطئ' },
      ]),
    ).toBe('الماهر — المركز + النور — الشاطئ');
  });

  it('a public registration request names the applicant (and the group asked for)', () => {
    expect(
      registrationRequestMessage({ firstName: 'سلمى', lastName: 'المؤدب' }),
    ).toBe('وصل طلب تسجيل جديد من الموقع باسم سلمى المؤدب.');
    expect(
      registrationRequestMessage({
        firstName: 'سلمى',
        lastName: 'المؤدب',
        group: 'الماهر',
      }),
    ).toBe('وصل طلب تسجيل جديد من الموقع باسم سلمى المؤدب، للمجموعة: الماهر.');
  });

  it('an onboarding submission says who sent it, agreeing with the student’s gender', () => {
    const base = {
      firstName: 'سلمى',
      lastName: 'المؤدب',
      className: classNameAr({ group: 'الماهر', branch: 'المركز' }),
    };
    expect(
      onboardingSubmissionMessage({
        ...base,
        submittedBy: 'STUDENT',
        gender: 'FEMALE',
      }),
    ).toBe(
      'أرسلت الطالبة سلمى المؤدب بياناتها عبر رابط الاستكمال لقسم الماهر — المركز.',
    );
    expect(
      onboardingSubmissionMessage({
        ...base,
        submittedBy: 'STUDENT',
        gender: 'MALE',
      }),
    ).toBe(
      'أرسل الطالب سلمى المؤدب بياناته عبر رابط الاستكمال لقسم الماهر — المركز.',
    );
    expect(
      onboardingSubmissionMessage({
        ...base,
        submittedBy: 'GUARDIAN',
        gender: 'FEMALE',
      }),
    ).toBe(
      'أرسل وليّ أمر الطالبة سلمى المؤدب بياناتها عبر رابط الاستكمال لقسم الماهر — المركز.',
    );
  });
});
