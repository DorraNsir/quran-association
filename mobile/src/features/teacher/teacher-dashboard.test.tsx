import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { SessionUser } from '@/features/auth/types';
import { ar } from '@/i18n/ar';
import { formatCountOf, formatDateLong, formatPercent } from '@/i18n/format';

import { pageOf, sessionFixture } from './__fixtures__/sessions';
import { platformClock } from './dashboard-model';
import { TeacherDashboard } from './teacher-dashboard';

/*
 * Dashboard states against stubbed HTTP answers shaped like the backend
 * DTOs. Only native modules / navigation and the network are replaced; the
 * real hooks, API client and mapping run.
 */
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useFocusEffect: jest.fn(),
}));

const USER: SessionUser = {
  id: 'u1',
  username: 'ahmed.t',
  person: { id: 'p1', firstName: 'أحمد', lastName: 'السالمي', photoUrl: null, email: null, phone: null },
  roles: ['TEACHER'],
  mustChangePassword: false,
  teacherId: 't-me',
  studentId: null,
};
jest.mock('@/features/auth/auth-provider', () => ({
  useSession: () => ({ status: 'signedIn', user: USER, endedReason: null, restoreError: null }),
  session: { logout: jest.fn() },
}));

const YEAR = {
  id: '0190a000-0000-7000-8000-000000000001',
  label: '2026-2027',
  startDate: '2026-09-15',
  endDate: '2027-06-30',
  firstSemester: { startDate: '2026-09-15', endDate: '2027-01-31' },
  secondSemester: { startDate: '2027-02-01', endDate: '2027-06-30' },
};

const WORKSPACE = {
  teacher: { id: 't-me', firstName: 'أحمد', lastName: 'السالمي', photoUrl: null, status: 'ACTIVE', joinedAt: '2024-09-01' },
  branches: [{ id: 'b1', name: 'الفرع الرئيسي', status: 'ACTIVE' }],
  rooms: [{ id: 'r1', branchId: 'b1', name: 'قاعة 1' }],
  groups: [{ id: 'g1', name: 'مجموعة الفجر', status: 'ACTIVE' }],
  groupClasses: [{ id: 'c1', groupId: 'g1', branchId: 'b1', supervisorId: 't-me', assistantIds: [], status: 'ACTIVE' }],
  teachers: [],
  schedules: [],
  students: [
    { id: 's1', groupClassId: 'c1', status: 'ACTIVE' },
    { id: 's2', groupClassId: 'c1', status: 'ACTIVE' },
  ],
};

// A full SessionDto (shared fixture) — the API always sends every field
const TODAY = platformClock('Africa/Tunis').today;
// «حصص اليوم»: every status of the day; «الحصة القادمة» only when today is empty
const TODAY_PAGE = pageOf(
  [
    sessionFixture('sess-1', TODAY, '17:00', '19:00'),
    sessionFixture('sess-0', TODAY, '08:00', '09:00', { status: 'CANCELLED', cancellationReason: 'عطلة' }),
  ],
  1,
  50,
);
const NEXT_PAGE = pageOf([sessionFixture('sess-2', '2099-01-05', '17:00', '19:00')], 1, 1);
const EMPTY_PAGE = { data: [], meta: { page: 1, pageSize: 50, total: 0, totalPages: 1 } };

type Route = { status: number; body?: unknown } | 'offline' | 'pending';
type Routes = Record<string, Route>;

