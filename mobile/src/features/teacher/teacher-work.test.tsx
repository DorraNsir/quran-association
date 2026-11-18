import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { SessionUser } from '@/features/auth/types';
import { ar } from '@/i18n/ar';

import { eligible, workItem, workPage, workProgram, workSession } from './__fixtures__/work';
import { workspaceFixture } from './__fixtures__/workspace';
import { TeacherWorkScreen } from './teacher-work';
import { TeacherWorkEvaluateScreen } from './teacher-work-evaluate';
import { TeacherWorkFormScreen } from './teacher-work-form';
import { TeacherWorkProgramScreen } from './teacher-work-program';
import { TeacherWorkScheduleScreen } from './teacher-work-schedule';
import { CONFIRMATION_MS } from './use-confirm-then-back';
import { workProgramKey } from './use-work';
import { progressOf } from './work-model';
import type { WorkProgram } from './work-types';

/*
 * «متابعة برنامج العمل» screens against stubbed HTTP answers shaped like the
 * work-followup DTOs (test-only fixtures). Only native modules, navigation
 * and the network are replaced.
 */
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockPreventRemove = { active: false };
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace, canGoBack: () => true }),
  useNavigation: () => ({ isFocused: () => true }),
  Stack: { Screen: () => null },
  usePreventRemove: (active: boolean) => {
    mockPreventRemove = { active };
    return () => {
      mockPreventRemove = { active: false };
    };
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
type Call = { method: string; url: string; path: string; params: URLSearchParams; body?: unknown };
const calls: Call[] = [];
let route: (c: Call) => Answer | undefined = () => undefined;

const ok = (body: unknown): Answer => ({ status: 200, body });
const PREFS = { timezone: 'Africa/Tunis', dateFormat: 'DD/MM/YYYY', defaultCalendarView: 'week', defaultPageSize: 20, currentAcademicYear: null };

/** Defaults: preferences, workspace, one program list/detail; `custom` answers first. */
function stub(custom: (c: Call) => Answer | undefined = () => undefined, program: WorkProgram = workProgram()) {
  calls.length = 0;
  route = (c) => {
    const hit = custom(c);
    if (hit) return hit;
    if (c.path.endsWith('/platform-preferences')) return ok(PREFS);
    if (c.path.endsWith('/teacher/workspace')) return ok(workspaceFixture());
    if (c.method === 'GET' && c.path.endsWith('/teacher/work-programs')) return ok(workPage([program]));
    if (c.method === 'GET' && c.path.endsWith(`/teacher/work-programs/${program.id}`)) return ok(program);
    return { status: 500, body: {} };
  };
  globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    const call: Call = {
      method: init?.method ?? 'GET',
      url,
      path: u.pathname,
      params: u.searchParams,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    const a = route(call)!;
    if (a === 'offline') throw new TypeError('Network request failed');
    if (a === 'pending')
      return new Promise((_, reject) =>
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))),
      );
    return { status: a.status, ok: a.status >= 200 && a.status < 300, text: async () => (a.body === undefined ? '' : JSON.stringify(a.body)) };
  }) as unknown as typeof fetch;
}
const writes = () => calls.filter((c) => c.method !== 'GET');
const lists = () => calls.filter((c) => c.method === 'GET' && c.path.endsWith('/teacher/work-programs'));

const clients: QueryClient[] = [];
let client: QueryClient;
function renderScreen(ui: React.ReactElement) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  return render(ui, { wrapper });
}
async function settle(ms = 30) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

beforeEach(() => {
  mockPush.mockReset();
  mockBack.mockReset();
  mockReplace.mockReset();
  mockPreventRemove = { active: false };
});
afterEach(async () => {
  await act(async () => {
    for (const c of clients.splice(0)) {
      await c.cancelQueries();
      c.clear();
    }
  });
});

const w = ar.work;
const radio = (group: string, label: string) => within(screen.getByLabelText(group)).getByRole('radio', { name: label });

