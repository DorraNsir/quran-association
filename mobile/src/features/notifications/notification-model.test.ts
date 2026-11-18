import { ar } from '@/i18n/ar';
import { ltr } from '@/i18n/format';

import { notificationFixture, notificationPage } from './__fixtures__/notifications';
import {
  badgeLabel,
  formatNotificationTime,
  markPagesRead,
  notificationIcon,
  patchPages,
  teacherNotificationTarget,
} from './notification-model';
import { notificationListKey, notificationsKey, unreadCountKey } from './use-notifications';

const t = ar.notifications;
const TZ = 'Africa/Tunis'; // UTC+1, no DST

describe('badge', () => {
  it('hidden at 0 (and for nonsense), the number up to 99, then «99+»', () => {
    expect(badgeLabel(0)).toBeNull();
    expect(badgeLabel(-3)).toBeNull();
    expect(badgeLabel(Number.NaN)).toBeNull();
    expect(badgeLabel(1)).toBe('1');
    expect(badgeLabel(99)).toBe('99');
    expect(badgeLabel(100)).toBe('99+');
    expect(badgeLabel(4321)).toBe('99+');
  });
});

describe('icons (as the web bell)', () => {
  it('by subject; a lesson change shows the calendar; unknown → the bell', () => {
    expect(notificationIcon({ type: 'RESOURCE_PUBLISHED', entityType: 'RESOURCE' })).toBe('resources');
    expect(notificationIcon({ type: 'ANNOUNCEMENT_PUBLISHED', entityType: 'ANNOUNCEMENT' })).toBe('announcements');
    expect(notificationIcon({ type: 'ATTENDANCE_MODIFIED', entityType: 'SESSION' })).toBe('attendance');
    expect(notificationIcon({ type: 'SESSION_CHANGED', entityType: 'SESSION' })).toBe('calendar');
    expect(notificationIcon({ type: 'STUDENT_JOINED_CLASS', entityType: 'STUDENT' })).toBe('student');
    expect(notificationIcon({ type: 'CLASS_CHANGED', entityType: 'GROUP_CLASS' })).toBe('classes');
    expect(notificationIcon({ type: 'GROUP_CHANGED', entityType: 'GROUP' })).toBe('students');
    expect(notificationIcon({ type: 'SOMETHING_NEW', entityType: null })).toBe('bell');
  });
});

describe('Arabic timestamps (platform timezone)', () => {
  const now = new Date('2026-11-18T13:30:00.000Z'); // 14:30 in Tunis
  const at = (iso: string) => formatNotificationTime(iso, now, TZ);
  it('within the hour: «الآن», then minutes with Arabic number agreement', () => {
    expect(at('2026-11-18T13:29:40.000Z')).toBe(t.time.now);
    expect(at('2026-11-18T13:29:00.000Z')).toBe('منذ دقيقة');
    expect(at('2026-11-18T13:28:00.000Z')).toBe('منذ دقيقتين');
    expect(at('2026-11-18T13:25:00.000Z')).toBe('منذ 5 دقائق');
    expect(at('2026-11-18T13:15:00.000Z')).toBe('منذ 15 دقيقة');
  });
  it('today / yesterday with the Tunis time; older: the day (the year only when different)', () => {
    expect(at('2026-11-18T08:05:00.000Z')).toBe(t.time.today(ltr('09:05')));
    // 23:30 UTC on the 17th is already the 18th in Tunis
    expect(at('2026-11-17T23:30:00.000Z')).toBe(t.time.today(ltr('00:30')));
    expect(at('2026-11-17T08:00:00.000Z')).toBe(t.time.yesterday(ltr('09:00')));
    expect(at('2026-11-10T07:00:00.000Z')).toBe(t.time.on('10 نوفمبر', ltr('08:00')));
    expect(at('2025-12-31T10:00:00.000Z')).toBe(t.time.on('31 ديسمبر 2025', ltr('11:00')));
  });
  it('yesterday across a month boundary; an invalid date shows nothing', () => {
    const first = new Date('2026-12-01T10:00:00.000Z');
    expect(formatNotificationTime('2026-11-30T10:00:00.000Z', first, TZ)).toBe(t.time.yesterday(ltr('11:00')));
    expect(formatNotificationTime('not a date', now, TZ)).toBe('');
  });
});

