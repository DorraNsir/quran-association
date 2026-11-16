import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { SessionUser } from '@/features/auth/types';
import { ar } from '@/i18n/ar';

import { workspaceFixture } from './__fixtures__/workspace';

import { TeacherScheduleScreen } from './teacher-schedule';


/*
 * Screens against stubbed HTTP answers shaped like GET /teacher/workspace.
 * Only native modules, navigation and the network are replaced.
 */
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
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

type Route = { status: number; body?: unknown } | 'offline' | 'pending';
const calls: string[] = [];

function stubApi(workspace: Route = { status: 200, body: workspaceFixture() }) {
  const routes: Record<string, Route> = {
    '/platform-preferences': {
      status: 200,
      body: { timezone: 'Africa/Tunis', dateFormat: 'DD/MM/YYYY', defaultCalendarView: 'week', defaultPageSize: 20, currentAcademicYear: null },
    },
    '/teacher/workspace': workspace,
  };
  calls.length = 0;
  globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) throw new Error(`unexpected request ${url}`);
    const route = routes[key]!;
    if (route === 'offline') throw new TypeError('Network request failed');
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
function renderScreen(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  return render(ui, { wrapper });
}

beforeEach(() => {
  mockPush.mockReset();
  mockBack.mockReset();
});
afterEach(async () => {
  await act(async () => {
    for (const client of clients.splice(0)) {
      await client.cancelQueries();
      client.clear();
    }
  });
});

const s = ar.schedule;

describe('«جدولي» (weekly schedule)', () => {
  it('overview: all seven days Monday first, my running slots with time, role, room and branch', async () => {
    stubApi();
    await renderScreen(<TeacherScheduleScreen />);
    expect(await screen.findByText(s.weekly)).toBeTruthy();
    expect(screen.getByText(s.summary(2, '4 س'))).toBeTruthy();
    const headers = screen.getAllByRole('header').map((h) => h.props.children);
    expect(headers).toEqual(['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد']);
    expect(screen.getAllByText(s.noSlot)).toHaveLength(5);
    expect(screen.getAllByText('مجموعة الفجر')).toHaveLength(2);
    expect(screen.getAllByText('قاعة 1 — الفرع الرئيسي')).toHaveLength(2);
    expect(screen.getAllByText(ar.labels.teachingRole.SUPERVISOR)).toHaveLength(2);
    expect(screen.queryByText(/مجموعة الأمل/)).toBeNull(); // inactive class: not running
    expect(screen.getByLabelText(/^الاثنين من 09:00 إلى 11:00، مجموعة الفجر/)).toBeTruthy();
    expect(calls.filter((u) => u.includes('/teacher/workspace'))).toHaveLength(1);
    expect(calls.some((u) => u.includes('/teacher/sessions'))).toBe(false); // no dated lessons fetched
  });

  it('a shared slot shows every group, my role, and the shared badge', async () => {
    const ws = workspaceFixture();
    ws.groupClasses = ws.groupClasses.map((c) => (c.id === 'c2' ? { ...c, status: 'ACTIVE' as const } : c));
    stubApi({ status: 200, body: ws });
    await renderScreen(<TeacherScheduleScreen />);
    expect(await screen.findByText(s.shared('مجموعة أخرى + مجموعة الأمل'))).toBeTruthy();
    expect(screen.getByText(ar.teacher.shared)).toBeTruthy();
    expect(screen.getByText(ar.labels.teachingRole.ASSISTANT)).toBeTruthy();
    expect(screen.getByText('قاعة 2 — الفرع الرئيسي')).toBeTruthy();
  });

  it('unknown room or branch: explicit fallback, never guessed', async () => {
    const ws = workspaceFixture();
    ws.rooms.push({ id: 'r9', branchId: 'b-elsewhere', name: 'قاعة 9' });
    ws.schedules[0] = { ...ws.schedules[0]!, roomId: 'r9' };
    ws.schedules[1] = { ...ws.schedules[1]!, roomId: 'r-missing' };
    stubApi({ status: 200, body: ws });
    await renderScreen(<TeacherScheduleScreen />);
    expect(await screen.findByText(`قاعة 9 — ${s.noBranch}`)).toBeTruthy();
    expect(screen.getByText(`${s.noRoom} — ${s.noBranch}`)).toBeTruthy();
  });

  it('day filter: one day only; an empty day says so', async () => {
    stubApi();
    await renderScreen(<TeacherScheduleScreen />);
    await fireEvent.press(await screen.findByRole('radio', { name: /^الأربعاء/ }));
    expect(screen.getAllByRole('header').map((h) => h.props.children)).toEqual(['الأربعاء']);
    expect(screen.getByLabelText(/^الأربعاء من 17:00 إلى 19:00/)).toBeTruthy();
    expect(screen.queryByLabelText(/^الاثنين من/)).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: /^الجمعة/ }));
    expect(screen.getByText(s.emptyDay)).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: s.all }));
    expect(screen.getAllByRole('header')).toHaveLength(7);
  });

  it('a slot opens its class; the dated sessions link opens «الحصص»', async () => {
    stubApi();
    await renderScreen(<TeacherScheduleScreen />);
    await fireEvent.press(await screen.findByLabelText(/^الأربعاء من 17:00/));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teacher/classes/[id]', params: { id: 'c1' } });
    await fireEvent.press(screen.getByLabelText(s.seeSessions));
    expect(mockPush).toHaveBeenLastCalledWith('/teacher/sessions');
  });

  it('empty state when nothing is scheduled for me', async () => {
    stubApi({ status: 200, body: { ...workspaceFixture(), schedules: [] } });
    await renderScreen(<TeacherScheduleScreen />);
    expect(await screen.findByText(s.empty)).toBeTruthy();
    expect(screen.getByText(s.emptyHint)).toBeTruthy();
  });

  it('loading state', async () => {
    stubApi('pending');
    await renderScreen(<TeacherScheduleScreen />);
    expect(await screen.findByLabelText(ar.states.loading)).toBeTruthy();
  });

  it('offline: offline message and a working retry', async () => {
    const routes = stubApi('offline');
    await renderScreen(<TeacherScheduleScreen />);
    expect(await screen.findByText(ar.states.offlineTitle)).toBeTruthy();
    routes['/teacher/workspace'] = { status: 200, body: workspaceFixture() };
    await fireEvent.press(screen.getByLabelText(ar.states.retry));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.getByText(s.weekly)).toBeTruthy();
  });

  it('server error: error state with retry', async () => {
    stubApi({ status: 500, body: {} });
    await renderScreen(<TeacherScheduleScreen />);
    expect(await screen.findByText(ar.states.errorTitle)).toBeTruthy();
    expect(screen.getByLabelText(ar.states.retry)).toBeTruthy();
  });

  it('403 (inactive teacher profile): the API message, no retry', async () => {
    stubApi({ status: 403, body: { code: 'TEACHER_INACTIVE', message: 'حساب المعلم غير نشط' } });
    await renderScreen(<TeacherScheduleScreen />);
    expect(await screen.findByText(ar.states.forbiddenTitle)).toBeTruthy();
    expect(screen.queryByLabelText(ar.states.retry)).toBeNull();
  });
});
