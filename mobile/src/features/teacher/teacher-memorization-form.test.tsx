import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { SessionUser } from '@/features/auth/types';
import { ar } from '@/i18n/ar';

import { recordFixture, YEAR_FIXTURE } from './__fixtures__/memorization';
import { workspaceFixture } from './__fixtures__/workspace';
import { TeacherMemorizationFormScreen } from './teacher-memorization-form';

/*
 * The memorization form against stubbed answers shaped like the backend DTOs
 * (test-only fixtures — no real records). Only native modules, navigation and
 * the network are replaced; every PUT body is checked exactly.
 */
const mockBack = jest.fn();
const mockDisable = jest.fn();
let mockPrevent: { active: boolean; callback?: (o: { repeat: () => void }) => void } = { active: false };
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: jest.fn() }),
  Stack: { Screen: () => null },
  usePreventRemove: (active: boolean, callback: (o: { repeat: () => void }) => void) => {
    mockPrevent = { active, callback };
    return mockDisable;
  },
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
const calls: { url: string; method: string; body?: unknown }[] = [];
const PREFS = { timezone: 'Africa/Tunis', dateFormat: 'DD/MM/YYYY', defaultCalendarView: 'week', defaultPageSize: 20, currentAcademicYear: YEAR_FIXTURE };
const SAVED_FIRST = recordFixture('st1', 'FIRST', 78, 'النبأ', '2026-11-10T09:00:00Z');

/** GET answers per semester, and the PUT answer. */
function stub(get: { FIRST?: Answer; SECOND?: Answer } = {}, put: (body: unknown) => Answer = () => ({ status: 500, body: {} })) {
  calls.length = 0;
  globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    calls.push({ url, method, body });
    let a: Answer;
    if (url.includes('/platform-preferences')) a = { status: 200, body: PREFS };
    else if (url.includes('/teacher/workspace')) a = { status: 200, body: workspaceFixture() };
    else if (method === 'PUT') a = put(body);
    else if (url.includes('semester=FIRST')) a = get.FIRST ?? { status: 200, body: null };
    else if (url.includes('semester=SECOND')) a = get.SECOND ?? { status: 200, body: null };
    else throw new Error(`unexpected request ${url}`);
    if (a === 'offline') throw new TypeError('Network request failed');
    if (a === 'pending')
      return new Promise((_, reject) =>
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))),
      );
    return { status: a.status, ok: a.status >= 200 && a.status < 300, text: async () => (a.body === undefined ? '' : JSON.stringify(a.body)) };
  }) as unknown as typeof fetch;
}
const puts = () => calls.filter((c) => c.method === 'PUT');

const clients: QueryClient[] = [];
let client: QueryClient;
function renderForm(studentId = 'st1', semester?: string) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  return render(<TeacherMemorizationFormScreen studentId={studentId} semesterParam={semester} />, { wrapper });
}
async function settle(ms = 30) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}
const m = ar.memorization;
const option = (n: number, name: string) => screen.getByLabelText(`سورة ${name}، رقم ${n}`);
const saveButton = () => screen.getByLabelText(m.save);

beforeEach(() => {
  mockBack.mockReset();
  mockDisable.mockReset();
});
afterEach(async () => {
  await act(async () => {
    for (const c of clients.splice(0)) {
      await c.cancelQueries();
      c.clear();
    }
  });
});

