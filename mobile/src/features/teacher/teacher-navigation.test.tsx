import { router as appRouter } from 'expo-router';
import { act, fireEvent, renderRouter, screen, within } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import type { SessionState } from '@/features/auth/session';
import type { SessionUser } from '@/features/auth/types';
import { ar } from '@/i18n/ar';
import { formatDateLong } from '@/i18n/format';

import { attendanceFixture, pageOf, sessionFixture } from './__fixtures__/sessions';
import { workspaceFixture } from './__fixtures__/workspace';

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
}));
jest.mock('@/i18n/rtl', () => ({ ensureRTL: jest.fn() }));

let mockState: SessionState;
jest.mock('@/features/auth/auth-provider', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useSession: () => mockState,
  session: { logout: jest.fn(), restore: jest.fn() },
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
beforeEach(() => {
  requests.length = 0;
  methods.length = 0;
  const answers: [string, unknown][] = [
    ['/platform-preferences', { timezone: 'Africa/Tunis', dateFormat: 'DD/MM/YYYY', defaultCalendarView: 'week', defaultPageSize: 20, currentAcademicYear: null }],
    ['/teacher/workspace', workspaceFixture()],
    // Most specific first: a session's details, then the paginated list
    ['/teacher/sessions/s1', sessionFixture('s1', '2099-01-05', '17:00', '19:00')],
    ['/teacher/sessions', pageOf([sessionFixture('s1', '2099-01-05', '17:00', '19:00')])],
    ['/teacher/attendance/summary', { recorded: 0, present: 0, absent: 0, late: 0, excused: 0, attended: 0, eligible: 0, rate: null, from: null, to: null }],
  ];
  globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    requests.push(url);
    methods.push(init?.method ?? 'GET');
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
    await tap(ar.attendance.open);
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
