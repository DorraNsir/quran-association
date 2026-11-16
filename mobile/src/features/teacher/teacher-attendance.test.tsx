import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { SessionUser } from '@/features/auth/types';
import { ar } from '@/i18n/ar';
import { formatDateLong } from '@/i18n/format';

import { attendanceFixture, rosterStudentFixture } from './__fixtures__/sessions';
import { SAVED_CONFIRMATION_MS, TeacherAttendanceScreen } from './teacher-attendance';
import type { RosterTeacher, SessionAttendance } from './types';

/*
 * The attendance screen against stubbed HTTP answers shaped like
 * SessionAttendanceDto (isolated fixtures — no real records). Only native
 * modules, navigation and the network are replaced.
 */
let mockPreventRemove: { active: boolean; callback?: (o: { repeat: () => void }) => void } = { active: false };
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockNav = { canGoBack: true, focused: true };
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: mockReplace, canGoBack: () => mockNav.canGoBack }),
  useNavigation: () => ({ isFocused: () => mockNav.focused }),
  Stack: { Screen: () => null },
  usePreventRemove: (active: boolean, callback: (o: { repeat: () => void }) => void) => {
    mockPreventRemove = { active, callback };
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
let onGet: () => Answer;
let onPut: (body: unknown) => Answer;
const puts = () => calls.filter((c) => c.method === 'PUT');
const gets = () => calls.filter((c) => c.method === 'GET');

function stub(get: () => Answer, put: (body: unknown) => Answer = () => ({ status: 500, body: {} })) {
  calls.length = 0;
  onGet = get;
  onPut = put;
  globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    calls.push({ url, method, body });
    const a = method === 'PUT' ? onPut(body) : onGet();
    if (a === 'offline') throw new TypeError('Network request failed');
    if (a === 'pending')
      return new Promise((_, reject) =>
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))),
      );
    return { status: a.status, ok: a.status >= 200 && a.status < 300, text: async () => (a.body === undefined ? '' : JSON.stringify(a.body)) };
  }) as unknown as typeof fetch;
}

const clients: QueryClient[] = [];
let client: QueryClient;
function renderScreen() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  return render(<TeacherAttendanceScreen sessionId="s1" />, { wrapper });
}
async function settle(ms = 30) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}
/** fireEvent is async in Testing Library 14: always awaited (no overlapping act scopes). */
async function press(element: Parameters<typeof fireEvent.press>[0]) {
  await fireEvent.press(element);
}
const a = ar.attendance;
/** The status button of a student's radio group. */
const statusButton = (name: string, status: keyof typeof a.short) =>
  within(screen.getByLabelText(a.statusGroup(name))).getByLabelText(a.status[status]);
const saveButton = () => screen.getByLabelText(a.save);

beforeEach(() => {
  mockBack.mockReset();
  mockReplace.mockReset();
  mockNav.canGoBack = true;
  mockNav.focused = true;
});
afterEach(async () => {
  await act(async () => {
    for (const c of clients.splice(0)) {
      await c.cancelQueries();
      c.clear();
    }
  });
});