describe('recording memorization', () => {
  it("creating: no saved value → pick a surah → ONE PUT with the DTO's exact fields; back after the server confirms", async () => {
    stub({}, (body) => ({ status: 200, body: { ...SAVED_FIRST, ...(body as object), surahName: 'الملك' } }));
    await renderForm();
    expect(await screen.findByText(m.notSetLong)).toBeTruthy();
    expect(saveButton().props.accessibilityState.disabled).toBe(true); // nothing chosen yet
    await fireEvent.press(option(67, 'الملك'));
    expect(screen.getByText(m.unsaved)).toBeTruthy();
    expect(puts()).toHaveLength(0); // never on selection
    await fireEvent.press(saveButton());
    await settle();
    expect(puts()).toHaveLength(1);
    expect(puts()[0]!.body).toEqual({ academicYearId: YEAR_FIXTURE.id, semester: 'FIRST', lastMemorizedSurahNumber: 67 });
    expect(puts()[0]!.url).toMatch(/\/teacher\/students\/st1\/memorization$/);
    expect(mockDisable).toHaveBeenCalled(); // leave without the unsaved-change prompt
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('editing: the saved value is pre-selected; saving needs a real change', async () => {
    stub({ FIRST: { status: 200, body: SAVED_FIRST } }, () => ({ status: 200, body: SAVED_FIRST }));
    await renderForm();
    expect((await screen.findAllByText('سورة النبأ')).length).toBeGreaterThanOrEqual(2); // the saved value, and the list
    expect(option(78, 'النبأ').props.accessibilityState.selected).toBe(true);
    expect(saveButton().props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(option(79, 'النازعات'));
    await fireEvent.press(option(78, 'النبأ')); // back to the saved value: no change
    expect(saveButton().props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(option(80, 'عبس'));
    await fireEvent.press(saveButton());
    await settle();
    expect(puts()[0]!.body).toEqual({ academicYearId: YEAR_FIXTURE.id, semester: 'FIRST', lastMemorizedSurahNumber: 80 });
  });

  it('search narrows the 114 surahs (Arabic without hamza, transliteration, number)', async () => {
    stub();
    await renderForm();
    const search = await screen.findByLabelText(m.searchLabel);
    await fireEvent.changeText(search, 'ابراهيم');
    expect(option(14, 'إبراهيم')).toBeTruthy();
    expect(screen.queryByLabelText('سورة الناس، رقم 114')).toBeNull();
    await fireEvent.changeText(search, 'an-nas');
    expect(option(114, 'الناس')).toBeTruthy();
    await fireEvent.changeText(search, 'zzzz');
    expect(screen.getByText(m.noMatch)).toBeTruthy();
  });

  it('the semester comes from the route (SECOND here), with the «other semester» notice', async () => {
    stub({}, () => ({ status: 200, body: recordFixture('st1', 'SECOND', 1, 'الفاتحة', '2027-02-10T09:00:00Z') }));
    await renderForm('st1', 'SECOND');
    expect(await screen.findByText(m.otherSemester)).toBeTruthy();
    await fireEvent.press(option(1, 'الفاتحة'));
    await fireEvent.press(saveButton());
    await settle();
    expect(puts()[0]!.body).toMatchObject({ semester: 'SECOND', lastMemorizedSurahNumber: 1 });
  });

  it('an invalid semester in the link falls back to the current semester (never sent as-is)', async () => {
    stub({}, () => ({ status: 200, body: SAVED_FIRST }));
    await renderForm('st1', 'SEMESTER_1');
    await screen.findByText(m.notSetLong);
    expect(screen.queryByText(m.otherSemester)).toBeNull();
    await fireEvent.press(option(2, 'البقرة'));
    await fireEvent.press(saveButton());
    await settle();
    expect(puts()[0]!.body).toMatchObject({ semester: 'FIRST' });
  });
});

describe('permissions (the server decides)', () => {
  it('a student outside my classes: unavailable — nothing read, nothing written', async () => {
    stub();
    await renderForm('st5');
    expect(await screen.findByText(m.studentUnavailable)).toBeTruthy();
    expect(calls.some((c) => c.url.includes('/teacher/students/st5/'))).toBe(false);
    expect(screen.queryByLabelText(m.save)).toBeNull();
  });

  it('a semester I did not teach (403 on read): no form, no save', async () => {
    stub({ FIRST: { status: 403, body: { code: 'TEACHER_STUDENT_ACCESS_DENIED', message: 'x' } } });
    await renderForm();
    expect(await screen.findByText(m.notMine)).toBeTruthy();
    expect(screen.queryByLabelText(m.save)).toBeNull();
  });

  it('403 or 409 on save: the server message, the choice kept', async () => {
    stub({}, () => ({ status: 409, body: { code: 'MEMORIZATION_STUDENT_NOT_ENROLLED', message: 'لم يكن الطالب مسجّلًا في أي قسم خلال هذا السداسي' } }));
    await renderForm();
    await screen.findByText(m.notSetLong);
    await fireEvent.press(option(67, 'الملك'));
    await fireEvent.press(saveButton());
    await settle();
    expect(screen.getByText('لم يكن الطالب مسجّلًا في أي قسم خلال هذا السداسي')).toBeTruthy();
    expect(option(67, 'الملك').props.accessibilityState.selected).toBe(true);
    expect(mockBack).not.toHaveBeenCalled();
  });
});

describe('save safety', () => {
  it('a double tap sends ONE request', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    stub();
    const base = globalThis.fetch;
    globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'PUT') {
        calls.push({ url, method: 'PUT' });
        await gate;
        return { status: 200, ok: true, text: async () => JSON.stringify(SAVED_FIRST) };
      }
      return (base as (u: string, i?: RequestInit) => Promise<unknown>)(url, init);
    }) as unknown as typeof fetch;
    await renderForm();
    await screen.findByText(m.notSetLong);
    await fireEvent.press(option(67, 'الملك'));
    await fireEvent.press(saveButton());
    await fireEvent.press(screen.getByLabelText(m.saving));
    await fireEvent.press(screen.getByLabelText(m.saving));
    await act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(puts()).toHaveLength(1);
  });

  it('offline: nothing saved, the choice stays, saving again works', async () => {
    let online = false;
    stub({}, () => (online ? { status: 200, body: SAVED_FIRST } : 'offline'));
    await renderForm();
    await screen.findByText(m.notSetLong);
    await fireEvent.press(option(67, 'الملك'));
    await fireEvent.press(saveButton());
    await settle();
    expect(screen.getByText(m.offlineSave)).toBeTruthy();
    expect(option(67, 'الملك').props.accessibilityState.selected).toBe(true);
    online = true;
    await fireEvent.press(saveButton());
    await settle();
    expect(puts()).toHaveLength(2);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('server error: message, choice kept', async () => {
    stub({}, () => ({ status: 500, body: {} }));
    await renderForm();
    await screen.findByText(m.notSetLong);
    await fireEvent.press(option(67, 'الملك'));
    await fireEvent.press(saveButton());
    await settle();
    expect(screen.getByText(m.unsaved)).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('an unsaved choice blocks leaving with a confirmation', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    stub();
    await renderForm();
    await screen.findByText(m.notSetLong);
    expect(mockPrevent.active).toBe(false);
    await fireEvent.press(option(67, 'الملك'));
    expect(mockPrevent.active).toBe(true);
    mockPrevent.callback?.({ repeat: jest.fn() });
    expect(alert).toHaveBeenCalledWith(m.leaveTitle, m.leaveMessage, expect.any(Array));
    alert.mockRestore();
  });

  it('after a confirmed save every memorization query is refreshed with the server record', async () => {
    stub({}, () => ({ status: 200, body: recordFixture('st1', 'FIRST', 67, 'الملك', '2026-11-16T10:00:00Z') }));
    await renderForm();
    await screen.findByText(m.notSetLong);
    client.setQueryData(['teacher', 't-me', 'memorization', 'c1', YEAR_FIXTURE.id, 'FIRST'], { stale: false });
    await fireEvent.press(option(67, 'الملك'));
    await fireEvent.press(saveButton());
    await settle();
    expect(client.getQueryState(['teacher', 't-me', 'memorization', 'c1', YEAR_FIXTURE.id, 'FIRST'])?.isInvalidated).toBe(true);
  });
});
