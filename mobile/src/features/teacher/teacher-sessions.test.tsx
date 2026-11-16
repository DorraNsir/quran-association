import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { SessionUser } from '@/features/auth/types';
import { ar } from '@/i18n/ar';
import { formatDateLong } from '@/i18n/format';

import { pageOf, sessionFixture } from './__fixtures__/sessions';
import { workspaceFixture } from './__fixtures__/workspace';
import { platformClock } from './dashboard-model';
import { TeacherSessionScreen } from './teacher-session';
import { TeacherSessionsScreen } from './teacher-sessions';

/*
 * The sessions screens against stubbed HTTP answers shaped like the DTOs.
 * Only native modules, navigation and the network are replaced; each test
 * checks the real query sent to GET /teacher/sessions.
 */
const mockPush = jest.fn();
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  Stack: { Screen: () => null },
}));
const mockUser: SessionUser = {
  id: 'u1',
  username: 'ahmed.t',
  person: { id: 'p1', firstName: 'أحمد', lastName: 'السالمي', photoUrl: null, email: null, phone: null },
  roles: ['TEACHER'],
  mustChangePassword: false,
  teacherId: 't-me',
  studentId: null,
};
jest.mock('@/features/auth/auth-provider', () => ({
  useSession: () => ({ status: 'signedIn', user: mockUser, endedReason: null, restoreError: null }),
  session: { logout: jest.fn() },
}));

const TODAY = platformClock('Africa/Tunis').today;
const PREFS = { timezone: 'Africa/Tunis', dateFormat: 'DD/MM/YYYY', defaultCalendarView: 'week', defaultPageSize: 20, currentAcademicYear: null };

type Answer = { status: number; body?: unknown } | 'offline' | 'pending';
const calls: string[] = [];
let answer: (url: string) => Answer;

function stub(sessions: (url: string) => Answer) {
  calls.length = 0;
  answer = (url) => {
    if (url.includes('/platform-preferences')) return { status: 200, body: PREFS };
    if (url.includes('/teacher/workspace')) return { status: 200, body: workspaceFixture() };
    return sessions(url);
  };
  globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push(url);
    const a = answer(url);
    if (a === 'offline') throw new TypeError('Network request failed');
    if (a === 'pending')
      return new Promise((_, reject) =>
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))),
      );
    return { status: a.status, ok: a.status >= 200 && a.status < 300, text: async () => (a.body === undefined ? '' : JSON.stringify(a.body)) };
  }) as unknown as typeof fetch;
}
const listCalls = () => calls.filter((u) => /\/teacher\/sessions\?/.test(u));
const params = (url: string) => Object.fromEntries(new URL(url).searchParams.entries());