describe('recording attendance', () => {
  it('new records: only the touched students are sent, with expectedStatus; the server answer is shown', async () => {
    const after = attendanceFixture({
      students: [
        rosterStudentFixture('st1', 'محمد', { recorded: true, status: 'PRESENT' }),
        rosterStudentFixture('st2', 'آمنة', { recorded: true, status: 'LATE', note: 'وصلت متأخرة 10 دقائق' }),
        rosterStudentFixture('st3', 'يوسف', { recorded: true, status: 'ABSENT' }),
      ],
      complete: true,
      recordedCount: 3,
      sessionStatus: 'COMPLETED',
    });
    stub(() => ({ status: 200, body: attendanceFixture() }), () => ({ status: 200, body: after }));
    await renderScreen();
    expect(await screen.findByText(formatDateLong('2026-11-16'))).toBeTruthy();
    expect(saveButton().props.accessibilityState.disabled).toBe(true); // nothing to save yet

    await press(statusButton('يوسف التونسي', 'ABSENT'));
    expect(screen.getByText(a.unsaved(1))).toBeTruthy();
    expect(puts()).toHaveLength(0); // never sent on selection

    await press(saveButton());
    await settle();
    expect(puts()).toHaveLength(1);
    expect(puts()[0]!.body).toEqual({ records: [{ studentId: 'st3', status: 'ABSENT', expectedStatus: null }] });
    expect(puts()[0]!.url).toMatch(/\/teacher\/sessions\/s1\/attendance$/);
    // The server decided the session is complete; the screen shows its answer
    expect(screen.getByText(a.savedSessionCompleted)).toBeTruthy();
    expect(screen.getByText(a.state.COMPLETE)).toBeTruthy();
    expect(screen.getByText(a.progress(3, 3))).toBeTruthy();
    // The save bar became the compact confirmation (no second save possible)
    expect(screen.queryByLabelText(a.save)).toBeNull();
  });

  it('partial save: allowed, announced before saving, and reported after', async () => {
    const start = attendanceFixture({
      students: [rosterStudentFixture('a', 'أنس'), rosterStudentFixture('b', 'بلال'), rosterStudentFixture('c', 'جميلة')],
    });
    const after = attendanceFixture({
      students: [rosterStudentFixture('a', 'أنس', { recorded: true, status: 'PRESENT' }), rosterStudentFixture('b', 'بلال'), rosterStudentFixture('c', 'جميلة')],
    });
    stub(() => ({ status: 200, body: start }), () => ({ status: 200, body: after }));
    await renderScreen();
    await screen.findByLabelText(a.statusGroup('أنس التونسي'));
    await press(statusButton('أنس التونسي', 'PRESENT'));
    expect(screen.getByText(a.partialWarning(2))).toBeTruthy();
    await press(saveButton());
    await settle();
    expect(screen.getByText(a.savedPartial(2))).toBeTruthy();
    expect(screen.getByText(a.state.PARTIAL)).toBeTruthy();
  });

  it('«تحديد الباقين حاضرين» fills only the unrecorded students, still not sent until save', async () => {
    stub(() => ({ status: 200, body: attendanceFixture() }), () => ({ status: 200, body: attendanceFixture() }));
    await renderScreen();
    await press(await screen.findByLabelText(a.markRestPresent(1)));
    expect(puts()).toHaveLength(0);
    await press(saveButton());
    await settle();
    expect(puts()[0]!.body).toEqual({ records: [{ studentId: 'st3', status: 'PRESENT', expectedStatus: null }] });
  });

  it('correction of a saved status sends the previous one as expectedStatus', async () => {
    stub(() => ({ status: 200, body: attendanceFixture() }), () => ({ status: 200, body: attendanceFixture() }));
    await renderScreen();
    await screen.findByLabelText(a.statusGroup('محمد التونسي'));
    await press(statusButton('محمد التونسي', 'EXCUSED'));
    await press(saveButton());
    await settle();
    expect(puts()[0]!.body).toEqual({ records: [{ studentId: 'st1', status: 'EXCUSED', expectedStatus: 'PRESENT' }] });
  });

  it('notes: an edited note is sent; an untouched note is omitted (kept on the server)', async () => {
    stub(() => ({ status: 200, body: attendanceFixture() }), () => ({ status: 200, body: attendanceFixture() }));
    await renderScreen();
    await press(await screen.findByLabelText(`${a.addNote} — محمد التونسي`));
    await fireEvent.changeText(screen.getByLabelText(`${a.note} — محمد التونسي`), 'غادر مبكرًا');
    await press(statusButton('آمنة التونسي', 'PRESENT'));
    await press(saveButton());
    await settle();
    expect(puts()[0]!.body).toEqual({
      records: [
        { studentId: 'st1', status: 'PRESENT', expectedStatus: 'PRESENT', note: 'غادر مبكرًا' },
        { studentId: 'st2', status: 'PRESENT', expectedStatus: 'LATE' },
      ],
    });
  });
});

