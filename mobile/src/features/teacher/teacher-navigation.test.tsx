import { router as appRouter } from 'expo-router';
import { act, fireEvent, renderRouter, screen, within } from 'expo-router/testing-library';
import { Alert, StyleSheet } from 'react-native';

import type { SessionState } from '@/features/auth/session';
import type { SessionUser } from '@/features/auth/types';
import { ar } from '@/i18n/ar';
import { formatDateLong } from '@/i18n/format';

import { YEAR_FIXTURE } from './__fixtures__/memorization';
import { notesFixture, notesPage } from './__fixtures__/notes';
import { announcementFixture, announcementPage } from './__fixtures__/announcements';
import { resourceFixture, resourcePage } from './__fixtures__/resources';
import { workPage, workProgram } from './__fixtures__/work';
import { attendanceFixture, pageOf, sessionFixture } from './__fixtures__/sessions';
import { workspaceFixture } from './__fixtures__/workspace';
import { notificationFixture, notificationPage } from '@/features/notifications/__fixtures__/notifications';

/*
 * The REAL route tree (src/app: root Stack.Protected guards + the nested
 * teacher stack). Replaced: fonts/splash/icons (native), the RTL reload,
 * the session state (set per test) and the network (DTO-shaped answers).
 */
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@expo-google-fonts/ibm-plex-sans-arabic', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  hideAsync: jest.fn(async () => true),
  setOptions: jest.fn(),
}));
jest.mock('@/i18n/rtl', () => ({ ensureRTL: jest.fn() }));

let mockState: SessionState;
jest.mock('@/features/auth/auth-provider', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useSession: () => mockState,
  session: { logout: jest.fn(), restore: jest.fn(), changePassword: jest.fn(async () => undefined) },
}));

const person = { id: 'p1', firstName: 'أحمد', lastName: 'السالمي', photoUrl: null, email: null, phone: null };
const user = (over: Partial<SessionUser>): SessionUser => ({
  id: 'u1',
  username: 'ahmed.t',
  person,
  roles: ['TEACHER'],
  mustChangePassword: false,
  teacherId: 't-me',
  studentId: null,
  ...over,
});
const signedIn = (u: SessionUser): SessionState => ({ status: 'signedIn', user: u, endedReason: null, restoreError: null });

const requests: string[] = [];
const methods: string[] = [];
let attendanceEditable = false;
/** A current academic year for the memorization tests (none by default). */
let navYear: unknown = null;
beforeEach(() => {
  requests.length = 0;
  methods.length = 0;
  const answers: [string, unknown][] = [
    ['/platform-preferences', { timezone: 'Africa/Tunis', dateFormat: 'DD/MM/YYYY', defaultCalendarView: 'week', defaultPageSize: 20, currentAcademicYear: null }],
    ['/teacher/workspace', workspaceFixture()],
    // Most specific first: the count, a read, then the list
    ['/notifications/unread-count', { count: 1 }],
    ['/notifications/n1/read', notificationFixture('n1', { entityId: 'r1', isRead: true })],
    ['/notifications', notificationPage([notificationFixture('n1', { entityId: 'r1' })])],
    ['/teacher/notes', notesPage(notesFixture())],
    ['/teacher/announcements/a0', announcementFixture('a0')],
    ['/teacher/announcements', announcementPage([announcementFixture('a0')])],
    ['/teacher/resources/r1', resourceFixture('r1')],
    ['/teacher/resources', resourcePage([resourceFixture('r1')])],
    ['/teacher/work-programs/session-options', [workProgram().session]],
    ['/teacher/work-programs/w1', workProgram()],
    ['/teacher/work-programs', workPage([workProgram()])],
    // Most specific first: a session's details, then the paginated list
    ['/teacher/sessions/s1', sessionFixture('s1', '2099-01-05', '17:00', '19:00')],
    ['/teacher/sessions', pageOf([sessionFixture('s1', '2099-01-05', '17:00', '19:00')])],
    ['/teacher/attendance/summary', { recorded: 0, present: 0, absent: 0, late: 0, excused: 0, attended: 0, eligible: 0, rate: null, from: null, to: null }],
  ];
  globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    requests.push(url);
    methods.push(init?.method ?? 'GET');
    if (url.includes('/platform-preferences'))
      return {
        status: 200,
        ok: true,
        text: async () =>
          JSON.stringify({ timezone: 'Africa/Tunis', dateFormat: 'DD/MM/YYYY', defaultCalendarView: 'week', defaultPageSize: 20, currentAcademicYear: navYear }),
      };
    if (url.includes('/teacher/students/st1/memorization')) return { status: 200, ok: true, text: async () => 'null' };
    // Built per request, so a test can switch the roster to editable
    if (url.includes('/teacher/sessions/s1/attendance'))
      return {
        status: 200,
        ok: true,
        text: async () =>
          JSON.stringify(
            attendanceFixture({ sessionId: 's1', date: '2099-01-05', editable: attendanceEditable, correctable: attendanceEditable }),
          ),
      };
    const hit = answers.find(([path]) => url.includes(path));
    if (!hit) return { status: 404, ok: false, text: async () => '{}' };
    return { status: 200, ok: true, text: async () => JSON.stringify(hit[1]) };
  }) as unknown as typeof fetch;
});

