import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { SessionUser } from '@/features/auth/types';
import { ar } from '@/i18n/ar';

import { workspaceFixture } from './__fixtures__/workspace';
import { TeacherClassScreen } from './teacher-class';
import { TeacherClassesScreen } from './teacher-classes';
import { TeacherStudentScreen } from './teacher-student';

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

describe('«مجموعاتي» (classes list)', () => {
  it('shows only my classes with my role, branch, room, students and weekly slots', async () => {
    stubApi();
    await renderScreen(<TeacherClassesScreen />);
    expect(await screen.findByText('مجموعة الفجر')).toBeTruthy();
    expect(screen.getByText('مجموعة الأمل')).toBeTruthy();
    expect(screen.queryByText('مجموعة أخرى')).toBeNull(); // another teacher's class
    expect(screen.getByText(ar.labels.teachingRole.SUPERVISOR)).toBeTruthy();
    expect(screen.getByText(ar.labels.teachingRole.ASSISTANT)).toBeTruthy();
    expect(screen.getByText('طالبان')).toBeTruthy(); // 2 active in c1 (the inactive one excluded)
    expect(screen.getByText(ar.labels.status.INACTIVE)).toBeTruthy(); // c2 is an inactive class
    expect(screen.getByText('الفرع الرئيسي · قاعة 2')).toBeTruthy(); // room via the shared slot
    expect(screen.getAllByText(/الاثنين/).length).toBeGreaterThan(0);
    expect(calls.filter((u) => u.includes('/teacher/workspace'))).toHaveLength(1);
  });

  it('opening a class navigates with its id only', async () => {
    stubApi();
    await renderScreen(<TeacherClassesScreen />);
    await fireEvent.press(await screen.findByLabelText(/^مجموعة الفجر — الفرع الرئيسي/));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teacher/classes/[id]', params: { id: 'c1' } });
  });

  it('loading state', async () => {
    stubApi('pending');
    await renderScreen(<TeacherClassesScreen />);
    expect(await screen.findByLabelText(ar.states.loading)).toBeTruthy();
  });

  it('empty state when no class is assigned', async () => {
    stubApi({ status: 200, body: { ...workspaceFixture(), groupClasses: [], students: [] } });
    await renderScreen(<TeacherClassesScreen />);
    expect(await screen.findByText(ar.classes.empty)).toBeTruthy();
    expect(screen.getByText(ar.classes.emptyHint)).toBeTruthy();
  });

  it('offline: offline message and a working retry', async () => {
    const routes = stubApi('offline');
    await renderScreen(<TeacherClassesScreen />);
    expect(await screen.findByText(ar.states.offlineTitle)).toBeTruthy();
    routes['/teacher/workspace'] = { status: 200, body: workspaceFixture() };
    await fireEvent.press(screen.getByLabelText(ar.states.retry));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.getByText('مجموعة الفجر')).toBeTruthy();
  });

  it('server error: error state with retry', async () => {
    stubApi({ status: 500, body: {} });
    await renderScreen(<TeacherClassesScreen />);
    expect(await screen.findByText(ar.states.errorTitle)).toBeTruthy();
    expect(screen.getByLabelText(ar.states.retry)).toBeTruthy();
  });

  it('403 (inactive teacher profile): the API message, no retry', async () => {
    stubApi({ status: 403, body: { code: 'TEACHER_INACTIVE', message: 'حساب المعلم غير نشط' } });
    await renderScreen(<TeacherClassesScreen />);
    expect(await screen.findByText(ar.states.forbiddenTitle)).toBeTruthy();
    expect(screen.getByText('حساب المعلم غير نشط')).toBeTruthy();
    expect(screen.queryByLabelText(ar.states.retry)).toBeNull();
  });
});