const calls: string[] = [];
function stubApi(overrides: Routes = {}) {
  const routes: Routes = {
    '/platform-preferences': {
      status: 200,
      body: { timezone: 'Africa/Tunis', dateFormat: 'DD/MM/YYYY', defaultCalendarView: 'week', defaultPageSize: 20, currentAcademicYear: YEAR },
    },
    '/teacher/workspace': { status: 200, body: WORKSPACE },
    'status=COMPLETED': { status: 200, body: { data: [], meta: { page: 1, pageSize: 1, total: 12, totalPages: 12 } } },
    'pageSize=50': { status: 200, body: TODAY_PAGE },
    'status=SCHEDULED': { status: 200, body: NEXT_PAGE },
    '/teacher/attendance/summary': {
      status: 200,
      body: { recorded: 10, present: 7, absent: 2, late: 1, excused: 0, attended: 8, eligible: 10, rate: 80, from: null, to: null },
    },
    '/memorization': {
      status: 200,
      body: {
        groupClass: { id: 'c1', group: { id: 'g1', name: 'مجموعة الفجر' } },
        academicYear: { id: YEAR.id, label: YEAR.label },
        semester: 'FIRST',
        period: { from: '2026-09-15', to: '2027-01-31' },
        students: [
          { studentId: 's1', studentStatus: 'ACTIVE', currentMember: true, lastMemorizedSurahNumber: 78 },
          { studentId: 's2', studentStatus: 'ACTIVE', currentMember: true, lastMemorizedSurahNumber: null },
        ],
      },
    },
    ...overrides,
  };
  calls.length = 0;
  globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) throw new Error(`unexpected request ${url}`);
    const route = routes[key]!;
    if (route === 'offline') throw new TypeError('Network request failed');
    // Never answers, but honours cancellation like a real fetch
    if (route === 'pending')
      return new Promise((_, reject) =>
        init?.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })),
        ),
      );
    return {
      status: route.status,
      ok: route.status >= 200 && route.status < 300,
      text: async () => (route.body === undefined ? '' : JSON.stringify(route.body)),
    };
  }) as unknown as typeof fetch;
  return routes;
}

const clients: QueryClient[] = [];

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  return render(<TeacherDashboard />, { wrapper });
}

const t = ar.teacher;