describe('list', () => {
  it('shows MY programs from the server with the session, phase, server progress and a preview', async () => {
    stub();
    await renderScreen(<TeacherWorkScreen />);
    expect(await screen.findByText(w.total(1))).toBeTruthy();
    expect(screen.getByText('محمد التونسي')).toBeTruthy();
    expect(screen.getByText('مجموعة الفجر — الفرع الرئيسي')).toBeTruthy();
    expect(screen.getByText('الاثنين 9 نوفمبر 2026')).toBeTruthy();
    expect(screen.getByText(w.phase.PAST)).toBeTruthy();
    expect(screen.getByText('تم إنجاز 1 من أصل 3 أعمال')).toBeTruthy(); // the server's numbers
    expect(screen.getByText(w.pendingCount(1))).toBeTruthy();
    expect(screen.getByText('حفظ صفحتين من سورة البقرة')).toBeTruthy();
    expect(screen.queryByText('مراجعة جزء عمّ')).toBeNull(); // preview: two items
    expect(screen.getByText(w.more(1))).toBeTruthy();
    expect(screen.getByText(w.lastEditedBy('أحمد السالمي'))).toBeTruthy();
    expect(lists()[0]!.params.get('page')).toBe('1');
  });

  it('filters are applied BY THE SERVER: period, state, class, and the student search after a pause', async () => {
    stub();
    await renderScreen(<TeacherWorkScreen />);
    await screen.findByText(w.total(1));
    await fireEvent.press(radio(w.pickPeriod, w.period.upcoming));
    await fireEvent.press(radio(w.pickState, w.state.pending));
    await fireEvent.press(radio(w.pickClass, 'مجموعة الأمل'));
    await settle();
    const last = lists().at(-1)!.params;
    expect([last.get('period'), last.get('state'), last.get('groupClassId')]).toEqual(['upcoming', 'pending', 'c2']);
    const before = lists().length;
    await fireEvent.changeText(screen.getByLabelText(w.searchLabel), 'محم');
    await settle(50);
    expect(lists()).toHaveLength(before); // not on every keystroke
    await settle(450);
    expect(lists().at(-1)!.params.get('q')).toBe('محم');
  });

  it('opened from a class: filtered by that class; from a student: by that student', async () => {
    stub();
    await renderScreen(<TeacherWorkScreen initialClassId="c1" studentId="st1" />);
    await screen.findByText(w.total(1));
    expect(lists()[0]!.params.get('groupClassId')).toBe('c1');
    expect(lists()[0]!.params.get('studentId')).toBe('st1');
    expect(await screen.findByText(w.studentFilter('محمد التونسي'))).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(w.add));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teacher/work/new', params: { studentId: 'st1' } });
  });

  it('server pagination: «عرض المزيد» asks for the next page', async () => {
    const second = workProgram('w2', { student: { id: 'st2', firstName: 'آمنة', lastName: 'التونسي', photoUrl: null } });
    stub((c) =>
      c.method === 'GET' && c.path.endsWith('/teacher/work-programs')
        ? ok(c.params.get('page') === '2' ? workPage([second], 2, 2, 2) : workPage([workProgram()], 1, 2, 2))
        : undefined,
    );
    await renderScreen(<TeacherWorkScreen />);
    await fireEvent.press(await screen.findByLabelText(w.loadMore));
    await settle();
    expect(screen.getByText('آمنة التونسي')).toBeTruthy();
    expect(screen.queryByLabelText(w.loadMore)).toBeNull();
  });

  it('a card opens its program', async () => {
    stub();
    await renderScreen(<TeacherWorkScreen />);
    await fireEvent.press(await screen.findByLabelText(/^برنامج العمل محمد التونسي/));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teacher/work/[id]', params: { id: 'w1' } });
  });

  it('empty: invitation; filtered empty: reset', async () => {
    stub((c) => (c.method === 'GET' && c.path.endsWith('/teacher/work-programs') ? ok(workPage([])) : undefined));
    await renderScreen(<TeacherWorkScreen />);
    expect(await screen.findByText(w.empty)).toBeTruthy();
    await fireEvent.press(radio(w.pickState, w.state.done));
    expect(await screen.findByText(w.noMatch)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(w.resetFilters));
    expect(await screen.findByText(w.empty)).toBeTruthy();
  });

  it('loading, offline (with retry) and 403 states', async () => {
    stub((c) => (c.path.endsWith('/teacher/work-programs') ? 'offline' : undefined));
    await renderScreen(<TeacherWorkScreen />);
    expect(await screen.findByText(ar.states.offlineTitle)).toBeTruthy();
    expect(screen.getByLabelText(ar.states.retry)).toBeTruthy();
  });

  it('403 (inactive teacher profile): the API message, no retry', async () => {
    stub((c) => (c.path.endsWith('/teacher/work-programs') ? { status: 403, body: { code: 'TEACHER_INACTIVE', message: 'ملف المعلم غير نشط' } } : undefined));
    await renderScreen(<TeacherWorkScreen />);
    expect(await screen.findByText(ar.states.forbiddenTitle)).toBeTruthy();
    expect(screen.queryByLabelText(ar.states.retry)).toBeNull();
  });

  it('loading state', async () => {
    stub((c) => (c.path.endsWith('/teacher/work-programs') ? 'pending' : undefined));
    await renderScreen(<TeacherWorkScreen />);
    expect(await screen.findByLabelText(ar.states.loading)).toBeTruthy();
  });
});