describe('team attendance — any member records every member, themselves included', () => {
  /** The signed-in teacher (t-me) as SUPERVISOR or ASSISTANT of the session. */
  const team = (myRole: 'SUPERVISOR' | 'ASSISTANT', other: Partial<RosterTeacher> = {}): RosterTeacher[] => {
    const me: RosterTeacher = {
      teacherId: 't-me', firstName: 'أحمد', lastName: 'السالمي', photoUrl: null, role: myRole, recorded: false, status: null, note: null,
    };
    const colleague: RosterTeacher = {
      teacherId: 't-2', firstName: 'سارة', lastName: 'بن علي', photoUrl: null,
      role: myRole === 'SUPERVISOR' ? 'ASSISTANT' : 'SUPERVISOR', recorded: false, status: null, note: null, ...other,
    };
    return myRole === 'SUPERVISOR' ? [me, colleague] : [colleague, me];
  };

  it('a teacher records their OWN attendance (teachers-only save: no `records`, no completion)', async () => {
    stub(
      () => ({ status: 200, body: attendanceFixture({ teachers: team('ASSISTANT') }) }),
      () => ({ status: 200, body: attendanceFixture({ teachers: team('ASSISTANT') }) }),
    );
    await renderScreen();
    await screen.findByLabelText(a.statusGroup('أحمد السالمي'));
    expect(screen.getByText(`${ar.labels.teachingRole.ASSISTANT} · ${ar.classes.you}`)).toBeTruthy();
    await press(statusButton('أحمد السالمي', 'PRESENT'));
    expect(screen.queryByText(a.partialWarning(1))).toBeNull(); // students untouched: no partial warning
    await press(saveButton());
    await settle();
    expect(puts()[0]!.body).toEqual({ teachers: [{ teacherId: 't-me', status: 'PRESENT', expectedStatus: null }] });
    expect(screen.getByText(a.savedTeachers)).toBeTruthy();
    expect(screen.queryByText(a.savedSessionCompleted)).toBeNull();
  });

  it('an ASSISTANT records the SUPERVISOR', async () => {
    stub(() => ({ status: 200, body: attendanceFixture({ teachers: team('ASSISTANT') }) }), () => ({ status: 200, body: attendanceFixture() }));
    await renderScreen();
    await screen.findByLabelText(a.statusGroup('سارة بن علي'));
    expect(screen.getByText(ar.labels.teachingRole.SUPERVISOR)).toBeTruthy();
    await press(statusButton('سارة بن علي', 'LATE'));
    await press(saveButton());
    await settle();
    expect(puts()[0]!.body).toEqual({ teachers: [{ teacherId: 't-2', status: 'LATE', expectedStatus: null }] });
  });

  it('a SUPERVISOR corrects an ASSISTANT (saved status → expectedStatus), with a note', async () => {
    stub(
      () => ({ status: 200, body: attendanceFixture({ teachers: team('SUPERVISOR', { recorded: true, status: 'ABSENT' }) }) }),
      () => ({ status: 200, body: attendanceFixture() }),
    );
    await renderScreen();
    await screen.findByLabelText(a.statusGroup('سارة بن علي'));
    await press(statusButton('سارة بن علي', 'EXCUSED'));
    await press(screen.getByLabelText(`${a.addNote} — سارة بن علي`));
    await fireEvent.changeText(screen.getByLabelText(`${a.note} — سارة بن علي`), 'موعد طبي');
    await press(saveButton());
    await settle();
    expect(puts()[0]!.body).toEqual({
      teachers: [{ teacherId: 't-2', status: 'EXCUSED', expectedStatus: 'ABSENT', note: 'موعد طبي' }],
    });
  });

  it('students and teachers in ONE save', async () => {
    stub(() => ({ status: 200, body: attendanceFixture() }), () => ({ status: 200, body: attendanceFixture() }));
    await renderScreen();
    await screen.findByLabelText(a.statusGroup('يوسف التونسي'));
    await press(statusButton('يوسف التونسي', 'PRESENT'));
    await press(statusButton('سارة بن علي', 'PRESENT'));
    expect(screen.getByText(a.unsaved(2))).toBeTruthy();
    await press(saveButton());
    await settle();
    expect(puts()).toHaveLength(1);
    expect(puts()[0]!.body).toEqual({
      records: [{ studentId: 'st3', status: 'PRESENT', expectedStatus: null }],
      teachers: [{ teacherId: 't-2', status: 'PRESENT', expectedStatus: null }],
    });
    expect(screen.getByRole('alert', { name: /^تم حفظ/ })).toBeTruthy();
    await settle(SAVED_CONFIRMATION_MS + 50);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('shared session, assistant with a limited STUDENT scope: still records the whole team', async () => {
    stub(
      () => ({
        status: 200,
        body: attendanceFixture({
          additionalClasses: [{ id: 'c2', group: { id: 'g2', name: 'مجموعة الأمل' } }],
          scope: { allStudents: false, groupClassIds: ['c2'] },
          students: [rosterStudentFixture('st4', 'خديجة', { groupClass: { id: 'c2', group: { id: 'g2', name: 'مجموعة الأمل' } } })],
          teachers: team('ASSISTANT'),
        }),
      }),
      () => ({ status: 200, body: attendanceFixture() }),
    );
    await renderScreen();
    expect(await screen.findByText(a.notices.assistantScope)).toBeTruthy();
    await press(statusButton('سارة بن علي', 'PRESENT'));
    await press(statusButton('أحمد السالمي', 'PRESENT'));
    await press(saveButton());
    await settle();
    expect(puts()[0]!.body).toEqual({
      teachers: [
        { teacherId: 't-2', status: 'PRESENT', expectedStatus: null },
        { teacherId: 't-me', status: 'PRESENT', expectedStatus: null },
      ],
    });
  });

  it('409 ATTENDANCE_CHANGED on a teacher row: conflict message, edits kept', async () => {
    stub(
      () => ({ status: 200, body: attendanceFixture() }),
      () => ({ status: 409, body: { code: 'ATTENDANCE_CHANGED', message: 'تغيّر الحضور في الأثناء' } }),
    );
    await renderScreen();
    await screen.findByLabelText(a.statusGroup('سارة بن علي'));
    await press(statusButton('سارة بن علي', 'ABSENT'));
    await press(saveButton());
    await settle();
    expect(screen.getByText(a.conflictTitle)).toBeTruthy();
    expect(screen.getByText(a.unsaved(1))).toBeTruthy();
    expect(statusButton('سارة بن علي', 'ABSENT').props.accessibilityState.selected).toBe(true);
  });

  it('offline on a teacher-only save: nothing saved, edits kept', async () => {
    stub(() => ({ status: 200, body: attendanceFixture() }), () => 'offline');
    await renderScreen();
    await screen.findByLabelText(a.statusGroup('سارة بن علي'));
    await press(statusButton('سارة بن علي', 'PRESENT'));
    await press(saveButton());
    await settle();
    expect(screen.getByText(a.offlineSave)).toBeTruthy();
    expect(screen.getByText(a.unsaved(1))).toBeTruthy();
  });
});

describe('server permissions', () => {
  it('correction window closed: saved students locked, unrecorded ones still recordable', async () => {
    stub(() => ({ status: 200, body: attendanceFixture({ correctable: false }) }), () => ({ status: 200, body: attendanceFixture() }));
    await renderScreen();
    expect(await screen.findByText(a.notices.correctionClosed)).toBeTruthy();
    expect(screen.queryByLabelText(a.statusGroup('محمد التونسي'))).toBeNull();
    expect(screen.getAllByText(a.savedLocked)).toHaveLength(3); // st1, st2 and my saved row
    expect(screen.queryByLabelText(a.statusGroup('أحمد السالمي'))).toBeNull();
    expect(screen.getByLabelText(a.statusGroup('سارة بن علي'))).toBeTruthy(); // unrecorded member: still open
    await press(statusButton('يوسف التونسي', 'LATE'));
    await press(saveButton());
    await settle();
    expect(puts()[0]!.body).toEqual({ records: [{ studentId: 'st3', status: 'LATE', expectedStatus: null }] });
  });

  it('future or cancelled session: fully read-only, no save bar', async () => {
    stub(() => ({ status: 200, body: attendanceFixture({ editable: false, correctable: false }) }));
    const view = await renderScreen();
    expect(await screen.findByText(a.notices.notStarted('09:00'))).toBeTruthy();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryByLabelText(a.save)).toBeNull();
    view.unmount();
  });

  it('cancelled session: read-only', async () => {
    stub(() => ({ status: 200, body: attendanceFixture({ sessionStatus: 'CANCELLED', editable: false, correctable: false }) }));
    await renderScreen();
    expect(await screen.findByText(a.notices.cancelled)).toBeTruthy();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('expected=false: an existing record is correctable (as the web); without a record it is never created', async () => {
    stub(
      () => ({
        status: 200,
        body: attendanceFixture({
          students: [
            rosterStudentFixture('st1', 'محمد'),
            rosterStudentFixture('st9', 'سليم', { expected: false, recorded: true, status: 'ABSENT' }),
            rosterStudentFixture('st8', 'سامي', { expected: false }),
          ],
        }),
      }),
      () => ({ status: 200, body: attendanceFixture() }),
    );
    await renderScreen();
    expect(await screen.findByLabelText(a.statusGroup('سليم التونسي'))).toBeTruthy();
    expect(screen.getByText(`${a.notCounted} — ${a.notCountedCorrectable}`)).toBeTruthy();
    expect(screen.queryByLabelText(a.statusGroup('سامي التونسي'))).toBeNull();
    // Not counted: never filled by «تحديد الباقين حاضرين»
    expect(screen.getByLabelText(a.markRestPresent(1))).toBeTruthy();
    await press(statusButton('سليم التونسي', 'EXCUSED'));
    await press(saveButton());
    await settle();
    expect(puts()[0]!.body).toEqual({ records: [{ studentId: 'st9', status: 'EXCUSED', expectedStatus: 'ABSENT' }] });
  });

  it('assistant of a shared session: only students of my classes are editable', async () => {
    stub(() => ({
      status: 200,
      body: attendanceFixture({
        additionalClasses: [{ id: 'c2', group: { id: 'g2', name: 'مجموعة الأمل' } }],
        scope: { allStudents: false, groupClassIds: ['c2'] },
        students: [
          rosterStudentFixture('st4', 'خديجة', { groupClass: { id: 'c2', group: { id: 'g2', name: 'مجموعة الأمل' } } }),
          rosterStudentFixture('st1', 'محمد'), // another class — the server should not send it; locked anyway
        ],
      }),
    }));
    await renderScreen();
    expect(await screen.findByText(a.notices.assistantScope)).toBeTruthy();
    expect(screen.getByLabelText(a.statusGroup('خديجة التونسي'))).toBeTruthy();
    expect(screen.queryByLabelText(a.statusGroup('محمد التونسي'))).toBeNull();
  });
});

describe('save safety', () => {
  it('a double tap sends ONE request; the button is busy meanwhile', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    stub(() => ({ status: 200, body: attendanceFixture() }), () => 'pending');
    globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
      if (method === 'PUT') await gate;
      return { status: 200, ok: true, text: async () => JSON.stringify(attendanceFixture()) };
    }) as unknown as typeof fetch;
    await renderScreen();
    await screen.findByLabelText(a.statusGroup('يوسف التونسي'));
    await press(statusButton('يوسف التونسي', 'PRESENT'));
    // Three taps in a row while the first save is still in flight
    await press(saveButton());
    await press(screen.getByLabelText(a.saving));
    await press(screen.getByLabelText(a.saving));
    expect(screen.getByLabelText(a.saving).props.accessibilityState).toMatchObject({ busy: true });
    await act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(puts()).toHaveLength(1);
  });

  it('offline: nothing saved, the edits stay, saving again works', async () => {
    let online = false;
    stub(() => ({ status: 200, body: attendanceFixture() }), () => (online ? { status: 200, body: attendanceFixture() } : 'offline'));
    await renderScreen();
    await screen.findByLabelText(a.statusGroup('يوسف التونسي'));
    await press(statusButton('يوسف التونسي', 'ABSENT'));
    await press(saveButton());
    await settle();
    expect(screen.getByText(a.offlineSave)).toBeTruthy();
    expect(screen.getByText(a.unsaved(1))).toBeTruthy();
    expect(statusButton('يوسف التونسي', 'ABSENT').props.accessibilityState.selected).toBe(true);
    online = true;
    await press(saveButton());
    await settle();
    expect(puts()).toHaveLength(2);
    expect(puts()[1]!.body).toEqual(puts()[0]!.body);
  });

  it('409 ATTENDANCE_CHANGED: conflict message, edits kept, «تحميل آخر القيم» reloads and clears them', async () => {
    const message = 'عدّل مستخدم آخر حضور هذه الحصة في الأثناء: أعد تحميل الصفحة لرؤية آخر القيم ثم أعد التعديل';
    stub(() => ({ status: 200, body: attendanceFixture() }), () => ({ status: 409, body: { code: 'ATTENDANCE_CHANGED', message } }));
    await renderScreen();
    await screen.findByLabelText(a.statusGroup('محمد التونسي'));
    await press(statusButton('محمد التونسي', 'ABSENT'));
    await press(saveButton());
    await settle();
    expect(screen.getByText(a.conflictTitle)).toBeTruthy();
    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.getByText(a.unsaved(1))).toBeTruthy();
    const before = gets().length;
    await press(screen.getByLabelText(a.reloadLatest));
    await settle();
    expect(gets().length).toBe(before + 1);
    expect(screen.getByText(a.nothingToSave)).toBeTruthy();
  });

  it('409 window closed while the screen was open: server message, roster refreshed, the locked edit is no longer sendable', async () => {
    let closed = false;
    const msg = 'انتهت مهلة تعديل الحضور المسجَّل (7 أيام): يمكن تسجيل غير المسجَّلين فقط، ولتعديل حضور مسجَّل تواصل مع الإدارة';
    stub(
      () => ({ status: 200, body: attendanceFixture({ correctable: !closed }) }),
      () => {
        closed = true;
        return { status: 409, body: { code: 'ATTENDANCE_CORRECTION_WINDOW_CLOSED', message: msg } };
      },
    );
    await renderScreen();
    await screen.findByLabelText(a.statusGroup('محمد التونسي'));
    await press(statusButton('محمد التونسي', 'ABSENT'));
    await press(saveButton());
    await settle(60);
    expect(screen.getByText(msg)).toBeTruthy();
    expect(screen.queryByLabelText(a.statusGroup('محمد التونسي'))).toBeNull(); // now locked: shows the saved value
    expect(screen.getByLabelText(`محمد التونسي، ${a.status.PRESENT}`)).toBeTruthy();
    expect(screen.getByText(a.nothingToSave)).toBeTruthy();
  });

  it('server error: message, edits kept', async () => {
    stub(() => ({ status: 200, body: attendanceFixture() }), () => ({ status: 500, body: {} }));
    await renderScreen();
    await screen.findByLabelText(a.statusGroup('يوسف التونسي'));
    await press(statusButton('يوسف التونسي', 'PRESENT'));
    await press(saveButton());
    await settle();
    expect(screen.getByText(a.unsaved(1))).toBeTruthy();
  });

  it('unsaved changes block leaving (with a confirmation); a confirmed save lifts it', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    stub(() => ({ status: 200, body: attendanceFixture() }), () => ({ status: 200, body: attendanceFixture() }));
    await renderScreen();
    await screen.findByLabelText(a.statusGroup('يوسف التونسي'));
    expect(mockPreventRemove.active).toBe(false);
    await press(statusButton('يوسف التونسي', 'PRESENT'));
    expect(mockPreventRemove.active).toBe(true);
    mockPreventRemove.callback?.({ repeat: jest.fn() });
    expect(alert).toHaveBeenCalledWith(a.leaveTitle, a.leaveMessage, expect.any(Array));
    await press(saveButton());
    await settle();
    expect(mockPreventRemove.active).toBe(false);
    alert.mockRestore();
  });

  it('a successful save refreshes the session queries (details, lists, dashboard) with the server answer', async () => {
    stub(() => ({ status: 200, body: attendanceFixture() }), () => ({ status: 200, body: attendanceFixture({ sessionStatus: 'COMPLETED' }) }));
    await renderScreen();
    await screen.findByLabelText(a.statusGroup('يوسف التونسي'));
    client.setQueryData(['teacher', 't-me', 'sessions', 'detail', 's1'], { stale: false });
    client.setQueryData(['teacher', 't-me', 'sessions', 'pending-count', {}], 3);
    await press(statusButton('يوسف التونسي', 'PRESENT'));
    await press(saveButton());
    await settle();
    expect(client.getQueryState(['teacher', 't-me', 'sessions', 'detail', 's1'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['teacher', 't-me', 'sessions', 'pending-count', {}])?.isInvalidated).toBe(true);
    expect((client.getQueryData(['teacher', 't-me', 'sessions', 'attendance', 's1']) as SessionAttendance).sessionStatus).toBe('COMPLETED');
  });
});