describe('TeacherDashboard', () => {
  // Inner hook: runs before the testing library unmounts — no answer may land after the test
  afterEach(async () => {
    await act(async () => {
      for (const client of clients.splice(0)) {
        await client.cancelQueries();
        client.clear();
      }
    });
  });

  it('shows the real data of every section', async () => {
    stubApi();
    await renderDashboard();
    expect(await screen.findByText(`${t.welcome} أحمد`)).toBeTruthy();
    expect(await screen.findByLabelText(`${t.completedSessions}: 12`)).toBeTruthy();
    expect(screen.getByLabelText(`${t.myClasses}: 1`)).toBeTruthy();
    expect(screen.getByLabelText(`${t.myStudents}: 2`)).toBeTruthy();
    expect(await screen.findByText(formatPercent(80))).toBeTruthy();
    expect(screen.getByText(`${t.attended} ${formatCountOf(8, 10)} ${t.countedSessions}`)).toBeTruthy();
    expect(await screen.findByText(t.memorizationMissing(1))).toBeTruthy();
    expect(screen.getByText(formatCountOf(1, 2))).toBeTruthy();
    expect(screen.getAllByText('مجموعة الفجر').length).toBeGreaterThan(0);
    // The memorization card no longer shows the «year · semester» aside (removed in the UI); the semester is still sent below
    // The upcoming session's full Arabic date (platform calendar day, not numeric)
    // Today's lessons, all statuses (a cancelled one too); no «next» request needed
    expect(screen.getByText(t.todayTitle)).toBeTruthy();
    expect(screen.getAllByLabelText(new RegExp(formatDateLong(TODAY)))).toHaveLength(2);
    expect(screen.getByText(`${ar.sessions.cancellationReason}: عطلة`)).toBeTruthy();
    expect(calls.some((u) => u.includes('status=SCHEDULED'))).toBe(false);
    // The upcoming list is requested from today, SCHEDULED, ascending
    expect(
      calls.some((u) => u.includes(`/teacher/sessions?from=${TODAY}&to=${TODAY}&order=asc`) && !u.includes('status=')),
    ).toBe(true);
    expect(calls.some((u) => u.includes(`/teacher/attendance/summary?academicYearId=${YEAR.id}`))).toBe(true);
    // The API's semester values (FIRST / SECOND) — «SEMESTER_1» is refused by the backend
    expect(calls.some((u) => u.includes('/memorization?') && u.includes('semester=FIRST'))).toBe(true);
    expect(calls.some((u) => u.includes('SEMESTER_1'))).toBe(false);
  });

  it('loading state while the API has not answered', async () => {
    stubApi({ '/teacher/workspace': 'pending', 'status=COMPLETED': 'pending' });
    await renderDashboard();
    // Sections are independent: the others finish while these keep loading
    expect(await screen.findByText(formatPercent(80))).toBeTruthy();
    expect((await screen.findAllByText('قاعة 1 — الفرع الرئيسي')).length).toBe(2); // today's two lessons
    expect(screen.getAllByLabelText(ar.states.loading).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText(`${t.myClasses}: 0`)).toBeNull(); // never a fake zero while loading
  });

  it('403 (e.g. TEACHER_INACTIVE): access message, no retry, other sections still shown', async () => {
    stubApi({
      '/teacher/workspace': { status: 403, body: { code: 'TEACHER_INACTIVE', message: 'حساب المعلم غير نشط' } },
    });
    await renderDashboard();
    expect((await screen.findAllByText(ar.states.forbiddenTitle)).length).toBeGreaterThan(0);
    expect(screen.getAllByText('حساب المعلم غير نشط').length).toBeGreaterThan(0);
    expect(await screen.findByText(formatPercent(80))).toBeTruthy();
    expect(screen.queryByText(ar.states.retry)).toBeNull();
  });

  it('offline: Arabic offline message with a retry that refetches', async () => {
    const routes = stubApi({ '/teacher/attendance/summary': 'offline' });
    await renderDashboard();
    expect(await screen.findByText(ar.states.offlineTitle)).toBeTruthy();
    expect(await screen.findByText(t.memorizationMissing(1))).toBeTruthy(); // the rest still loads
    routes['/teacher/attendance/summary'] = {
      status: 200,
      body: { recorded: 4, present: 4, absent: 0, late: 0, excused: 0, attended: 4, eligible: 4, rate: 100, from: null, to: null },
    };
    // The retry and its answer happen inside one act() scope
    await fireEvent.press(screen.getByLabelText(ar.states.retry));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.getByText(formatPercent(100))).toBeTruthy();
    expect(screen.queryByText(ar.states.offlineTitle)).toBeNull();
  });

  it('server error: generic error state with retry', async () => {
    stubApi({ 'pageSize=50': { status: 500, body: { message: 'Internal server error' } } });
    await renderDashboard();
    expect(await screen.findByText(ar.states.errorTitle)).toBeTruthy();
    expect(screen.getByLabelText(ar.states.retry)).toBeTruthy();
  });

  it('empty states: no classes, no lesson today (→ the next one), no recorded attendance', async () => {
    stubApi({
      '/teacher/workspace': { status: 200, body: { ...WORKSPACE, groupClasses: [], students: [] } },
      'pageSize=50': { status: 200, body: EMPTY_PAGE },
      '/teacher/attendance/summary': {
        status: 200,
        body: { recorded: 0, present: 0, absent: 0, late: 0, excused: 0, attended: 0, eligible: 0, rate: null, from: null, to: null },
      },
    });
    await renderDashboard();
    expect(await screen.findByText(t.todayEmpty)).toBeTruthy();
    // No lesson today: the next one is shown (one small request, only now)
    expect(await screen.findByText(t.nextSession)).toBeTruthy();
    expect(screen.getByLabelText(new RegExp(formatDateLong('2099-01-05')))).toBeTruthy();
    expect(calls.filter((u) => u.includes('status=SCHEDULED') && u.includes('pageSize=1'))).toHaveLength(1);
    expect((await screen.findAllByText(t.classesEmpty)).length).toBeGreaterThan(0);
    expect(await screen.findByText(t.attendanceEmpty)).toBeTruthy();
    expect(calls.some((u) => u.includes('/memorization'))).toBe(false);
  });

  it('no current academic year: memorization explains it, attendance is all-time', async () => {
    stubApi({
      '/platform-preferences': {
        status: 200,
        body: { timezone: 'Africa/Tunis', dateFormat: 'DD/MM/YYYY', defaultCalendarView: 'week', defaultPageSize: 20, currentAcademicYear: null },
      },
    });
    await renderDashboard();
    expect(await screen.findByText(t.memorizationNoYear)).toBeTruthy();
    expect(screen.getByText(t.allTime)).toBeTruthy();
    await waitFor(() => expect(calls.some((u) => u.endsWith('/teacher/attendance/summary'))).toBe(true));
    expect(calls.some((u) => u.includes('/memorization'))).toBe(false);
  });
});