describe('program details', () => {
  const linked = workProgram('w1', {
    items: [
      workItem('i1', {
        status: 'NOT_COMPLETED',
        carriedFrom: { itemId: 'x0', programId: 'w0', sessionId: 's0', sessionDate: '2026-11-02', status: 'PARTIAL' },
        carriedTo: [{ itemId: 'x2', programId: 'w2', sessionId: 's2', sessionDate: '2026-11-16' }],
      }),
      workItem('i2', { type: 'RECITATION', recitationNumber: 2, description: 'العرضة الثانية من سورة التوبة', status: 'COMPLETED', evaluationComment: 'ممتاز', evaluatedBy: 'سارة بن علي', evaluatedAt: '2026-11-09T16:30:00.000Z' }),
      workItem('i3', { status: 'COMPLETED' }),
    ],
  });

  it('every item in full: type, result, comment, evaluator, links; notes and last editor', async () => {
    stub(undefined, linked);
    await renderScreen(<TeacherWorkProgramScreen programId="w1" />);
    expect(await screen.findByText(w.itemsCount(3))).toBeTruthy();
    expect(screen.getByLabelText('عرضة 2')).toBeTruthy();
    expect(screen.getAllByText(w.status.COMPLETED)).toHaveLength(2);
    expect(screen.getByText(/ممتاز/)).toBeTruthy();
    expect(screen.getByText(w.evaluatedBy('سارة بن علي', '9 نوفمبر 2026'))).toBeTruthy();
    expect(screen.getByText(w.carriedFrom('2 نوفمبر 2026', w.status.PARTIAL))).toBeTruthy();
    expect(screen.getByText(w.carriedTo('16 نوفمبر 2026'))).toBeTruthy();
    expect(screen.getByText('تحسّن ملحوظ في التجويد')).toBeTruthy();
    expect(screen.getByText(w.lastEditedBy('أحمد السالمي'))).toBeTruthy();
  });

  it('actions only where the API allows them: transfer for unfinished, next recitation for عرضة', async () => {
    stub(undefined, linked);
    await renderScreen(<TeacherWorkProgramScreen programId="w1" />);
    await screen.findByText(w.itemsCount(3));
    expect(screen.getAllByRole('button', { name: new RegExp(`^${w.carry}`) })).toHaveLength(1); // i1 only
    expect(screen.getAllByRole('button', { name: new RegExp(`^${w.next}`) })).toHaveLength(1); // i2 only
    await fireEvent.press(screen.getByLabelText(`${w.carry}: حفظ صفحتين من سورة البقرة`));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teacher/work/[id]/schedule', params: { id: 'w1', itemId: 'i1', mode: 'carry' } });
    await fireEvent.press(screen.getAllByLabelText(w.openLinked)[0]!);
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/teacher/work/[id]', params: { id: 'w0' } });
    await fireEvent.press(screen.getByLabelText(w.evaluate));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/teacher/work/[id]/evaluate', params: { id: 'w1' } });
    await fireEvent.press(screen.getByLabelText(w.edit));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/teacher/work/[id]/edit', params: { id: 'w1' } });
  });

  it('404 (deleted, or another class in a shared session): «غير موجود», no actions', async () => {
    stub((c) => (c.path.endsWith('/teacher/work-programs/w9') ? { status: 404, body: { code: 'WORK_PROGRAM_NOT_FOUND', message: 'برنامج العمل غير موجود' } } : undefined));
    await renderScreen(<TeacherWorkProgramScreen programId="w9" />);
    expect(await screen.findByText(w.notFound)).toBeTruthy();
    expect(screen.queryByLabelText(w.evaluate)).toBeNull();
    await fireEvent.press(screen.getByLabelText(w.backToList));
    expect(mockReplace).toHaveBeenCalledWith('/teacher/work');
  });

  it('403 (not in this session team) is also «غير موجود»; offline is NOT', async () => {
    stub((c) => (c.path.endsWith('/teacher/work-programs/w9') ? { status: 403, body: { code: 'FORBIDDEN', message: 'x' } } : undefined));
    await renderScreen(<TeacherWorkProgramScreen programId="w9" />);
    expect(await screen.findByText(w.notFound)).toBeTruthy();
  });

  it('offline: the offline state with retry, never «غير موجود»', async () => {
    stub((c) => (c.path.endsWith('/teacher/work-programs/w1') ? 'offline' : undefined));
    await renderScreen(<TeacherWorkProgramScreen programId="w1" />);
    expect(await screen.findByText(ar.states.offlineTitle)).toBeTruthy();
    expect(screen.queryByText(w.notFound)).toBeNull();
  });
});

