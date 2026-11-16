import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { SessionUser } from '@/features/auth/types';
import { ar } from '@/i18n/ar';
import { formatDateLong } from '@/i18n/format';

import { classMemoFixture, memoStudent, recordFixture, YEAR_FIXTURE } from './__fixtures__/memorization';
import { workspaceFixture } from './__fixtures__/workspace';
import { TeacherMemorizationScreen } from './teacher-memorization';
import { TeacherStudentMemorizationScreen } from './teacher-student-memorization';

/*
 * The memorization screens against stubbed answers shaped like the backend
 * DTOs (test-only fixtures). Only native modules, navigation and the
 * network are replaced; every test checks the real query sent.
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

type Answer = { status: number; body?: unknown } | 'offline' | 'pending';
const calls: string[] = [];
const PREFS = (year: unknown = YEAR_FIXTURE) => ({
  timezone: 'Africa/Tunis',
  dateFormat: 'DD/MM/YYYY',
  defaultCalendarView: 'week',
  defaultPageSize: 20,
  currentAcademicYear: year,
});

const C1 = classMemoFixture([
  memoStudent('st1', 'محمد', { lastMemorizedSurahNumber: 78, surahName: 'النبأ', updatedAt: '2026-11-10T09:00:00Z' }),
  memoStudent('st2', 'آمنة'),
  memoStudent('st9', 'سليم', { currentMember: false }),
]);
const C2 = classMemoFixture([memoStudent('st4', 'خديجة', { lastMemorizedSurahNumber: 114, surahName: 'الناس', updatedAt: '2026-11-01T09:00:00Z' })], {
  groupClass: { id: 'c2', group: { id: 'g2', name: 'مجموعة الأمل' } },
});

function stub(route: (url: string) => Answer | undefined) {
  calls.length = 0;
  globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push(url);
    const a =
      route(url) ??
      (url.includes('/platform-preferences')
        ? { status: 200, body: PREFS() }
        : url.includes('/teacher/workspace')
          ? { status: 200, body: workspaceFixture() }
          : url.includes('/group-classes/c1/memorization')
            ? { status: 200, body: C1 }
            : url.includes('/group-classes/c2/memorization')
              ? { status: 200, body: C2 }
              : undefined);
    if (!a) throw new Error(`unexpected request ${url}`);
    if (a === 'offline') throw new TypeError('Network request failed');
    if (a === 'pending')
      return new Promise((_, reject) =>
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))),
      );
    return { status: a.status, ok: a.status >= 200 && a.status < 300, text: async () => (a.body === undefined ? '' : JSON.stringify(a.body)) };
  }) as unknown as typeof fetch;
}
const params = (url: string) => Object.fromEntries(new URL(url).searchParams.entries());
const memoCalls = (fragment: string) => calls.filter((u) => u.includes(fragment));

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
  await fireEvent.press(await screen.findByLabelText(label));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

beforeEach(() => mockPush.mockReset());
afterEach(async () => {
  await act(async () => {
    for (const c of clients.splice(0)) {
      await c.cancelQueries();
      c.clear();
    }
  });
});

const m = ar.memorization;

describe('«متابعة الحفظ» (class view)', () => {
  it("current year and semester by default — sent as the API's FIRST/SECOND; each active member's last surah", async () => {
    stub(() => undefined);
    await renderScreen(<TeacherMemorizationScreen />);
    expect(await screen.findByText(`${m.lastSurah}: النبأ`)).toBeTruthy();
    const call = memoCalls('/group-classes/c1/memorization')[0]!;
    expect(params(call)).toEqual({ academicYearId: YEAR_FIXTURE.id, semester: 'FIRST' });
    expect(screen.getByText(m.notSet)).toBeTruthy(); // آمنة: not recorded — never invented
    expect(screen.queryByText('سليم التونسي')).toBeNull(); // left the class
    expect(screen.getByText(m.recorded(1, 2))).toBeTruthy();
    expect(screen.getByText(`${ar.labels.semester.FIRST} · ${m.currentSemester}`)).toBeTruthy();
  });

  it('semester and class switches are server parameters', async () => {
    stub(() => undefined);
    await renderScreen(<TeacherMemorizationScreen />);
    await screen.findByText(`${m.lastSurah}: النبأ`);
    await press(ar.labels.semester.SECOND);
    expect(params(memoCalls('/group-classes/c1/memorization').at(-1)!)).toMatchObject({ semester: 'SECOND' });
    expect(await screen.findByText(m.notStarted)).toBeTruthy(); // the second semester starts in February
    await press('مجموعة الأمل');
    expect(memoCalls('/group-classes/c2/memorization')).toHaveLength(1);
  });

  it('«دون تحديد فقط» keeps only students without a value', async () => {
    stub(() => undefined);
    await renderScreen(<TeacherMemorizationScreen />);
    await press(m.onlyMissing(1));
    expect(screen.queryByText('محمد التونسي')).toBeNull();
    expect(screen.getByText('آمنة التونسي')).toBeTruthy();
  });

  it('a class link opens that class', async () => {
    stub(() => undefined);
    await renderScreen(<TeacherMemorizationScreen initialClassId="c2" />);
    expect(await screen.findByText(`${m.lastSurah}: الناس`)).toBeTruthy();
  });

  it('a link to a class that is not mine falls back to my first class (never requested)', async () => {
    stub(() => undefined);
    await renderScreen(<TeacherMemorizationScreen initialClassId="c3" />);
    await screen.findByText(`${m.lastSurah}: النبأ`);
    expect(memoCalls('/group-classes/c3/')).toHaveLength(0);
  });

  it('opening a student goes to their memorization history (id only)', async () => {
    stub(() => undefined);
    await renderScreen(<TeacherMemorizationScreen />);
    await press(`محمد التونسي، ${m.lastSurah}: النبأ`);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teacher/students/[id]/memorization', params: { id: 'st1' } });
  });

  it('no current academic year: explained, nothing requested', async () => {
    stub((url) => (url.includes('/platform-preferences') ? { status: 200, body: PREFS(null) } : undefined));
    await renderScreen(<TeacherMemorizationScreen />);
    expect(await screen.findByText(m.noYear)).toBeTruthy();
    expect(memoCalls('/memorization')).toHaveLength(0);
  });

  it('loading state', async () => {
    stub((url) => (url.includes('/memorization') ? 'pending' : undefined));
    await renderScreen(<TeacherMemorizationScreen />);
    expect(await screen.findByLabelText(ar.states.loading)).toBeTruthy();
  });

  it('offline: message and a working retry', async () => {
    let online = false;
    stub((url) => (url.includes('/memorization') && !online ? 'offline' : undefined));
    await renderScreen(<TeacherMemorizationScreen />);
    expect(await screen.findByText(ar.states.offlineTitle)).toBeTruthy();
    online = true;
    await press(ar.states.retry);
    expect(await screen.findByText(`${m.lastSurah}: النبأ`)).toBeTruthy();
  });

  it('403: the API message, no retry', async () => {
    stub((url) =>
      url.includes('/memorization') ? { status: 403, body: { code: 'TEACHER_CLASS_ACCESS_DENIED', message: 'لست مكلّفًا بهذا القسم' } } : undefined,
    );
    await renderScreen(<TeacherMemorizationScreen />);
    expect(await screen.findByText('لست مكلّفًا بهذا القسم')).toBeTruthy();
    expect(screen.queryByLabelText(ar.states.retry)).toBeNull();
  });
});

describe('«سجل الحفظ» (one student)', () => {
  const student = (semester: string) => (url: string) => url.includes('/teacher/students/st1/memorization') && url.includes(`semester=${semester}`);

  it('both semesters of the current year, NEWEST first; surah name, number, full Arabic update date', async () => {
    stub((url) => {
      if (student('FIRST')(url)) return { status: 200, body: recordFixture('st1', 'FIRST', 78, 'النبأ', '2026-11-15T23:30:00Z') };
      if (student('SECOND')(url)) return { status: 200, body: null };
      return undefined;
    });
    await renderScreen(<TeacherStudentMemorizationScreen studentId="st1" />);
    expect(await screen.findByText('النبأ')).toBeTruthy();
    expect(screen.getByText(m.surahNumber(78))).toBeTruthy();
    // 23:30 UTC on the 15th is the 16th in Tunis
    expect(screen.getByText(m.updatedOn(formatDateLong('2026-11-16')))).toBeTruthy();
    expect(screen.getByText(m.notStarted)).toBeTruthy(); // SECOND: not recorded, not started yet
    const order = screen
      .getAllByText(new RegExp(`^(${ar.labels.semester.FIRST}|${ar.labels.semester.SECOND})$`))
      .map((n) => String(n.props.children));
    expect(order).toEqual([ar.labels.semester.SECOND, ar.labels.semester.FIRST]);
    expect(calls.filter((u) => u.includes('/teacher/students/st1/memorization')).map((u) => params(u))).toEqual([
      { academicYearId: YEAR_FIXTURE.id, semester: 'FIRST' },
      { academicYearId: YEAR_FIXTURE.id, semester: 'SECOND' },
    ]);
  });

  it('an empty answer body means "not recorded" (never "loading")', async () => {
    stub((url) => (url.includes('/teacher/students/st1/memorization') ? { status: 200 } : undefined));
    await renderScreen(<TeacherStudentMemorizationScreen studentId="st1" />);
    expect(await screen.findByText(m.notSetLong)).toBeTruthy();
  });

  it("403 on one semester: «not my student then» for that semester only; the other is shown", async () => {
    stub((url) => {
      if (student('FIRST')(url)) return { status: 403, body: { code: 'TEACHER_STUDENT_ACCESS_DENIED', message: 'x' } };
      if (student('SECOND')(url)) return { status: 200, body: recordFixture('st1', 'SECOND', 1, 'الفاتحة', '2027-02-10T09:00:00Z') };
      return undefined;
    });
    await renderScreen(<TeacherStudentMemorizationScreen studentId="st1" />);
    expect(await screen.findByText('الفاتحة')).toBeTruthy();
    expect(screen.getByText(m.notMine)).toBeTruthy();
  });

  it('a server error: error state with retry', async () => {
    stub((url) => (url.includes('/teacher/students/st1/memorization') ? { status: 500, body: {} } : undefined));
    await renderScreen(<TeacherStudentMemorizationScreen studentId="st1" />);
    expect(await screen.findByText(ar.states.errorTitle)).toBeTruthy();
    expect(screen.getByLabelText(ar.states.retry)).toBeTruthy();
  });

  it('a student outside my classes: unavailable, and NOTHING requested for them', async () => {
    stub(() => undefined);
    await renderScreen(<TeacherStudentMemorizationScreen studentId="st5" />);
    expect(await screen.findByText(m.studentUnavailable)).toBeTruthy();
    expect(calls.some((u) => u.includes('/teacher/students/st5/'))).toBe(false);
  });
});
