import {
  joinedMessage,
  leftByStatusMessage,
  leftByTransferMessage,
  reactivatedMessage,
  studentWords,
  transferredMessage,
} from './class-membership-notifications.js';
import type { NotificationActor } from './notification-text.js';

const admin = (gender: NotificationActor['gender']): NotificationActor => ({
  userId: 'u1',
  name: 'أحمد بن علي',
  gender,
});
const sami = studentWords('سامي القاسمي', 'MALE');
const hind = studentWords('هند الطرابلسي', 'FEMALE');
const A = 'الماهر — فرع المركز';
const B = 'الأرقم — فرع المركز';

describe('class membership wording', () => {
  it('joining: what the admin did, agreeing with both genders', () => {
    expect(joinedMessage(admin('MALE'), sami, A, 'DIRECT')).toBe(
      'أضاف المسؤول الإداري أحمد بن علي الطالب سامي القاسمي إلى قسم الماهر — فرع المركز.',
    );
    expect(joinedMessage(admin('FEMALE'), hind, A, 'REGISTRATION')).toBe(
      'قبلت المسؤولة الإدارية أحمد بن علي طلب تسجيل الطالبة هند الطرابلسي وأضافتها إلى قسم الماهر — فرع المركز.',
    );
    expect(joinedMessage(admin(null), hind, A, 'ONBOARDING')).toBe(
      'اعتُمدت بيانات الطالبة هند الطرابلسي وأُضيفت إلى قسم الماهر — فرع المركز من طرف أحمد بن علي.',
    );
  });

  it('without an actor (an automated path) nobody is named', () => {
    expect(joinedMessage(null, hind, A, 'DIRECT')).toBe(
      'انضمت الطالبة هند الطرابلسي إلى قسم الماهر — فرع المركز.',
    );
    expect(transferredMessage(null, sami, A, B)).toBe(
      'انتقل الطالب سامي القاسمي من قسم الماهر — فرع المركز إلى قسم الأرقم — فرع المركز.',
    );
    expect(leftByTransferMessage(null, hind, A)).toBe(
      'غادرت الطالبة هند الطرابلسي قسم الماهر — فرع المركز بعد نقلها.',
    );
  });

  it('moving and leaving', () => {
    expect(transferredMessage(admin(null), hind, A, B)).toBe(
      'نُقلت الطالبة هند الطرابلسي من قسم الماهر — فرع المركز إلى قسم الأرقم — فرع المركز من طرف أحمد بن علي.',
    );
    expect(leftByTransferMessage(admin('FEMALE'), sami, A)).toBe(
      'غادر الطالب سامي القاسمي قسم الماهر — فرع المركز بعد نقله من طرف المسؤولة الإدارية أحمد بن علي.',
    );
    expect(leftByStatusMessage(admin('MALE'), hind, A, 'ARCHIVED')).toBe(
      'أرشف المسؤول الإداري أحمد بن علي الطالبة هند الطرابلسي، فلم تعد ضمن طلبة قسم الماهر — فرع المركز.',
    );
    expect(reactivatedMessage(admin('FEMALE'), hind, A)).toBe(
      'أعادت المسؤولة الإدارية أحمد بن علي تفعيل الطالبة هند الطرابلسي في قسم الماهر — فرع المركز.',
    );
    expect(reactivatedMessage(null, sami, A)).toBe(
      'أُعيد تفعيل الطالب سامي القاسمي في قسم الماهر — فرع المركز.',
    );
    expect(leftByStatusMessage(admin(null), sami, A, 'INACTIVE')).toBe(
      'أُوقف نشاط الطالب سامي القاسمي في قسم الماهر — فرع المركز من طرف أحمد بن علي.',
    );
  });
});