const APP = './src/app';

/** Press, then let the navigation settle. */
async function tap(label: string | RegExp) {
  const target = await screen.findByLabelText(label);
  await fireEvent.press(target);
}

describe('teacher navigation through the real route tree', () => {
  it('dashboard → my classes → a class → a student, and back', async () => {
    mockState = signedIn(user({}));
    const router = await renderRouter(APP, { initialUrl: '/teacher' });
    expect(router).toHavePathname('/teacher');

    await tap(ar.teacher.seeAllClasses);
    expect(router).toHavePathname('/teacher/classes');

    await tap(/^مجموعة الفجر — الفرع الرئيسي/);
    expect(router).toHavePathname('/teacher/classes/c1');

    await tap('محمد التونسي');
    expect(router).toHavePathname('/teacher/students/st1');
    expect(await screen.findByText(ar.student.guardianPhone)).toBeTruthy();

    await act(async () => {
      appRouter.back();
    });
    expect(router).toHavePathname('/teacher/classes/c1');
    // Every screen reads the same cached bundle: one workspace request in total
    expect(requests.filter((u) => u.includes('/teacher/workspace'))).toHaveLength(1);
  });

  it('home → «كل الحصص» → a session, and the bottom tabs switch between modules', async () => {
    mockState = signedIn(user({}));
    const router = await renderRouter(APP, { initialUrl: '/teacher' });

    await tap(ar.sessions.seeAll);
    expect(router).toHavePathname('/teacher/sessions');
    await tap(new RegExp(formatDateLong('2099-01-05')));
    expect(router).toHavePathname('/teacher/sessions/s1');
    expect(await screen.findByText(ar.sessions.team)).toBeTruthy();

    // Session details → its read-only attendance
    await tap(ar.attendance.open);
    expect(router).toHavePathname('/teacher/sessions/s1/attendance');
    expect(await screen.findByText(ar.attendance.notices.notStarted('09:00'))).toBeTruthy();
    await act(async () => {
      appRouter.back();
    });
    expect(router).toHavePathname('/teacher/sessions/s1');

    await act(async () => {
      appRouter.back();
    });
    expect(router).toHavePathname('/teacher/sessions');
    // The tab bar button (Arabic accessibility label = the tab title)
    await tap(ar.tabs.classes);
    expect(router).toHavePathname('/teacher/classes');
  });

  it('unsaved attendance: leaving asks for confirmation and the screen stays', async () => {
    attendanceEditable = true;
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockState = signedIn(user({}));
    const router = await renderRouter(APP, { initialUrl: '/teacher/sessions/s1' });
    await tap(ar.attendance.action.complete); // editable roster, partly recorded
    expect(router).toHavePathname('/teacher/sessions/s1/attendance');
    const group = await screen.findByLabelText(ar.attendance.statusGroup('يوسف التونسي'));
    await fireEvent.press(within(group).getByLabelText(ar.attendance.status.PRESENT));
    await act(async () => {
      appRouter.back();
    });
    expect(alert).toHaveBeenCalledWith(ar.attendance.leaveTitle, ar.attendance.leaveMessage, expect.any(Array));
    expect(router).toHavePathname('/teacher/sessions/s1/attendance');
    // Nothing was sent: selection never submits
    expect(methods.every((m) => m === 'GET')).toBe(true);
    alert.mockRestore();
    attendanceEditable = false;
  });

  it('a confirmed attendance save shows the confirmation, then goes BACK to the session details, refreshed', async () => {
    attendanceEditable = true;
    mockState = signedIn(user({}));
    const router = await renderRouter(APP, { initialUrl: '/teacher/sessions/s1' });
    await tap(ar.attendance.action.complete);
    expect(router).toHavePathname('/teacher/sessions/s1/attendance');
    const group = await screen.findByLabelText(ar.attendance.statusGroup('يوسف التونسي'));
    await fireEvent.press(within(group).getByLabelText(ar.attendance.status.PRESENT));
    const detailsBefore = requests.filter((u) => /\/teacher\/sessions\/s1$/.test(u)).length;
    // renderRouter runs on Jest's fake timers: time is advanced explicitly
    await fireEvent.press(screen.getByLabelText(ar.attendance.save));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(50);
    });
    expect(methods.filter((m) => m === 'PUT')).toHaveLength(1);
    expect(await screen.findByRole('alert', { name: /^تم حفظ/ })).toBeTruthy();
    expect(router).toHavePathname('/teacher/sessions/s1/attendance'); // still reading the confirmation
    // The session details below were refreshed by the save (status / counts from the server)
    expect(requests.filter((u) => /\/teacher\/sessions\/s1$/.test(u)).length).toBeGreaterThan(detailsBefore);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1300);
    });
    expect(router).toHavePathname('/teacher/sessions/s1'); // back through the stack, not a new screen
    expect(methods.filter((m) => m === 'PUT')).toHaveLength(1);
    attendanceEditable = false;
  });

  it('memorization entry points: student profile → «سجل الحفظ», class → «متابعة الحفظ»', async () => {
    mockState = signedIn(user({}));
    const router = await renderRouter(APP, { initialUrl: '/teacher/students/st1' });
    await tap(`${ar.memorization.history} — محمد التونسي`);
    expect(router).toHavePathname('/teacher/students/st1/memorization');
    await act(async () => {
      appRouter.back();
    });
    await act(async () => {
      appRouter.push('/teacher/classes/c1');
    });
    await tap(ar.memorization.open);
    expect(router).toHavePathname('/teacher/memorization');
  });

  it('history → «إضافة متابعة» opens the form for THAT semester', async () => {
    navYear = YEAR_FIXTURE;
    mockState = signedIn(user({}));
    const router = await renderRouter(APP, { initialUrl: '/teacher/students/st1/memorization' });
    await tap(`${ar.memorization.add} — ${ar.labels.semester.SECOND}`);
    expect(router).toHavePathnameWithParams('/teacher/students/st1/memorization/record?semester=SECOND');
    expect(await screen.findByLabelText(ar.memorization.searchLabel)).toBeTruthy();
    navYear = null;
  });

  it('a STUDENT cannot open the memorization form', async () => {
    mockState = signedIn(user({ roles: ['STUDENT'], teacherId: null, studentId: 's1' }));
    const router = await renderRouter(APP, { initialUrl: '/teacher/students/st1/memorization/record' });
    expect(router.getPathname().startsWith('/teacher')).toBe(false);
    expect(requests.some((u) => u.includes('/memorization'))).toBe(false);
  });

  it('a STUDENT cannot open the teacher memorization screens', async () => {
    mockState = signedIn(user({ roles: ['STUDENT'], teacherId: null, studentId: 's1' }));
    const router = await renderRouter(APP, { initialUrl: '/teacher/memorization' });
    expect(router.getPathname().startsWith('/teacher')).toBe(false);
    expect(requests.some((u) => u.includes('/memorization'))).toBe(false);
  });

  it('«جدولي» entry points: dashboard tools and «مجموعاتي»; a slot opens its class', async () => {
    mockState = signedIn(user({}));
    const router = await renderRouter(APP, { initialUrl: '/teacher' });
    await tap(ar.schedule.open);
    expect(router).toHavePathname('/teacher/schedule');
    await tap(/^الأربعاء من 17:00 إلى 19:00/);
    expect(router).toHavePathname('/teacher/classes/c1');
    await act(async () => {
      appRouter.push('/teacher/classes');
    });
    await tap(ar.schedule.open);
    expect(router).toHavePathname('/teacher/schedule');
    expect(methods.every((m) => m === 'GET')).toBe(true);
  });

  it('«ملاحظاتي»: dashboard tools → list → a note → edit, and back', async () => {
    mockState = signedIn(user({}));
    const router = await renderRouter(APP, { initialUrl: '/teacher' });
    await tap(ar.notes.open);
    expect(router).toHavePathname('/teacher/notes');
    await tap(/مراجعة سورة الملك/);
    expect(router).toHavePathname('/teacher/notes/n2');
    await tap(ar.notes.edit);
    expect(router).toHavePathname('/teacher/notes/n2/edit');
    expect((await screen.findByLabelText(ar.notes.field)).props.value).toBe(notesFixture()[0]!.content);
    await act(async () => {
      appRouter.back();
    });
    expect(router).toHavePathname('/teacher/notes/n2');
    await act(async () => {
      appRouter.back();
    });
    await tap(ar.notes.add);
    expect(router).toHavePathname('/teacher/notes/new');
    expect(methods.every((m) => m === 'GET')).toBe(true); // browsing never writes
  });

  it('«متابعة برنامج العمل»: dashboard tools → list → a program → evaluation', async () => {
    mockState = signedIn(user({}));
    const router = await renderRouter(APP, { initialUrl: '/teacher' });
    await tap(ar.work.open);
    expect(router).toHavePathname('/teacher/work');
    await tap(/^برنامج العمل محمد التونسي/);
    expect(router).toHavePathname('/teacher/work/w1');
    await tap(ar.work.evaluate);
    expect(router).toHavePathname('/teacher/work/w1/evaluate');
    expect(methods.every((m) => m === 'GET')).toBe(true);
  });

  it('class details → «برنامج العمل» opens the list filtered by that class', async () => {
    mockState = signedIn(user({}));
    const router = await renderRouter(APP, { initialUrl: '/teacher/classes/c1' });
    await tap(ar.work.classLink);
    expect(router).toHavePathname('/teacher/work');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10);
    });
    expect(requests.some((u) => u.includes('/teacher/work-programs?') && u.includes('groupClassId=c1'))).toBe(true);
  });

  it('«الموارد التعليمية»: dashboard tools → list → a resource; class → «موارد القسم»', async () => {
    mockState = signedIn(user({}));
    const router = await renderRouter(APP, { initialUrl: '/teacher' });
    await tap(ar.resources.open);
    expect(router).toHavePathname('/teacher/resources');
    await tap(/^أحكام النون الساكنة/);
    expect(router).toHavePathname('/teacher/resources/r1');
    expect(await screen.findByLabelText(ar.resources.openFile)).toBeTruthy();
    await act(async () => {
      appRouter.push('/teacher/classes/c1');
    });
    await tap(ar.resources.classLink);
    expect(router).toHavePathname('/teacher/resources');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10);
    });
    expect(requests.some((u) => u.includes('/teacher/resources?') && u.includes('groupClassId=c1'))).toBe(true);
    expect(methods.every((m) => m === 'GET')).toBe(true);
  });

  it('«الإعلانات»: dashboard tools → feed → an announcement (read only when not mine)', async () => {
    mockState = signedIn(user({}));
    const router = await renderRouter(APP, { initialUrl: '/teacher' });
    await tap(ar.announcements.open);
    expect(router).toHavePathname('/teacher/announcements');
    await tap(/^عطلة نهاية السداسي/);
    expect(router).toHavePathname('/teacher/announcements/a0');
    expect(screen.queryByLabelText(ar.announcements.edit)).toBeNull();
    expect(methods.every((m) => m === 'GET')).toBe(true);
  });

  it('«الإشعارات»: the header bell (unread count) → the inbox → a resource notification: read, then the resource', async () => {
    mockState = signedIn(user({}));
    const router = await renderRouter(APP, { initialUrl: '/teacher' });
    await tap(ar.notifications.bellLabel(1));
    expect(router).toHavePathname('/teacher/notifications');
    await tap(new RegExp(`^${ar.notifications.unread}، مورد جديد`));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10);
    });
    expect(router).toHavePathname('/teacher/resources/r1');
    expect(methods.filter((m) => m === 'PATCH')).toHaveLength(1);
    expect(requests.some((u) => u.includes('/notifications/n1/read'))).toBe(true);
  });

  it('a STUDENT cannot open the teacher notifications', async () => {
    mockState = signedIn(user({ roles: ['STUDENT'], teacherId: null, studentId: 's1' }));
    const router = await renderRouter(APP, { initialUrl: '/teacher/notifications' });
    expect(router.getPathname().startsWith('/teacher')).toBe(false);
    expect(requests.some((u) => u.includes('/notifications'))).toBe(false);
  });

  it('dashboard tools: the eight tools (with «متابعة العرضات» and «الملاحظات والاقتراحات»), as an equal two-column grid, each opening its screen', async () => {
    mockState = signedIn(user({}));
    const router = await renderRouter(APP, { initialUrl: '/teacher' });
    const tiles = await screen.findAllByTestId('teacher-tool');
    expect(tiles.map((t) => t.props.accessibilityLabel)).toEqual([
      ar.schedule.open,
      ar.memorization.open,
      ar.work.open,
      ar.work.recitations,
      ar.notes.open,
      ar.resources.open,
      ar.announcements.open,
      ar.feedback.title,
    ]);
    // Same width for every tile (two per row)
    expect(new Set(tiles.map((t) => StyleSheet.flatten(t.props.style).width))).toEqual(new Set(['48.5%']));
    expect(screen.queryByText(ar.teacher.comingSoon)).toBeNull();
    await fireEvent.press(tiles[2]!);
    expect(router).toHavePathname('/teacher/work');
    const again = await renderRouter(APP, { initialUrl: '/teacher' });
    await fireEvent.press((await screen.findAllByTestId('teacher-tool'))[3]!);
    expect(again).toHavePathname('/teacher/recitations');
    expect((await screen.findAllByText(ar.work.recitationsPick)).length).toBeGreaterThan(0);
    // «الملاحظات والاقتراحات»: the shared feedback screens, for the teacher workspace
    const third = await renderRouter(APP, { initialUrl: '/teacher' });
    await fireEvent.press((await screen.findAllByTestId('teacher-tool'))[7]!);
    expect(third).toHavePathname('/feedback');
    expect(third).toHaveSearchParams({ space: 'teacher' });
    expect(await screen.findByText(ar.feedback.mine)).toBeTruthy();
  });

  it('logout moved to «حسابي» (header button): confirmation first, then the EXISTING session logout', async () => {
    mockState = signedIn(user({}));
    const { session } = jest.requireMock('@/features/auth/auth-provider') as { session: { logout: jest.Mock } };
    session.logout.mockClear();
    const router = await renderRouter(APP, { initialUrl: '/teacher' });
    await screen.findAllByTestId('teacher-tool');
    // No logout button on the dashboard anymore
    expect(screen.queryByLabelText(ar.auth.logout)).toBeNull();
    await tap(ar.account.open);
    expect(router).toHavePathname('/teacher/account');
    expect(await screen.findByText('ahmed.t')).toBeTruthy();
    let alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === 'cancel')?.onPress?.());
    await tap(ar.auth.logout);
    expect(alert).toHaveBeenCalledWith(ar.auth.logoutConfirmTitle, ar.auth.logoutConfirmMessage, expect.any(Array));
    expect(session.logout).not.toHaveBeenCalled();
    alert.mockRestore();
    alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === 'destructive')?.onPress?.());
    await tap(ar.auth.logout);
    expect(session.logout).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });

  it('«حسابي» → «تغيير كلمة المرور»: a confirmed change shows the confirmation, then back to the account', async () => {
    mockState = signedIn(user({}));
    const { session } = jest.requireMock('@/features/auth/auth-provider') as { session: { changePassword: jest.Mock } };
    session.changePassword.mockClear();
    const router = await renderRouter(APP, { initialUrl: '/teacher/account' });
    await tap(ar.auth.changePasswordTitle);
    expect(router).toHavePathname('/teacher/password');
    await fireEvent.changeText(await screen.findByLabelText(ar.auth.currentPassword), 'old-password-1');
    await fireEvent.changeText(screen.getByLabelText(ar.auth.newPassword), 'new-password-1');
    await fireEvent.changeText(screen.getByLabelText(ar.auth.confirmPassword), 'new-password-1');
    await tap(ar.auth.saveChanges);
    expect(session.changePassword).toHaveBeenCalledWith('old-password-1', 'new-password-1');
    expect(await screen.findByRole('alert', { name: ar.auth.passwordChanged })).toBeTruthy();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1300);
    });
    expect(router).toHavePathname('/teacher/account');
  });

  it('announcements: «إعلان جديد» opens the creation form for an eligible teacher; nothing is sent by opening it', async () => {
    mockState = signedIn(user({}));
    const router = await renderRouter(APP, { initialUrl: '/teacher/announcements' });
    await tap(ar.announcements.add);
    expect(router).toHavePathname('/teacher/announcements/new');
    expect(await screen.findByLabelText(ar.announcements.titleLabel)).toBeTruthy();
    // No default audience: my class is offered, not selected
    expect(screen.getByRole('checkbox', { name: 'مجموعة الفجر' }).props.accessibilityState.checked).toBe(false);
    expect(methods.every((m) => m === 'GET')).toBe(true);
  });

  it('a STUDENT cannot open the teacher announcements', async () => {
    mockState = signedIn(user({ roles: ['STUDENT'], teacherId: null, studentId: 's1' }));
    const router = await renderRouter(APP, { initialUrl: '/teacher/announcements/a0' });
    expect(router.getPathname().startsWith('/teacher')).toBe(false);
    expect(requests.some((u) => u.includes('/teacher/announcements'))).toBe(false);
  });

  it('a STUDENT cannot open the teacher resources', async () => {
    mockState = signedIn(user({ roles: ['STUDENT'], teacherId: null, studentId: 's1' }));
    const router = await renderRouter(APP, { initialUrl: '/teacher/resources/r1' });
    expect(router.getPathname().startsWith('/teacher')).toBe(false);
    expect(requests.some((u) => u.includes('/teacher/resources'))).toBe(false);
  });

  it('a STUDENT cannot open the teacher work programs', async () => {
    mockState = signedIn(user({ roles: ['STUDENT'], teacherId: null, studentId: 's1' }));
    const router = await renderRouter(APP, { initialUrl: '/teacher/work/w1' });
    expect(router.getPathname().startsWith('/teacher')).toBe(false);
    expect(requests.some((u) => u.includes('/work-programs'))).toBe(false);
  });

  it('a STUDENT cannot open the teacher notes', async () => {
    mockState = signedIn(user({ roles: ['STUDENT'], teacherId: null, studentId: 's1' }));
    const router = await renderRouter(APP, { initialUrl: '/teacher/notes/n2' });
    expect(router.getPathname().startsWith('/teacher')).toBe(false);
    expect(requests.some((u) => u.includes('/teacher/notes'))).toBe(false);
  });

  it('a STUDENT cannot open the teacher schedule', async () => {
    mockState = signedIn(user({ roles: ['STUDENT'], teacherId: null, studentId: 's1' }));
    const router = await renderRouter(APP, { initialUrl: '/teacher/schedule' });
    expect(router.getPathname().startsWith('/teacher')).toBe(false);
    expect(requests.some((u) => u.includes('/teacher/'))).toBe(false);
  });

  it('a teacher lands on the teacher space from "/"', async () => {
    mockState = signedIn(user({}));
    const router = await renderRouter(APP, { initialUrl: '/' });
    expect(router).toHavePathname('/teacher');
  });

  it('a STUDENT cannot open a teacher class link (guarded route)', async () => {
    mockState = signedIn(user({ roles: ['STUDENT'], teacherId: null, studentId: 's1' }));
    const router = await renderRouter(APP, { initialUrl: '/teacher/classes/c1' });
    expect(router.getPathname().startsWith('/teacher')).toBe(false);
    expect(requests.some((u) => u.includes('/teacher/'))).toBe(false);
  });

  it('a TEACHER role without a linked teacher profile cannot open the teacher space', async () => {
    mockState = signedIn(user({ teacherId: null }));
    const router = await renderRouter(APP, { initialUrl: '/teacher/classes' });
    expect(router.getPathname().startsWith('/teacher')).toBe(false);
  });

  it('signed out: a teacher link leads to the login screen', async () => {
    mockState = { status: 'signedOut', user: null, endedReason: null, restoreError: null };
    const router = await renderRouter(APP, { initialUrl: '/teacher/students/st1' });
    expect(router).toHavePathname('/login');
    expect(requests.some((u) => u.includes('/teacher/'))).toBe(false);
  });

  it('temporary password: only the change-password screen, even from a teacher link', async () => {
    mockState = signedIn(user({ mustChangePassword: true }));
    const router = await renderRouter(APP, { initialUrl: '/teacher/classes' });
    expect(router).toHavePathname('/change-password');
  });
});