describe('class details and students', () => {
  it('lists the students of THAT class only, and the team with “أنت”', async () => {
    stubApi();
    await renderScreen(<TeacherClassScreen groupClassId="c1" />);
    expect(await screen.findByText('محمد التونسي')).toBeTruthy();
    expect(screen.getByText('آمنة التونسي')).toBeTruthy();
    expect(screen.queryByText('علي التونسي')).toBeNull(); // inactive
    expect(screen.queryByText('خديجة التونسي')).toBeNull(); // my other class
    expect(screen.queryByText('عمر التونسي')).toBeNull(); // not my class
    expect(screen.getByText(/سارة بن علي/)).toBeTruthy();
    expect(screen.getByText(`(${ar.classes.you})`)).toBeTruthy();
    expect(screen.getByText('أطفال 8-12 سنة')).toBeTruthy();
  });

  it('a shared slot shows its own room and the partner group; students show their age', async () => {
    stubApi();
    await renderScreen(<TeacherClassScreen groupClassId="c2" />);
    expect(await screen.findByText(ar.classes.sharedWith('مجموعة أخرى'))).toBeTruthy();
    expect(screen.getAllByText('قاعة 2').length).toBeGreaterThan(0);
    expect(screen.getByText('خديجة التونسي')).toBeTruthy();
    expect(screen.getByText(ar.student.age(12))).toBeTruthy();
    // My role badge + my line in the team: assistant here, the colleague supervises
    expect(screen.getAllByText(ar.labels.teachingRole.ASSISTANT)).toHaveLength(2);
    expect(screen.getAllByText(ar.labels.teachingRole.SUPERVISOR)).toHaveLength(1);
  });

  it('opening a student navigates with the student id only', async () => {
    stubApi();
    await renderScreen(<TeacherClassScreen groupClassId="c1" />);
    await fireEvent.press(await screen.findByLabelText('محمد التونسي'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teacher/students/[id]', params: { id: 'st1' } });
  });

  it('a class that is not mine (e.g. a crafted link) is “not available”', async () => {
    stubApi();
    await renderScreen(<TeacherClassScreen groupClassId="c3" />);
    expect(await screen.findByText(ar.classes.notFoundTitle)).toBeTruthy();
    expect(screen.queryByText('عمر التونسي')).toBeNull();
    await fireEvent.press(screen.getByLabelText(ar.classes.back));
    expect(mockBack).toHaveBeenCalled();
  });

  it('empty roster', async () => {
    const ws = workspaceFixture();
    stubApi({ status: 200, body: { ...ws, students: ws.students.filter((s) => s.groupClassId !== 'c2') } });
    await renderScreen(<TeacherClassScreen groupClassId="c2" />);
    expect(await screen.findByText(ar.classes.studentsEmpty)).toBeTruthy();
  });
});

describe('student profile', () => {
  it('permitted fields only, phone opens the dialer', async () => {
    stubApi();
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await renderScreen(<TeacherStudentScreen studentId="st1" />);
    expect(await screen.findByText('محمد التونسي')).toBeTruthy();
    expect(screen.getByText(ar.student.age(12))).toBeTruthy();
    expect(screen.getByText('مجموعة الفجر — الفرع الرئيسي')).toBeTruthy();
    expect(screen.getByText('22 123 456')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(ar.student.call(ar.student.guardianPhone)));
    expect(open).toHaveBeenCalledWith('tel:+21622123456');
    open.mockRestore();
  });

  it('back to the class from the profile', async () => {
    stubApi();
    await renderScreen(<TeacherStudentScreen studentId="st1" />);
    await fireEvent.press(await screen.findByLabelText(`${ar.classes.open}: مجموعة الفجر`));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teacher/classes/[id]', params: { id: 'c1' } });
  });

  it('a student outside my classes is “not available”', async () => {
    stubApi();
    await renderScreen(<TeacherStudentScreen studentId="st5" />);
    expect(await screen.findByText(ar.student.notFoundTitle)).toBeTruthy();
    expect(screen.queryByText('عمر التونسي')).toBeNull();
  });
});