const clients: QueryClient[] = [];
function renderScreen(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  return render(ui, { wrapper });
}
async function press(label: string | RegExp) {
  const target = await screen.findByLabelText(label);
  await fireEvent.press(target);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

beforeEach(() => mockPush.mockReset());
afterEach(async () => {
  await act(async () => {
    for (const client of clients.splice(0)) {
      await client.cancelQueries();
      client.clear();
    }
  });
});

describe('«الحصص» list', () => {
  it("default: today's sessions (platform day), 20 per page, grouped under full Arabic dates", async () => {
    stub(() => ({
      status: 200,
      body: pageOf([sessionFixture('s1', TODAY, '23:00', '23:30'), sessionFixture('s2', '2099-01-05', '17:00', '19:00')]),
    }));
    await renderScreen(<TeacherSessionsScreen />);
    expect(await screen.findByText(formatDateLong('2099-01-05'))).toBeTruthy();
    expect(screen.getByText(formatDateLong(TODAY))).toBeTruthy();
    expect(params(listCalls().find((u) => params(u).pageSize === '20')!)).toEqual({
      from: TODAY,
      to: TODAY,
      order: 'asc',
      page: '1',
      pageSize: '20',
    });
    expect(screen.getByText(ar.sessions.count(2))).toBeTruthy();
  });

  it('cancelled sessions: their own tab (status=CANCELLED, latest first), shown with the reason — never deleted', async () => {
    stub((url) =>
      params(url).status === 'CANCELLED'
        ? { status: 200, body: pageOf([sessionFixture('x', '2026-10-01', '09:00', '11:00', { status: 'CANCELLED', cancellationReason: 'عطلة رسمية' })]) }
        : { status: 200, body: pageOf([]) },
    );
    await renderScreen(<TeacherSessionsScreen />);
    expect(await screen.findByText(ar.sessions.empty.today)).toBeTruthy();
    await press(ar.sessions.tabs.cancelled);
    expect(await screen.findByText(`${ar.sessions.cancellationReason}: عطلة رسمية`)).toBeTruthy();
    expect(screen.getByText(ar.sessions.status.CANCELLED)).toBeTruthy();
    expect(params(listCalls().at(-1)!)).toMatchObject({ status: 'CANCELLED', order: 'desc' });
  });

  it('«حضور غير مكتمل»: the web query, its count on the chip (one pageSize=1 request), progress per session', async () => {
    stub((url) => {
      const p = params(url);
      if (p.status === 'SCHEDULED' && p.to === TODAY && p.pageSize === '1') return { status: 200, body: pageOf([], 1, 1, 3) };
      if (p.status === 'SCHEDULED' && p.to === TODAY)
        return {
          status: 200,
          body: pageOf([
            sessionFixture('late', '2026-10-01', '09:00', '11:00', {
              attendance: { expected: 4, recorded: 1, present: 1, absent: 0, late: 0, excused: 0 },
            }),
          ]),
        };
      return { status: 200, body: pageOf([]) };
    });
    await renderScreen(<TeacherSessionsScreen />);
    await press(`${ar.sessions.tabs.pending} (3)`);
    expect(await screen.findByLabelText(`${ar.attendance.state.PARTIAL} · ${ar.attendance.progress(1, 4)}`)).toBeTruthy();
    expect(params(listCalls().at(-1)!)).toMatchObject({ to: TODAY, status: 'SCHEDULED', order: 'desc', pageSize: '20' });
    expect(listCalls().filter((u) => params(u).pageSize === '1')).toHaveLength(1);
  });

  it('class and period filters are server parameters', async () => {
    stub(() => ({ status: 200, body: pageOf([]) }));
    await renderScreen(<TeacherSessionsScreen />);
    await press(ar.sessions.periods.week);
    await press('مجموعة الأمل');
    const last = params(listCalls().at(-1)!);
    expect(last.groupClassId).toBe('c2');
    expect(last.from).toBe(TODAY);
    expect(last.to! >= TODAY).toBe(true);
    expect(await screen.findByText(ar.sessions.emptyFiltered)).toBeTruthy();
  });

  it('pagination: the next page only on demand, appended', async () => {
    const first = Array.from({ length: 20 }, (_, i) => sessionFixture(`p1-${i}`, '2099-02-01', '09:00', '10:00'));
    stub((url) =>
      params(url).page === '2'
        ? { status: 200, body: pageOf([sessionFixture('p2-0', '2099-02-02', '09:00', '10:00')], 2, 20, 21) }
        : { status: 200, body: pageOf(first, 1, 20, 21) },
    );
    await renderScreen(<TeacherSessionsScreen />);
    expect(await screen.findByText(ar.sessions.count(21))).toBeTruthy();
    const pages = () => listCalls().filter((u) => params(u).pageSize === '20');
    expect(pages()).toHaveLength(1);
    await press(ar.sessions.loadMore);
    expect(await screen.findByText(formatDateLong('2099-02-02'))).toBeTruthy();
    expect(params(pages().at(-1)!).page).toBe('2');
    expect(screen.queryByLabelText(ar.sessions.loadMore)).toBeNull(); // last page
  });

  it('opening a session navigates with its id only', async () => {
    stub(() => ({ status: 200, body: pageOf([sessionFixture('s9', '2099-01-05', '17:00', '19:00')]) }));
    await renderScreen(<TeacherSessionsScreen />);
    await press(new RegExp(formatDateLong('2099-01-05')));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teacher/sessions/[id]', params: { id: 's9' } });
  });

  it('loading state', async () => {
    stub(() => 'pending');
    const view = await renderScreen(<TeacherSessionsScreen />);
    expect(await screen.findByLabelText(ar.states.loading)).toBeTruthy();
    view.unmount();
  });

  it('offline: message and a working retry', async () => {
    let online = false;
    stub(() => (online ? { status: 200, body: pageOf([sessionFixture('s1', '2099-01-05', '17:00', '19:00')]) } : 'offline'));
    await renderScreen(<TeacherSessionsScreen />);
    expect(await screen.findByText(ar.states.offlineTitle)).toBeTruthy();
    online = true;
    await press(ar.states.retry);
    expect(screen.getByText(formatDateLong('2099-01-05'))).toBeTruthy();
  });

  it('server error: generic error with retry', async () => {
    stub(() => ({ status: 500, body: {} }));
    await renderScreen(<TeacherSessionsScreen />);
    expect(await screen.findByText(ar.states.errorTitle)).toBeTruthy();
    expect(screen.getByLabelText(ar.states.retry)).toBeTruthy();
  });

  it('403 TEACHER_INACTIVE: access message without retry', async () => {
    stub(() => ({ status: 403, body: { code: 'TEACHER_INACTIVE', message: 'حساب المعلم غير نشط' } }));
    await renderScreen(<TeacherSessionsScreen />);
    expect(await screen.findByText('حساب المعلم غير نشط')).toBeTruthy();
    expect(screen.queryByLabelText(ar.states.retry)).toBeNull();
  });
});

describe('session details', () => {
  const shared = sessionFixture('s1', '2099-01-05', '17:00', '19:00', {
    isExtra: true,
    room: { id: 'r9', name: 'قاعة 4', branch: { id: 'b2', name: 'فرع الرقوبة' } },
    additionalClasses: [{ id: 'c3', status: 'ACTIVE', group: { id: 'g3', name: 'مجموعة أخرى', status: 'ACTIVE' } }],
    attendance: { expected: 2, recorded: 1, present: 1, absent: 0, late: 0, excused: 0 },
  });

  it("this session's room and branch, shared groups (only mine openable), team, read-only attendance", async () => {
    stub(() => ({ status: 200, body: shared }));
    await renderScreen(<TeacherSessionScreen sessionId="s1" />);
    expect(await screen.findByText(formatDateLong('2099-01-05'))).toBeTruthy();
    expect(screen.getByText('قاعة 4')).toBeTruthy();
    expect(screen.getByText('فرع الرقوبة')).toBeTruthy();
    expect(screen.getByText(ar.teacher.extra)).toBeTruthy();
    expect(screen.getByText(ar.sessions.sharedNote)).toBeTruthy();
    expect(screen.getByText(ar.sessions.attendanceRecorded(1, 2))).toBeTruthy();
    expect(screen.getByText(`(${ar.classes.you})`)).toBeTruthy();
    // c1 is mine → openable; c3 is a partner class → name only
    await press(`${ar.classes.open}: مجموعة الفجر`);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teacher/classes/[id]', params: { id: 'c1' } });
    expect(screen.queryByLabelText(`${ar.classes.open}: مجموعة أخرى`)).toBeNull();
    expect(screen.getByText('مجموعة أخرى')).toBeTruthy();
    expect(calls.some((u) => u.endsWith('/teacher/sessions/s1'))).toBe(true);
  });

  it('cancelled: the reason; attendance still viewable (read-only), marked as a cancelled session', async () => {
    stub(() => ({ status: 200, body: { ...shared, status: 'CANCELLED', cancellationReason: 'عطلة رسمية' } }));
    await renderScreen(<TeacherSessionScreen sessionId="s1" />);
    expect(await screen.findByText('عطلة رسمية')).toBeTruthy();
    expect(screen.getByLabelText(ar.attendance.state.CANCELLED)).toBeTruthy();
    expect(screen.queryByText(ar.sessions.attendanceRecorded(1, 2))).toBeNull();
  });

  it('“view attendance” opens the attendance screen of this session', async () => {
    stub(() => ({ status: 200, body: shared }));
    await renderScreen(<TeacherSessionScreen sessionId="s1" />);
    await press(ar.attendance.open);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teacher/sessions/[id]/attendance', params: { id: 's1' } });
  });

  it('404 SESSION_NOT_FOUND (not my session): message, no pointless retry', async () => {
    stub(() => ({ status: 404, body: { code: 'SESSION_NOT_FOUND', message: 'الحصة غير موجودة' } }));
    await renderScreen(<TeacherSessionScreen sessionId="other" />);
    expect(await screen.findByText('الحصة غير موجودة')).toBeTruthy();
    expect(screen.queryByLabelText(ar.states.retry)).toBeNull();
  });
});