describe('after a confirmed save: compact confirmation, then back', () => {
  const saveOne = async (name = 'يوسف التونسي', status: 'PRESENT' | 'ABSENT' = 'PRESENT') => {
    await screen.findByLabelText(a.statusGroup(name));
    await press(statusButton(name, status));
    await press(saveButton());
    await settle();
  };

  it('students-only save: confirmation stays readable ~1 s, then ONE back through the stack', async () => {
    stub(() => ({ status: 200, body: attendanceFixture() }), () => ({ status: 200, body: attendanceFixture() }));
    await renderScreen();
    await saveOne();
    expect(screen.getByRole('alert', { name: a.savedPartial(1) })).toBeTruthy(); // st2 still unrecorded in the answer
    await settle(SAVED_CONFIRMATION_MS - 300);
    expect(mockBack).not.toHaveBeenCalled(); // still reading the confirmation
    await settle(400);
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled(); // no hard-coded destination
    await settle(SAVED_CONFIRMATION_MS);
    expect(mockBack).toHaveBeenCalledTimes(1); // never twice
  });

  it('teachers-only save: its own confirmation, then back', async () => {
    stub(() => ({ status: 200, body: attendanceFixture() }), () => ({ status: 200, body: attendanceFixture() }));
    await renderScreen();
    await saveOne('سارة بن علي');
    expect(puts()[0]!.body).toEqual({ teachers: [{ teacherId: 't-2', status: 'PRESENT', expectedStatus: null }] });
    expect(screen.getByRole('alert', { name: a.savedTeachers })).toBeTruthy();
    await settle(SAVED_CONFIRMATION_MS + 50);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('no navigation after a failed save; the edits and the error stay', async () => {
    stub(() => ({ status: 200, body: attendanceFixture() }), () => ({ status: 500, body: {} }));
    await renderScreen();
    await saveOne();
    await settle(SAVED_CONFIRMATION_MS + 100);
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByText(a.unsaved(1))).toBeTruthy();
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    expect(screen.getByLabelText(a.save)).toBeTruthy();
  });

  it('no second save during the confirmation: rows are locked, the save button is gone', async () => {
    stub(() => ({ status: 200, body: attendanceFixture() }), () => ({ status: 200, body: attendanceFixture() }));
    await renderScreen();
    await saveOne();
    await press(statusButton('محمد التونسي', 'ABSENT'));
    expect(screen.queryByLabelText(a.save)).toBeNull();
    expect(screen.queryByText(a.unsaved(1))).toBeNull();
    expect(puts()).toHaveLength(1);
  });

  it('leaving with «رجوع» during the confirmation: the timer is cleared, no navigation', async () => {
    stub(() => ({ status: 200, body: attendanceFixture() }), () => ({ status: 200, body: attendanceFixture() }));
    await renderScreen();
    await saveOne();
    const clear = jest.spyOn(globalThis, 'clearTimeout');
    await act(async () => {
      screen.unmount();
    });
    expect(clear).toHaveBeenCalled();
    clear.mockRestore();
    await settle(SAVED_CONFIRMATION_MS + 100);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('the screen is no longer focused when the timer ends: no navigation', async () => {
    stub(() => ({ status: 200, body: attendanceFixture() }), () => ({ status: 200, body: attendanceFixture() }));
    await renderScreen();
    await saveOne();
    mockNav.focused = false;
    await settle(SAVED_CONFIRMATION_MS + 100);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('opened from a link without history: goes to THAT session\'s details', async () => {
    mockNav.canGoBack = false;
    stub(() => ({ status: 200, body: attendanceFixture() }), () => ({ status: 200, body: attendanceFixture() }));
    await renderScreen();
    await saveOne();
    await settle(SAVED_CONFIRMATION_MS + 100);
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/teacher/sessions/[id]', params: { id: 's1' } });
  });
});

describe('read-only states', () => {
  it('loading', async () => {
    stub(() => 'pending');
    await renderScreen();
    expect(await screen.findByLabelText(ar.states.loading)).toBeTruthy();
  });

  it('offline roster: message and retry', async () => {
    let online = false;
    stub(() => (online ? { status: 200, body: attendanceFixture() } : 'offline'));
    await renderScreen();
    expect(await screen.findByText(ar.states.offlineTitle)).toBeTruthy();
    online = true;
    await press(screen.getByLabelText(ar.states.retry));
    await settle();
    expect(screen.getByText(a.progress(2, 3))).toBeTruthy();
  });

  it('not my session (403): the API message, no retry', async () => {
    stub(() => ({ status: 403, body: { code: 'TEACHER_CLASS_ACCESS_DENIED', message: 'لست مكلّفًا بهذا القسم' } }));
    await renderScreen();
    expect(await screen.findByText('لست مكلّفًا بهذا القسم')).toBeTruthy();
    expect(screen.queryByLabelText(ar.states.retry)).toBeNull();
  });
});