describe('evaluation («تقييم الأعمال»)', () => {
  const evaluated = (p: WorkProgram, statuses: Record<string, WorkProgram['items'][number]['status']>) => {
    const items = p.items.map((i) => (statuses[i.id] ? { ...i, status: statuses[i.id]!, version: i.version + 1 } : i));
    return { ...p, version: p.version + 1, items, progress: progressOf(items) };
  };

  it('sends ONLY the changed items with their versions, then confirms with the server progress and goes back', async () => {
    const p = workProgram();
    stub((c) => (c.method === 'PATCH' ? ok(evaluated(p, { i1: 'COMPLETED' })) : undefined), p);
    await renderScreen(<TeacherWorkEvaluateScreen programId="w1" />);
    const group = await screen.findByLabelText(w.statusGroup('حفظ صفحتين من سورة البقرة'));
    await fireEvent.press(within(group).getByRole('radio', { name: w.status.COMPLETED }));
    expect(screen.getByText(new RegExp(w.unsaved))).toBeTruthy();
    expect(mockPreventRemove.active).toBe(true);
    await fireEvent.changeText(screen.getByLabelText(w.commentLabel('حفظ صفحتين من سورة البقرة')), '  أحسنت ');
    await fireEvent.press(screen.getByLabelText(w.saveEvaluation));
    await settle();
    expect(writes()).toEqual([
      expect.objectContaining({
        method: 'PATCH',
        path: '/api/teacher/work-programs/w1/evaluation',
        body: { items: [{ id: 'i1', version: 1, status: 'COMPLETED', evaluationComment: 'أحسنت' }] },
      }),
    ]);
    expect(screen.getByRole('alert', { name: `${w.evaluated} — تم إنجاز 2 من أصل 3 أعمال` })).toBeTruthy();
    // The server's program is cached; lists are refetched
    expect(client.getQueryData<WorkProgram>(workProgramKey('t-me', 'w1'))!.items[0]!.status).toBe('COMPLETED');
    await settle(CONFIRMATION_MS + 50);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('teacher notes are sent with the PROGRAM version', async () => {
    const p = workProgram();
    stub((c) => (c.method === 'PATCH' ? ok({ ...p, generalNotes: 'جديد', version: 2 }) : undefined), p);
    await renderScreen(<TeacherWorkEvaluateScreen programId="w1" />);
    await fireEvent.changeText(await screen.findByLabelText(w.generalNotes), 'جديد');
    await fireEvent.press(screen.getByLabelText(w.saveEvaluation));
    await settle();
    expect(writes()[0]!.body).toEqual({ items: [], version: 1, generalNotes: 'جديد' });
  });

  it('nothing changed: the save is disabled, nothing sent', async () => {
    stub();
    await renderScreen(<TeacherWorkEvaluateScreen programId="w1" />);
    const save = await screen.findByLabelText(w.saveEvaluation);
    expect(save.props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText(new RegExp(w.nothingToSave))).toBeTruthy();
  });

  it('409 (someone evaluated meanwhile): explained, edits KEPT, «تحميل آخر القيم» restarts from the server', async () => {
    let latest = workProgram();
    stub((c) => {
      if (c.method === 'PATCH') return { status: 409, body: { code: 'WORK_ITEM_CHANGED', message: 'عدّل مستخدم آخر هذا العمل في الأثناء', conflicts: ['i1'] } };
      if (c.method === 'GET' && c.path.endsWith('/w1')) return ok(latest);
      return undefined;
    });
    await renderScreen(<TeacherWorkEvaluateScreen programId="w1" />);
    const group = await screen.findByLabelText(w.statusGroup('حفظ صفحتين من سورة البقرة'));
    await fireEvent.press(within(group).getByRole('radio', { name: w.status.POSTPONED }));
    await fireEvent.press(screen.getByLabelText(w.saveEvaluation));
    await settle();
    expect(screen.getByText(w.conflictTitle)).toBeTruthy();
    expect(within(group).getByRole('radio', { name: w.status.POSTPONED }).props.accessibilityState.checked).toBe(true);
    expect(mockBack).not.toHaveBeenCalled();
    latest = evaluated(latest, { i1: 'NOT_COMPLETED' });
    await fireEvent.press(screen.getByLabelText(w.reloadLatest));
    await settle();
    const fresh = screen.getByLabelText(w.statusGroup('حفظ صفحتين من سورة البقرة'));
    expect(within(fresh).getByRole('radio', { name: w.status.NOT_COMPLETED }).props.accessibilityState.checked).toBe(true);
  });

  it('offline: nothing saved, the edits stay; a double tap sends ONE request', async () => {
    let release: (() => void) | undefined;
    stub();
    const base = globalThis.fetch;
    let patches = 0;
    globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        patches++;
        await new Promise<void>((r) => (release = r));
        throw new TypeError('Network request failed');
      }
      return (base as unknown as (u: string, i?: RequestInit) => Promise<Response>)(url, init);
    }) as unknown as typeof fetch;
    await renderScreen(<TeacherWorkEvaluateScreen programId="w1" />);
    const group = await screen.findByLabelText(w.statusGroup('حفظ صفحتين من سورة البقرة'));
    await fireEvent.press(within(group).getByRole('radio', { name: w.status.PARTIAL }));
    await fireEvent.press(screen.getByLabelText(w.saveEvaluation));
    await fireEvent.press(screen.getByLabelText(w.saving));
    await fireEvent.press(screen.getByLabelText(w.saving));
    expect(patches).toBe(1);
    await act(async () => release?.());
    await settle();
    expect(screen.getByRole('alert', { name: w.offlineSave })).toBeTruthy();
    expect(within(group).getByRole('radio', { name: w.status.PARTIAL }).props.accessibilityState.checked).toBe(true);
    expect(mockPreventRemove.active).toBe(true);
  });

  it('a comment over 1000 characters is refused before sending', async () => {
    stub();
    await renderScreen(<TeacherWorkEvaluateScreen programId="w1" />);
    await fireEvent.changeText(await screen.findByLabelText(w.commentLabel('حفظ صفحتين من سورة البقرة')), 'ا'.repeat(1001));
    expect(screen.getByRole('alert', { name: w.commentTooLong })).toBeTruthy();
    expect(screen.getByLabelText(w.saveEvaluation).props.accessibilityState.disabled).toBe(true);
  });
});