describe('teacher navigation mapping (verified mobile screens only)', () => {
  const target = (entityType: string | null, type = 'X', extra = {}) =>
    teacherNotificationTarget({ type, entityType, entityId: 'e1', available: true, ...extra });
  it('resource, announcement, session (attendance change → its attendance), student, class, group', () => {
    expect(target('RESOURCE')).toEqual({ kind: 'open', href: { pathname: '/teacher/resources/[id]', params: { id: 'e1' } }, check: { kind: 'resource', id: 'e1' } });
    expect(target('ANNOUNCEMENT')).toEqual({
      kind: 'open',
      href: { pathname: '/teacher/announcements/[id]', params: { id: 'e1' } },
      check: { kind: 'announcement', id: 'e1' },
    });
    expect(target('SESSION', 'SESSION_CHANGED')).toMatchObject({ href: { pathname: '/teacher/sessions/[id]' }, check: { kind: 'session' } });
    expect(target('SESSION', 'ATTENDANCE_MODIFIED')).toMatchObject({ href: { pathname: '/teacher/sessions/[id]/attendance' } });
    expect(target('STUDENT')).toMatchObject({ href: { pathname: '/teacher/students/[id]' }, check: { kind: 'workspace', list: 'students' } });
    expect(target('GROUP_CLASS')).toMatchObject({ href: { pathname: '/teacher/classes/[id]' }, check: { kind: 'workspace', list: 'groupClasses' } });
    expect(target('GROUP')).toEqual({ kind: 'open', href: '/teacher/classes', check: { kind: 'workspace', list: 'groups', id: 'e1' } });
  });
  it('admin-only subjects and types this version does not know: unsupported', () => {
    expect(target('REGISTRATION_REQUEST')).toEqual({ kind: 'unsupported' });
    expect(target('ONBOARDING_SUBMISSION')).toEqual({ kind: 'unsupported' });
    expect(target('A_FUTURE_ENTITY')).toEqual({ kind: 'unsupported' });
  });
  it('deleted content → gone; nothing linked → none', () => {
    expect(target('RESOURCE', 'RESOURCE_PUBLISHED', { available: false })).toEqual({ kind: 'gone' });
    expect(target(null)).toEqual({ kind: 'none' });
    expect(teacherNotificationTarget({ type: 'X', entityType: 'RESOURCE', entityId: null, available: true })).toEqual({ kind: 'none' });
  });
});

describe('cache', () => {
  it('keys are per ACCOUNT: two users never share a count or a list', () => {
    expect(unreadCountKey('u1')).not.toEqual(unreadCountKey('u2'));
    expect(notificationListKey('u1', false)).not.toEqual(notificationListKey('u2', false));
    expect(notificationListKey('u1', true).slice(0, 2)).toEqual(notificationsKey('u1'));
  });
  it('patchPages puts the server answer in place; markPagesRead reads every loaded row', () => {
    const data = { pages: [notificationPage([notificationFixture('n1'), notificationFixture('n2')])], pageParams: [1] };
    const saved = notificationFixture('n1', { isRead: true });
    const patched = patchPages(data, saved)!;
    expect(patched.pages[0]!.data.map((n) => n.isRead)).toEqual([true, false]);
    expect(markPagesRead(data, '2026-11-18T12:00:00.000Z')!.pages[0]!.data.every((n) => n.isRead && n.readAt)).toBe(true);
    expect(patchPages(undefined, saved)).toBeUndefined();
  });
});