describe('planning (create / edit)', () => {
  it('create: student → their eligible upcoming sessions → items → POST; then back', async () => {
    const created = workProgram('w5', { session: workSession('s20', '2026-11-18') });
    stub((c) => {
      if (c.path.endsWith('/eligible-sessions')) return ok([eligible('s20', '2026-11-18'), eligible('s21', '2026-11-25', 'w6')]);
      if (c.method === 'POST') return { status: 201, body: created };
      return undefined;
    });
    await renderScreen(<TeacherWorkFormScreen />);
    // Validation before sending
    await fireEvent.press(await screen.findByLabelText(w.savePlan));
    expect(screen.getByRole('alert', { name: w.errors.studentRequired })).toBeTruthy();
    expect(writes()).toHaveLength(0);

    await fireEvent.press(screen.getByLabelText(`${w.student}: ${w.pickStudent}`));
    await fireEvent.press(screen.getByRole('radio', { name: 'محمد التونسي' }));
    await settle();
    expect(calls.find((c) => c.path.endsWith('/eligible-sessions'))!.params.get('studentId')).toBe('st1');
    await fireEvent.press(screen.getByRole('radio', { name: /^الأربعاء 18 نوفمبر 2026/ }));
    await fireEvent.press(within(screen.getByLabelText(`${w.itemType} — ${w.itemN(1)}`)).getByRole('radio', { name: w.type.MEMORIZATION }));
    await fireEvent.changeText(screen.getByLabelText(`${w.itemDescription} — ${w.itemN(1)}`), '  حفظ سورة الملك ');
    await fireEvent.press(screen.getByLabelText(w.addItem));
    await fireEvent.press(within(screen.getByLabelText(`${w.itemType} — ${w.itemN(2)}`)).getByRole('radio', { name: w.type.RECITATION }));
    await fireEvent.changeText(screen.getByLabelText(`${w.itemDescription} — ${w.itemN(2)}`), 'العرضة الأولى من سورة يس');
    await fireEvent.changeText(screen.getByLabelText(`${w.recitationNumber} — ${w.itemN(2)}`), '1');
    await fireEvent.press(screen.getByLabelText(w.savePlan));
    await settle();
    expect(writes()).toEqual([
      expect.objectContaining({
        method: 'POST',
        path: '/api/teacher/work-programs',
        body: {
          studentId: 'st1',
          sessionId: 's20',
          generalNotes: null,
          items: [
            { type: 'MEMORIZATION', description: 'حفظ سورة الملك', recitationNumber: null },
            { type: 'RECITATION', description: 'العرضة الأولى من سورة يس', recitationNumber: 1 },
          ],
        },
      }),
    ]);
    expect(screen.getByRole('alert', { name: w.created })).toBeTruthy();
    await settle(CONFIRMATION_MS + 50);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('a session where the student already has a program: offered for editing, never duplicated', async () => {
    stub((c) => (c.path.endsWith('/eligible-sessions') ? ok([eligible('s21', '2026-11-25', 'w6')]) : undefined));
    await renderScreen(<TeacherWorkFormScreen studentId="st1" />);
    await fireEvent.press(await screen.findByRole('radio', { name: new RegExp(w.hasProgram) }));
    expect(screen.getByLabelText(w.savePlan).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText(w.openExisting));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/teacher/work/[id]/edit', params: { id: 'w6' } });
  });

  it('409 WORK_PROGRAM_EXISTS (created meanwhile): the existing program is offered, the input stays', async () => {
    stub((c) => {
      if (c.path.endsWith('/eligible-sessions')) return ok([eligible('s20', '2026-11-18')]);
      if (c.method === 'POST') return { status: 409, body: { code: 'WORK_PROGRAM_EXISTS', message: 'يوجد برنامج', programId: 'w7' } };
      return undefined;
    });
    await renderScreen(<TeacherWorkFormScreen studentId="st1" />);
    await fireEvent.press(await screen.findByRole('radio', { name: /^الأربعاء 18 نوفمبر 2026/ }));
    await fireEvent.changeText(screen.getByLabelText(`${w.itemDescription} — ${w.itemN(1)}`), 'مراجعة');
    await fireEvent.press(screen.getByLabelText(w.savePlan));
    await settle();
    await fireEvent.press(screen.getByLabelText(w.openExisting));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/teacher/work/[id]/edit', params: { id: 'w7' } });
    expect(screen.getByLabelText(`${w.itemDescription} — ${w.itemN(1)}`).props.value).toBe('مراجعة');
  });

  it('edit: saved items kept (not removable), only changes sent with versions, new items appended', async () => {
    const p = workProgram();
    stub((c) => (c.method === 'PATCH' ? ok(p) : undefined), p);
    await renderScreen(<TeacherWorkFormScreen programId="w1" />);
    expect(await screen.findByText(w.items)).toBeTruthy();
    expect(screen.queryByLabelText(w.removeItem(1))).toBeNull();
    expect(screen.getByLabelText(w.savePlan).props.accessibilityState.disabled).toBe(true); // nothing changed
    await fireEvent.changeText(screen.getByLabelText(`${w.itemDescription} — ${w.itemN(3)}`), 'مراجعة جزء عمّ وتبارك');
    await fireEvent.press(screen.getByLabelText(w.addItem));
    await fireEvent.changeText(screen.getByLabelText(`${w.itemDescription} — ${w.itemN(4)}`), 'اختبار');
    expect(screen.getByLabelText(w.removeItem(4))).toBeTruthy(); // a new, unsaved item can be removed
    await fireEvent.press(screen.getByLabelText(w.savePlan));
    await settle();
    expect(writes()[0]).toEqual(
      expect.objectContaining({
        method: 'PATCH',
        path: '/api/teacher/work-programs/w1',
        body: {
          items: [{ id: 'i3', version: 2, type: 'REVISION', description: 'مراجعة جزء عمّ وتبارك', recitationNumber: null }],
          newItems: [{ type: 'REVISION', description: 'اختبار', recitationNumber: null }],
        },
      }),
    );
    expect(screen.getByRole('alert', { name: w.updated })).toBeTruthy();
  });

  it('a failed save keeps everything typed (server error)', async () => {
    const p = workProgram();
    stub((c) => (c.method === 'PATCH' ? { status: 409, body: { code: 'WORK_SESSION_CANCELLED', message: 'هذه الحصة ملغاة' } } : undefined), p);
    await renderScreen(<TeacherWorkFormScreen programId="w1" />);
    await fireEvent.press(await screen.findByLabelText(w.addItem));
    await fireEvent.changeText(screen.getByLabelText(`${w.itemDescription} — ${w.itemN(4)}`), 'عمل جديد');
    await fireEvent.press(screen.getByLabelText(w.savePlan));
    await settle();
    expect(screen.getByRole('alert', { name: 'هذه الحصة ملغاة' })).toBeTruthy();
    expect(screen.getByLabelText(`${w.itemDescription} — ${w.itemN(4)}`).props.value).toBe('عمل جديد');
    expect(mockBack).not.toHaveBeenCalled();
  });
});

describe('transfer / next recitation', () => {
  const p = workProgram('w1', {
    items: [
      workItem('i1', { status: 'NOT_COMPLETED', carriedTo: [{ itemId: 'x', programId: 'w2', sessionId: 's21', sessionDate: '2026-11-25' }] }),
      workItem('i2', { type: 'RECITATION', recitationNumber: 2, description: 'العرضة الثانية من سورة التوبة', status: 'COMPLETED' }),
    ],
  });

  it('carry: only LATER eligible sessions; a known duplicate is blocked; POST transfer', async () => {
    stub((c) => {
      if (c.path.endsWith('/eligible-sessions')) return ok([eligible('s21', '2026-11-25', 'w2'), eligible('s20', '2026-11-18')]);
      if (c.method === 'POST') return { status: 201, body: workProgram('w3') };
      return undefined;
    }, p);
    await renderScreen(<TeacherWorkScheduleScreen programId="w1" itemId="i1" mode="carry" />);
    expect(await screen.findByText(w.alreadyCarried)).toBeTruthy(); // first option already received it
    const q = calls.find((c) => c.path.endsWith('/eligible-sessions'))!.params;
    expect([q.get('studentId'), q.get('afterSessionId')]).toEqual(['st1', 's9']);
    await fireEvent.press(screen.getByRole('radio', { name: /^الأربعاء 18 نوفمبر 2026/ }));
    expect(screen.getByText(w.createsNew)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(w.confirm));
    await settle();
    expect(writes()).toEqual([
      expect.objectContaining({ method: 'POST', path: '/api/teacher/work-items/i1/transfer', body: { targetSessionId: 's20' } }),
    ]);
    expect(screen.getByRole('alert', { name: `${w.carried} — الأربعاء 18 نوفمبر 2026` })).toBeTruthy();
  });

  it('next recitation: the proposed «العرضة الثالثة…» text, editable, sent with the target', async () => {
    stub((c) => {
      if (c.path.endsWith('/eligible-sessions')) return ok([eligible('s20', '2026-11-18')]);
      if (c.method === 'POST') return { status: 201, body: workProgram('w3') };
      return undefined;
    }, p);
    await renderScreen(<TeacherWorkScheduleScreen programId="w1" itemId="i2" mode="next" />);
    const input = await screen.findByLabelText(w.nextDescription('الثالثة'));
    expect(input.props.value).toBe('العرضة الثالثة من سورة التوبة');
    await fireEvent.press(await screen.findByLabelText(w.confirm));
    await settle();
    expect(writes()[0]).toEqual(
      expect.objectContaining({
        path: '/api/teacher/work-items/i2/next-recitation',
        body: { targetSessionId: 's20', description: 'العرضة الثالثة من سورة التوبة' },
      }),
    );
  });

  it('an action that does not apply to the item (carry a completed one): not offered', async () => {
    stub(undefined, p);
    await renderScreen(<TeacherWorkScheduleScreen programId="w1" itemId="i2" mode="carry" />);
    expect(await screen.findByText(w.notFound)).toBeTruthy();
    expect(screen.queryByLabelText(w.confirm)).toBeNull();
  });
});

describe('evaluation follows the session (server verdict + platform clock)', () => {
  const upcoming = workProgram('w1', {
    session: workSession('s9', '2099-11-09'),
    evaluation: { allowed: false, blockedReason: 'SESSION_NOT_STARTED' },
  });
  const cancelled = workProgram('w1', {
    session: workSession('s9', '2099-11-09', { status: 'CANCELLED' }),
    evaluation: { allowed: false, blockedReason: 'SESSION_CANCELLED' },
    items: [workItem('i1'), workItem('i2', { position: 1, status: 'COMPLETED', description: 'مراجعة جزء عمّ' })],
  });

  it('before the start: «تقييم الأعمال» disabled, the reason shown; planning stays available', async () => {
    stub(undefined, upcoming);
    await renderScreen(<TeacherWorkProgramScreen programId="w1" />);
    const button = await screen.findByLabelText(w.evaluate);
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText(w.evaluationBlocked.NOT_STARTED)).toBeTruthy();
    expect(w.evaluationBlocked.NOT_STARTED).toBe('لا يمكن تقييم برنامج العمل قبل بداية الحصة');
    await fireEvent.press(button);
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByLabelText(w.edit).props.accessibilityState).toMatchObject({ disabled: false });
  });

  it('cancelled session: evaluation disabled; its unevaluated work offers «نقل إلى الحصة القادمة»', async () => {
    stub(undefined, cancelled);
    await renderScreen(<TeacherWorkProgramScreen programId="w1" />);
    expect((await screen.findByLabelText(w.evaluate)).props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText('لا يمكن تقييم برنامج العمل لحصة ملغاة')).toBeTruthy();
    // i1 (unevaluated) only — the completed one is not carried
    expect(screen.getAllByRole('button', { name: new RegExp(`^${w.carry}`) })).toHaveLength(1);
    await fireEvent.press(screen.getByLabelText(`${w.carry}: حفظ صفحتين من سورة البقرة`));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teacher/work/[id]/schedule', params: { id: 'w1', itemId: 'i1', mode: 'carry' } });
  });

  it('cancelled session: the transfer screen accepts the unevaluated item and POSTs it', async () => {
    stub((c) => {
      if (c.path.endsWith('/eligible-sessions')) return ok([eligible('s20', '2099-11-18')]);
      if (c.method === 'POST') return { status: 201, body: workProgram('w3') };
      return undefined;
    }, cancelled);
    await renderScreen(<TeacherWorkScheduleScreen programId="w1" itemId="i1" mode="carry" />);
    await fireEvent.press(await screen.findByRole('radio', { name: /2099/ }));
    await fireEvent.press(screen.getByLabelText(w.confirm));
    await settle();
    expect(writes()).toEqual([
      expect.objectContaining({ method: 'POST', path: '/api/teacher/work-items/i1/transfer', body: { targetSessionId: 's20' } }),
    ]);
  });

  it('a normal session: an unevaluated item is not offered for transfer', async () => {
    stub(undefined, workProgram('w1', { items: [workItem('i1')] }));
    await renderScreen(<TeacherWorkScheduleScreen programId="w1" itemId="i1" mode="carry" />);
    expect(await screen.findByText(w.notFound)).toBeTruthy();
  });

  it('carried from a cancelled session: «منقول من حصة ملغاة»', async () => {
    const carried = workProgram('w1', {
      items: [workItem('i1', { carriedFrom: { itemId: 'x', programId: 'w0', sessionId: 's0', sessionDate: '2026-11-02', status: 'NOT_EVALUATED' } })],
    });
    stub(undefined, carried);
    await renderScreen(<TeacherWorkProgramScreen programId="w1" />);
    expect(await screen.findByText(w.carriedFromCancelled('2 نوفمبر 2026'))).toBeTruthy();
  });

  it('the evaluation screen opened early (a link): the reason and a way back, no form', async () => {
    stub(undefined, upcoming);
    await renderScreen(<TeacherWorkEvaluateScreen programId="w1" />);
    expect(await screen.findByText(w.evaluationBlocked.NOT_STARTED)).toBeTruthy();
    expect(screen.queryByLabelText(w.saveEvaluation)).toBeNull();
    await fireEvent.press(screen.getByLabelText(w.backToProgram));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/teacher/work/[id]', params: { id: 'w1' } });
  });

  it('the API refuses (cancelled meanwhile): its message, the program reloaded, nothing else sent', async () => {
    let current = workProgram('w1');
    const message = 'لا يمكن تقييم برنامج العمل لحصة ملغاة';
    stub((c) => {
      if (c.method === 'PATCH') {
        current = { ...current, session: { ...current.session, status: 'CANCELLED' }, evaluation: { allowed: false, blockedReason: 'SESSION_CANCELLED' } };
        return { status: 409, body: { code: 'WORK_SESSION_CANCELLED', message } };
      }
      if (c.method === 'GET' && c.path.endsWith('/teacher/work-programs/w1')) return ok(current);
      return undefined;
    });
    await renderScreen(<TeacherWorkEvaluateScreen programId="w1" />);
    await screen.findByLabelText(w.saveEvaluation);
    await fireEvent.press(radio(w.statusGroup('حفظ صفحتين من سورة البقرة'), w.status.COMPLETED));
    await fireEvent.press(screen.getByLabelText(w.saveEvaluation));
    await settle();
    expect(writes()).toHaveLength(1);
    // Reloaded: the screen now explains why there is nothing to evaluate
    expect(await screen.findByText(message)).toBeTruthy();
    expect(calls.filter((c) => c.method === 'GET' && c.path.endsWith('/teacher/work-programs/w1')).length).toBeGreaterThan(1);
  });
});

