import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { SessionUser } from '@/features/auth/types';
import {
  canonicalOf,
  completionParts,
  workTypeBadges,
  OVERALL_BLOCKED,
  OVERALL_EVALUATION,
  overallChangeText,
  overallPendingNote,
  PERFORMANCE_LABEL,
  WORK_PERFORMANCES,
  WORKLOAD_ORDER,
} from '@/features/quran-reference/work-assignment';
import { ar } from '@/i18n/ar';
import { apiUrl, setAuthBridge } from '@/services/api';
import { lightColors } from '@/theme/colors';

import { eligible, workItem, workPage, workProgram, workSession } from './__fixtures__/work';
import { workspaceFixture } from './__fixtures__/workspace';
import { TeacherStudentScreen } from './teacher-student';
import { TeacherRecitationsScreen } from './teacher-recitations';
import { TeacherStudentRecitationsScreen } from './teacher-student-recitations';
import { TeacherWorkScreen } from './teacher-work';
import { TeacherWorkEvaluateScreen } from './teacher-work-evaluate';
import { TeacherWorkFormScreen } from './teacher-work-form';
import { TeacherWorkProgramScreen } from './teacher-work-program';
import { TeacherWorkScheduleScreen } from './teacher-work-schedule';
import { CONFIRMATION_MS } from './use-confirm-then-back';
import { workProgramKey } from './use-work';
import { platformClock } from './dashboard-model';
import { progressOf } from './work-model';
import type { WorkItem, WorkProgram } from './work-types';

/*
 * «متابعة برنامج العمل» screens against stubbed HTTP answers shaped like the
 * work-followup DTOs (test-only fixtures). Only native modules, navigation
 * and the network are replaced.
 */
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockPreventRemove = { active: false };
const mockTitles: unknown[] = [];
const headerTitles = () => mockTitles;
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace, canGoBack: () => true }),
  useNavigation: () => ({ isFocused: () => true }),
  // the header's own action («+ إضافة») is rendered, as in the app
  Stack: {
    Screen: ({ options }: { options?: { title?: unknown; headerRight?: () => unknown } }) => {
      if (options?.title) mockTitles.push(options.title);
      return options?.headerRight?.() ?? null;
    },
  },
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
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Picks a surah in an item's bottom-sheet surah field («السورة — العمل 1: …»). */
async function pickSurahIn(field: string, item: number, search: string, option: string) {
  await fireEvent.press(screen.getByLabelText(new RegExp(`^${escapeRe(field)} — ${w.itemN(item)}: `)));
  await fireEvent.changeText(screen.getByLabelText(w.searchSurahLabel), search);
  await fireEvent.press(screen.getByRole('radio', { name: option }));
}

describe('list', () => {
  it('one card per program: photo or initial, name, class, the FULL session date, work-type badges and the results — no item previews', async () => {
    stub();
    await renderScreen(<TeacherWorkScreen />);
    expect(await screen.findByText(w.total(1))).toBeTruthy();
    const p = workProgram();
    expect(screen.getByText('محمد التونسي')).toBeTruthy();
    expect(screen.getByText('مجموعة الفجر')).toBeTruthy();
    expect(screen.getByTestId('card-date').props.children).toBe('الاثنين 9 نوفمبر 2026');
    for (const b of workTypeBadges(p.items.map((i) => i.type))) expect(screen.getByTestId(`card-type-${b.type}`)).toBeTruthy();
    for (const part of completionParts(p.items.map((i) => i.status)))
      expect(screen.getByTestId(`card-result-${part.status}`).props.children).toBe(part.text);
    expect(screen.getByText('م', { includeHiddenElements: true })).toBeTruthy(); // no photo: the first letter (hidden from screen readers)
    expect(screen.queryByTestId('avatar-photo', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByTestId('card-overall')).toBeNull(); // no overall evaluation yet: no badge
    // compact: no item previews, no "more", no last editor, no repeated workload, no long intro
    expect(screen.queryByText('حفظ صفحتين من سورة البقرة')).toBeNull();
    expect(screen.queryByText(w.more(1))).toBeNull();
    expect(screen.queryByText(w.lastEditedBy('أحمد السالمي'))).toBeNull();
    expect(screen.queryByText(w.intro)).toBeNull();
    // the whole card opens THAT program
    await fireEvent.press(screen.getByLabelText(new RegExp(`^${w.detailTitle} محمد التونسي`)));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teacher/work/[id]', params: { id: p.id } });
    expect(lists()[0]!.params.get('page')).toBe('1');
  });

  it('card: the four work-type badges (repeated ones counted) and an exact summary — never «كل الأعمال منجزة» with dropped work', async () => {
    const items = [
      workItem('a', { type: 'MEMORIZATION', status: 'COMPLETED' }),
      workItem('b', { position: 1, type: 'REVISION', status: 'CANCELLED' }),
      workItem('c', { position: 2, type: 'RECITATION', status: 'CANCELLED' }),
      workItem('d', { position: 3, type: 'EXAM', status: 'CANCELLED' }),
      workItem('e', { position: 4, type: 'EXAM', status: 'CANCELLED' }),
    ];
    stub(undefined, workProgram('w1', { items }));
    await renderScreen(<TeacherWorkScreen />);
    await screen.findByTestId('card-type-EXAM');
    expect(['MEMORIZATION', 'REVISION', 'RECITATION', 'EXAM'].map((t) => screen.getByTestId(`card-type-${t}`))).toHaveLength(4);
    expect(within(screen.getByTestId('card-type-EXAM')).getByText('اختبار (2)')).toBeTruthy();
    expect(screen.getByTestId('card-result-COMPLETED').props.children).toBe('1 منجز');
    expect(screen.getByTestId('card-result-CANCELLED').props.children).toBe('4 ملغاة');
    expect(screen.queryByText(/كل الأعمال/)).toBeNull();
  });

  it('the session selector shows the chosen session with its FULL date, and can be cleared', async () => {
    stub((c) => (c.path.endsWith('/teacher/work-programs/session-options') ? ok([workSession('s9', '2026-11-15')]) : undefined));
    await renderScreen(<TeacherWorkScreen />);
    await screen.findByText(w.total(1));
    await fireEvent.press(screen.getByLabelText(`${w.sessionFilter}: ${w.allSessions}`));
    await fireEvent.press(screen.getByRole('radio', { name: /^الأحد 15 نوفمبر 2026 · 17:00/ }));
    expect(screen.getByLabelText(`${w.sessionFilter}: الأحد 15 نوفمبر 2026 · 17:00 · مجموعة الفجر`)).toBeTruthy();
    await settle();
    expect(lists().at(-1)!.params.get('sessionId')).toBe('s9');
    await fireEvent.press(screen.getByLabelText(w.clearSession));
    expect(screen.getByLabelText(`${w.sessionFilter}: ${w.allSessions}`)).toBeTruthy();
  });

  it('«تصفية»: period, state and class in one sheet, applied together; the active count and a short summary; the search after a pause', async () => {
    stub();
    await renderScreen(<TeacherWorkScreen />);
    await screen.findByText(w.total(1));
    await fireEvent.press(screen.getByLabelText(w.filter));
    expect(screen.getByText(w.filtersTitle)).toBeTruthy();
    await fireEvent.press(radio(w.pickPeriod, w.period.upcoming));
    await fireEvent.press(radio(w.pickState, w.state.pending));
    await fireEvent.press(radio(w.pickClass, 'مجموعة الأمل'));
    const before = lists().length;
    await settle();
    expect(lists()).toHaveLength(before); // nothing sent before «تطبيق الفلاتر»
    await fireEvent.press(screen.getByLabelText(w.applyFilters));
    await settle();
    const last = lists().at(-1)!.params;
    expect([last.get('period'), last.get('state'), last.get('groupClassId')]).toEqual(['upcoming', 'pending', 'c2']);
    expect(screen.getByLabelText(w.filtersActive(3))).toBeTruthy();
    expect(screen.getByTestId('filters-count').props.children).toBe(3);
    expect(screen.getByText(`${w.total(1)} · ${w.period.upcoming} · ${w.state.pending} · مجموعة الأمل`)).toBeTruthy();
    // «إعادة تعيين» in the sheet, then applied: back to everything
    await fireEvent.press(screen.getByLabelText(w.filtersActive(3)));
    expect(radio(w.pickState, w.state.pending).props.accessibilityState.selected).toBe(true); // opens on the applied filters
    await fireEvent.press(screen.getByLabelText(w.resetShort));
    await fireEvent.press(screen.getByLabelText(w.applyFilters));
    await settle();
    expect(['period', 'state', 'groupClassId'].some((k) => lists().at(-1)!.params.has(k))).toBe(false);
    expect(screen.queryByTestId('filters-count')).toBeNull();
    const n = lists().length;
    await fireEvent.changeText(screen.getByLabelText(w.searchLabel), 'محم');
    await settle(50);
    expect(lists()).toHaveLength(n); // not on every keystroke
    await settle(450);
    expect(lists().at(-1)!.params.get('q')).toBe('محم');
  });

  it('opened from a class: filtered by that class; from a student: by that student', async () => {
    stub();
    await renderScreen(<TeacherWorkScreen initialClassId="c1" studentId="st1" />);
    expect(await screen.findByText(`${w.total(1)} · مجموعة الفجر`)).toBeTruthy(); // the active class, summarised
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
    await fireEvent.press(screen.getByLabelText(w.filter));
    await fireEvent.press(radio(w.pickState, w.state.done));
    await fireEvent.press(screen.getByLabelText(w.applyFilters));
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
    // the evaluation comment «ممتاز», and the «التقييم العام» choice of the same word
    expect(screen.getAllByText(/ممتاز/)).toHaveLength(2);
    expect(screen.getByRole('radio', { name: 'ممتاز' })).toBeTruthy();
    expect(screen.getByLabelText(w.evaluatedBy('سارة بن علي', '9 نوفمبر 2026'))).toBeTruthy();
    expect(screen.getByText(w.evaluationNotes)).toBeTruthy();
    expect(screen.getByLabelText(w.carriedFrom('2 نوفمبر 2026', w.status.PARTIAL))).toBeTruthy();
    expect(screen.getByLabelText(w.carriedTo('16 نوفمبر 2026'))).toBeTruthy();
    // the screen's own title; the student's name stays in the summary card
    expect(screen.getByRole('header', { name: 'محمد التونسي' })).toBeTruthy();
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
    await fireEvent.press(screen.getByLabelText(w.carriedFrom('2 نوفمبر 2026', w.status.PARTIAL)));
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
    await fireEvent.press(await screen.findByLabelText(`${w.session}: ${w.pickSession}`));
    await fireEvent.press(screen.getByRole('radio', { name: /^الأربعاء 18 نوفمبر 2026/ }));
    await fireEvent.press(within(screen.getByLabelText(`${w.itemType} — ${w.itemN(1)}`)).getByRole('radio', { name: w.type.MEMORIZATION }));
    // New items are structured only: no «نص حر», no text field
    expect(within(screen.getByLabelText(`${w.assignmentMode} — ${w.itemN(1)}`)).queryByRole('radio', { name: w.mode.free })).toBeNull();
    await pickSurahIn(w.surah, 1, 'الملك', '67. سورة الملك');
    await fireEvent.changeText(screen.getByLabelText(`${w.fromAyah} — ${w.itemN(1)}`), '1');
    await fireEvent.changeText(screen.getByLabelText(`${w.toAyahOptional} — ${w.itemN(1)}`), '30');
    await fireEvent.press(screen.getByLabelText(w.addItem));
    await fireEvent.press(within(screen.getByLabelText(`${w.itemType} — ${w.itemN(2)}`)).getByRole('radio', { name: w.type.RECITATION }));
    await pickSurahIn(w.surah, 2, 'يس', '36. سورة يس');
    // «متابعة العرضات»: the server numbers a structured عرضة — no number field to fill
    expect(screen.queryByLabelText(`${w.recitationNumber} — ${w.itemN(2)}`)).toBeNull();
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
            { type: 'MEMORIZATION', recitationNumber: null, assignment: { kind: 'AYAH_RANGE', fromSurah: 67, fromAyah: 1, toSurah: 67, toAyah: 30 } },
            { type: 'RECITATION', recitationNumber: null, assignment: { kind: 'SURAH_RANGE', fromSurah: 36, toSurah: 36 } },
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
    await fireEvent.press(await screen.findByLabelText(`${w.session}: ${w.pickSession}`));
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
    await fireEvent.press(await screen.findByLabelText(`${w.session}: ${w.pickSession}`));
    await fireEvent.press(await screen.findByRole('radio', { name: /^الأربعاء 18 نوفمبر 2026/ }));
    await pickSurahIn(w.fromSurah, 1, 'النبأ', '78. سورة النبأ');
    await pickSurahIn(w.toSurah, 1, 'الناس', '114. سورة الناس');
    await fireEvent.press(screen.getByLabelText(w.savePlan));
    await settle();
    await fireEvent.press(screen.getByLabelText(w.openExisting));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/teacher/work/[id]/edit', params: { id: 'w7' } });
    expect(screen.getByLabelText(`${w.fromSurah} — ${w.itemN(1)}: سورة النبأ`)).toBeTruthy();
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
    await pickSurahIn(w.fromSurah, 4, 'الملك', '67. سورة الملك');
    await pickSurahIn(w.toSurah, 4, 'الملك', '67. سورة الملك');
    expect(screen.getByLabelText(w.removeItem(4))).toBeTruthy(); // a new, unsaved item can be removed
    await fireEvent.press(screen.getByLabelText(w.savePlan));
    await settle();
    expect(writes()[0]).toEqual(
      expect.objectContaining({
        method: 'PATCH',
        path: '/api/teacher/work-programs/w1',
        body: {
          items: [{ id: 'i3', version: 2, type: 'REVISION', description: 'مراجعة جزء عمّ وتبارك', recitationNumber: null }],
          newItems: [{ type: 'REVISION', recitationNumber: null, assignment: { kind: 'SURAH_RANGE', fromSurah: 67, toSurah: 67 } }],
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
    await pickSurahIn(w.fromSurah, 4, 'الملك', '67. سورة الملك');
    await pickSurahIn(w.toSurah, 4, 'القلم', '68. سورة القلم');
    await fireEvent.press(screen.getByLabelText(w.savePlan));
    await settle();
    expect(screen.getByRole('alert', { name: 'هذه الحصة ملغاة' })).toBeTruthy();
    expect(screen.getByLabelText(`${w.toSurah} — ${w.itemN(4)}: سورة القلم`)).toBeTruthy();
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
    expect([q.get('studentId'), q.get('afterSessionId'), q.get('forItemId'), q.get('purpose')]).toEqual(['st1', 's9', 'i1', 'TRANSFER']);
    await fireEvent.press(screen.getByRole('radio', { name: /^الأربعاء 18 نوفمبر 2026/ }));
    expect(screen.getByText(w.createsNew)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(w.confirm));
    await settle();
    expect(writes()).toEqual([
      expect.objectContaining({ method: 'POST', path: '/api/teacher/work-items/i1/transfer', body: { targetSessionId: 's20' } }),
    ]);
    expect(screen.getByRole('alert', { name: `${w.carried} — الأربعاء 18 نوفمبر 2026` })).toBeTruthy();
  });

  it('no session keeps the chronology of a whole-surah عرضة: the list is empty, and says why', async () => {
    const tracked = workProgram('w1', {
      items: [workItem('r1', { type: 'RECITATION', recitationNumber: 2, recitation: { surah: 58, attempts: 1 }, status: 'POSTPONED' })],
    });
    stub((c) => (c.path.endsWith('/eligible-sessions') ? ok([]) : undefined), tracked);
    await renderScreen(<TeacherWorkScheduleScreen programId="w1" itemId="r1" mode="carry" />);
    expect(await screen.findByText(`${w.noEligible}. ${w.noEligibleOrder}`)).toBeTruthy();
  });

  it('next recitation: the proposed «العرضة الثالثة…» text, editable, sent with the target', async () => {
    stub((c) => {
      if (c.path.endsWith('/eligible-sessions')) return ok([eligible('s20', '2026-11-18')]);
      if (c.method === 'POST') return { status: 201, body: workProgram('w3') };
      return undefined;
    }, p);
    await renderScreen(<TeacherWorkScheduleScreen programId="w1" itemId="i2" mode="next" />);
    const input = await screen.findByLabelText(w.nextDescription('الثالثة'));
    // only the sessions where the next number keeps the surah's chronology (the server's list)
    const nq = calls.find((c) => c.path.endsWith('/eligible-sessions'))!.params;
    expect([nq.get('forItemId'), nq.get('purpose')]).toEqual(['i2', 'NEXT']);
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
    expect(await screen.findByLabelText(w.carriedFromCancelled('2 نوفمبر 2026'))).toBeTruthy();
    expect(screen.getByText(w.linkCarriedFromCancelled)).toBeTruthy();
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

describe('structured Quranic assignments (Qalun, Tunisian edition)', () => {
  const EDITION = 'qalun-abi-nashit-tn-hannibal-mualim-v1';
  const exact = (value: number) => ({ kind: 'exact' as const, value, touched: value, dataStatus: 'structurally-consistent' });
  const bounded = (greaterThan: number, lessThan: number) => ({
    kind: 'bounded' as const,
    greaterThan,
    lessThan,
    touched: lessThan,
    partialAtStart: true,
    partialAtEnd: true,
    dataStatus: 'structurally-consistent',
  });
  const load = (p: Partial<NonNullable<WorkItem['workload']>> = {}): NonNullable<WorkItem['workload']> => ({
    editionId: EDITION,
    verses: 15,
    surahs: { whole: 0, touched: 1 },
    pages: exact(3),
    juz: bounded(0, 1),
    hizbs: bounded(0, 1),
    quarters: exact(1),
    eighths: exact(2),
    dataStatus: 'structurally-consistent',
    authoritative: false,
    ...p,
  });
  const structured = workProgram('w1', {
    items: [
      workItem('a1', {
        version: 3,
        type: 'MEMORIZATION',
        description: 'سورة البقرة: من الآية 6 إلى الآية 20',
        assignment: { kind: 'AYAH_RANGE', editionId: EDITION, fromSurah: 2, fromAyah: 6, toSurah: 2, toAyah: 20, fromPage: null, toPage: null },
        workload: load({ pages: bounded(0, 2) }),
      }),
      workItem('a2', {
        position: 1,
        type: 'EXAM',
        description: 'مع التركيز على المتشابهات',
        assignment: { kind: 'SURAH_RANGE', editionId: EDITION, fromSurah: 46, fromAyah: 1, toSurah: 114, toAyah: 6, fromPage: null, toPage: null },
        workload: load({ hizbs: { kind: 'unavailable', reason: 'x' } }),
      }),
      workItem('a3', { position: 2, type: 'REVISION', description: 'مراجعة حرة كتبها المعلم' }),
    ],
  });
  const item1 = w.itemN(1);
  const surahField = (label: string, item = item1) => new RegExp(`^${escapeRe(label)} — ${item}: `);

  async function startCreate(post: Answer = { status: 201, body: workProgram('w5') }) {
    stub((c) => {
      if (c.path.endsWith('/eligible-sessions')) return ok([eligible('s20', '2026-11-18')]);
      if (c.method === 'POST') return post;
      return undefined;
    });
    await renderScreen(<TeacherWorkFormScreen studentId="st1" />);
    await fireEvent.press(await screen.findByLabelText(`${w.session}: ${w.pickSession}`));
    await fireEvent.press(await screen.findByRole('radio', { name: /^الأربعاء 18 نوفمبر 2026/ }));
  }
  const chooseType = (label: string, item = item1) =>
    fireEvent.press(within(screen.getByLabelText(`${w.itemType} — ${item}`)).getByRole('radio', { name: label }));
  const chooseMode = (label: string, item = item1) =>
    fireEvent.press(within(screen.getByLabelText(`${w.assignmentMode} — ${item}`)).getByRole('radio', { name: label }));
  async function pickSurah(field: RegExp, search: string, option: string) {
    await fireEvent.press(screen.getByLabelText(field));
    if (search) await fireEvent.changeText(screen.getByLabelText(w.searchSurahLabel), search);
    await fireEvent.press(screen.getByRole('radio', { name: option }));
  }
  const save = async () => {
    await fireEvent.press(screen.getByLabelText(w.savePlan));
    await settle();
  };
  const postedItems = () => (writes().find((c) => c.method === 'POST')?.body as { items: unknown[] } | undefined)?.items;

  it('حفظ by verses: bottom-sheet surah search, verse count shown; references only are sent', async () => {
    await startCreate();
    await chooseType(w.type.MEMORIZATION);
    await pickSurah(surahField(w.surah), 'البقرة', '2. سورة البقرة');
    expect(screen.getByText(w.ayahCountOf(286))).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(`${w.fromAyah} — ${item1}`), '6');
    await fireEvent.changeText(screen.getByLabelText(`${w.toAyahOptional} — ${item1}`), '20');
    await save();
    expect(postedItems()).toEqual([
      { type: 'MEMORIZATION', recitationNumber: null, assignment: { kind: 'AYAH_RANGE', fromSurah: 2, fromAyah: 6, toSurah: 2, toAyah: 20 } },
    ]);
  });

  it('the surah sheet lists all 114 surahs in order and the last ones are reachable', async () => {
    await startCreate();
    await chooseType(w.type.RECITATION);
    await fireEvent.press(screen.getByLabelText(surahField(w.surah)));
    const options = screen.getAllByRole('radio', { name: /^\d+\. سورة / });
    expect(options).toHaveLength(114);
    expect(screen.getByRole('radio', { name: '1. سورة الفاتحة' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: '114. سورة الناس' }));
    expect(screen.getByLabelText(`${w.surah} — ${item1}: سورة الناس`)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(surahField(w.surah)));
    await fireEvent.changeText(screen.getByLabelText(w.searchSurahLabel), 'zzz');
    expect(screen.getByText(w.noSurah)).toBeTruthy();
  });

  it('verse and page validation before sending; pages are the edition numbering (2–604)', async () => {
    await startCreate();
    await chooseType(w.type.MEMORIZATION);
    await pickSurah(surahField(w.surah), 'الفاتحة', '1. سورة الفاتحة');
    await fireEvent.changeText(screen.getByLabelText(`${w.fromAyah} — ${item1}`), '1');
    await fireEvent.changeText(screen.getByLabelText(`${w.toAyahOptional} — ${item1}`), '8');
    await save();
    expect(screen.getByText('آيات هذه السورة من 1 إلى 7')).toBeTruthy();
    expect(screen.getByRole('alert', { name: w.errors.assignmentInvalid })).toBeTruthy();
    await chooseMode(w.mode.pages);
    await fireEvent.changeText(screen.getByLabelText(`${w.fromPage} — ${item1}`), '1');
    await fireEvent.changeText(screen.getByLabelText(`${w.toPageOptional} — ${item1}`), '12');
    await save();
    expect(screen.getByText('صفحات القرآن في هذا المصحف من 2 إلى 604')).toBeTruthy();
    expect(writes()).toHaveLength(0);
    await fireEvent.changeText(screen.getByLabelText(`${w.fromPage} — ${item1}`), '10');
    expect(screen.getByText(new RegExp(w.pagesCover('البقرة 62', 'البقرة 83')))).toBeTruthy();
    await save();
    expect(postedItems()).toEqual([{ type: 'MEMORIZATION', recitationNumber: null, assignment: { kind: 'PAGE_RANGE', fromPage: 10, toPage: 12 } }]);
  });

  it('مراجعة with optional verses and عرضة of one whole surah', async () => {
    await startCreate();
    await pickSurah(surahField(w.fromSurah), 'البقرة', '2. سورة البقرة');
    await pickSurah(surahField(w.toSurah), 'آل عمران', '3. سورة آل عمران');
    await fireEvent.press(screen.getByLabelText(`${w.preciseAyahs} — ${item1}`));
    await fireEvent.changeText(screen.getByLabelText(`${w.fromAyah} (البقرة) — ${item1}`), '142');
    await fireEvent.press(screen.getByLabelText(w.addItem));
    await chooseType(w.type.RECITATION, w.itemN(2));
    await pickSurah(surahField(w.surah, w.itemN(2)), 'الرحمن', '55. سورة الرحمن');
    await save();
    expect(postedItems()).toEqual([
      { type: 'REVISION', recitationNumber: null, assignment: { kind: 'SURAH_RANGE', fromSurah: 2, toSurah: 3, fromAyah: 142 } },
      { type: 'RECITATION', recitationNumber: null, assignment: { kind: 'SURAH_RANGE', fromSurah: 55, toSurah: 55 } },
    ]);
  });

  it('an API refusal is shown in Arabic and the selection stays', async () => {
    await startCreate({ status: 400, body: { code: 'WORK_ASSIGNMENT_REVERSED', message: 'بداية النطاق بعد نهايته' } });
    await chooseType(w.type.RECITATION);
    await pickSurah(surahField(w.surah), 'يس', '36. سورة يس');
    await save();
    expect(screen.getByText('بداية النطاق بعد نهايته')).toBeTruthy();
    expect(screen.getByLabelText(`${w.surah} — ${item1}: سورة يس`)).toBeTruthy();
  });

  it('edit: prepopulated; only the changed assignment is sent; the legacy item stays free text', async () => {
    stub((c) => (c.method === 'PATCH' ? ok(structured) : undefined), structured);
    await renderScreen(<TeacherWorkFormScreen programId="w1" />);
    expect(await screen.findByLabelText(`${w.surah} — ${item1}: سورة البقرة`)).toBeTruthy();
    expect(screen.getByLabelText(`${w.fromAyah} — ${item1}`).props.value).toBe('6');
    expect(screen.getByLabelText(`${w.toAyahOptional} — ${item1}`).props.value).toBe('20');
    const legacy = within(screen.getByLabelText(`${w.assignmentMode} — ${w.itemN(3)}`)).getByRole('radio', { name: w.mode.free });
    expect(legacy.props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText(`${w.itemDescription} — ${w.itemN(3)}`).props.value).toBe('مراجعة حرة كتبها المعلم');
    await fireEvent.changeText(screen.getByLabelText(`${w.toAyahOptional} — ${item1}`), '25');
    await save();
    expect(writes()[0]!.body).toEqual({
      items: [{ id: 'a1', version: 3, type: 'MEMORIZATION', recitationNumber: null, assignment: { kind: 'AYAH_RANGE', fromSurah: 2, fromAyah: 6, toSurah: 2, toAyah: 25 } }],
    });
  });

  it('program screen: summary, workload with its precision, the teacher note; legacy text as written', async () => {
    stub(undefined, structured);
    await renderScreen(<TeacherWorkProgramScreen programId="w1" />);
    expect(await screen.findByText('سورة البقرة: من الآية 6 إلى الآية 20')).toBeTruthy();
    expect(screen.getAllByText(/من الآية 6 إلى الآية 20/)).toHaveLength(1); // the default text is not repeated
    // one concise line under the summary; a bounded page count stays bounded (correct dual form)
    expect(screen.getByText('15 آية · أقل من صفحتين')).toBeTruthy();
    expect(screen.getByTestId('workload-bounded').props.children).toBe('15 آية · أقل من صفحتين');
    // exact parts as such; the unavailable hizb count is left out, never shown as a number
    expect(screen.getByTestId('workload-exact').props.children).toBe('15 آية · 3 صفحات');
    expect(screen.getByText('من سورة الأحقاف إلى سورة الناس')).toBeTruthy();
    expect(screen.queryByText('غير متاح')).toBeNull();
    expect(screen.getByText('مع التركيز على المتشابهات')).toBeTruthy();
    expect(screen.queryByText(/قيد التحقق من النسخة المطبوعة/)).toBeNull(); // no per-item verification sentence
    expect(screen.getByText('مراجعة حرة كتبها المعلم')).toBeTruthy();
  });

  it('transfer keeps the item: the carried copy is shown with the same structured summary', async () => {
    const carried = workProgram('w9', {
      items: [{ ...structured.items[0]!, id: 'c1', carriedFrom: { itemId: 'a1', programId: 'w1', sessionId: 's9', sessionDate: '2026-11-09', status: 'PARTIAL' } }],
    });
    stub(undefined, carried);
    await renderScreen(<TeacherWorkProgramScreen programId="w9" />);
    expect(await screen.findByText('سورة البقرة: من الآية 6 إلى الآية 20')).toBeTruthy();
    expect(screen.getByLabelText(w.carriedFrom('9 نوفمبر 2026', w.status.PARTIAL))).toBeTruthy();
  });
});

describe('mobile refinements: item notes, session selector, workload line', () => {
  // Session labels wrap the times in LTR isolates: matched by their start
  const sessionField = (label: string) => screen.getByLabelText(new RegExp(`^${w.session}: ${label}`));

  it('the session selector opens, closes on choice, keeps the choice visible, and can change it — other fields untouched', async () => {
    stub((c) => {
      if (c.path.endsWith('/eligible-sessions')) return ok([eligible('s20', '2026-11-18'), eligible('s22', '2026-11-20')]);
      if (c.method === 'POST') return { status: 201, body: workProgram('w5') };
      return undefined;
    });
    await renderScreen(<TeacherWorkFormScreen studentId="st1" />);
    await fireEvent.changeText(await screen.findByLabelText(w.generalNotes), 'ملاحظة الحصة');
    // Collapsed: no session list inline
    expect(screen.queryByRole('radio', { name: /^الأربعاء 18 نوفمبر 2026/ })).toBeNull();
    await fireEvent.press(sessionField(w.pickSession));
    await fireEvent.press(screen.getByRole('radio', { name: /^الأربعاء 18 نوفمبر 2026/ }));
    // Closed at once; the choice stays visible in the compact field
    expect(screen.queryByRole('radio', { name: /^الجمعة 20 نوفمبر 2026/ })).toBeNull();
    expect(sessionField('الأربعاء 18 نوفمبر 2026 · ')).toBeTruthy();
    // Reopen: the current one is marked selected; change it
    await fireEvent.press(sessionField('الأربعاء 18 نوفمبر 2026 · '));
    expect(screen.getByRole('radio', { name: /^الأربعاء 18 نوفمبر 2026/ }).props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByRole('radio', { name: /^الجمعة 20 نوفمبر 2026/ }));
    expect(sessionField('الجمعة 20 نوفمبر 2026 · ')).toBeTruthy();
    expect(screen.getByLabelText(w.generalNotes).props.value).toBe('ملاحظة الحصة');
    // The chosen session is what is sent
    await pickSurahIn(w.fromSurah, 1, 'النبأ', '78. سورة النبأ');
    await pickSurahIn(w.toSurah, 1, 'الناس', '114. سورة الناس');
    await fireEvent.press(screen.getByLabelText(w.savePlan));
    await settle();
    expect(writes()[0]!.body).toMatchObject({ sessionId: 's22', generalNotes: 'ملاحظة الحصة' });
  });

  it('new items: structured only — no «نص حر», no text field; incomplete references refused, nothing sent', async () => {
    stub((c) => (c.path.endsWith('/eligible-sessions') ? ok([eligible('s20', '2026-11-18')]) : undefined));
    await renderScreen(<TeacherWorkFormScreen studentId="st1" />);
    await fireEvent.press(await screen.findByLabelText(`${w.session}: ${w.pickSession}`));
    await fireEvent.press(screen.getByRole('radio', { name: /^الأربعاء 18 نوفمبر 2026/ }));
    for (const type of ['MEMORIZATION', 'REVISION', 'RECITATION', 'EXAM'] as const) {
      await fireEvent.press(within(screen.getByLabelText(`${w.itemType} — ${w.itemN(1)}`)).getByRole('radio', { name: w.type[type] }));
      expect(within(screen.getByLabelText(`${w.assignmentMode} — ${w.itemN(1)}`)).queryByRole('radio', { name: w.mode.free })).toBeNull();
      expect(screen.queryByLabelText(`${w.itemDescription} — ${w.itemN(1)}`)).toBeNull();
    }
    expect(screen.queryByText(/مثال: مع التركيز على أحكام المد/)).toBeNull();
    // Half a selection (a حفظ surah without its verses): a clear Arabic error, never free text
    await fireEvent.press(within(screen.getByLabelText(`${w.itemType} — ${w.itemN(1)}`)).getByRole('radio', { name: w.type.MEMORIZATION }));
    await pickSurahIn(w.surah, 1, 'النبأ', '78. سورة النبأ');
    await fireEvent.press(screen.getByLabelText(w.savePlan));
    await settle();
    expect(screen.getByText('حدّد الآية الأولى')).toBeTruthy();
    expect(screen.getByRole('alert', { name: w.errors.assignmentInvalid })).toBeTruthy();
    expect(writes()).toHaveLength(0);
    // Program-level notes stay
    expect(screen.getByLabelText(w.generalNotes)).toBeTruthy();
  });

  it('a structured saved item cannot go back to free text; its hidden description is kept and not resent', async () => {
    const EDITION = 'qalun-abi-nashit-tn-hannibal-mualim-v1';
    const p = workProgram('w1', {
      items: [
        workItem('a1', {
          type: 'EXAM',
          version: 4,
          description: 'مع التركيز على المتشابهات',
          assignment: { kind: 'SURAH_RANGE', editionId: EDITION, fromSurah: 46, fromAyah: 1, toSurah: 114, toAyah: 6, fromPage: null, toPage: null },
        }),
      ],
    });
    stub((c) => (c.method === 'PATCH' ? ok(p) : undefined), p);
    await renderScreen(<TeacherWorkFormScreen programId="w1" />);
    await screen.findByText(w.items);
    expect(within(screen.getByLabelText(`${w.assignmentMode} — ${w.itemN(1)}`)).queryByRole('radio', { name: w.mode.free })).toBeNull();
    expect(screen.queryByLabelText(`${w.itemDescription} — ${w.itemN(1)}`)).toBeNull();
    await pickSurahIn(w.toSurah, 1, 'الملك', '67. سورة الملك');
    await fireEvent.press(screen.getByLabelText(w.savePlan));
    await settle();
    expect(writes()[0]!.body).toEqual({
      items: [{ id: 'a1', version: 4, type: 'EXAM', recitationNumber: null, assignment: { kind: 'SURAH_RANGE', fromSurah: 46, toSurah: 67 } }],
    });
  });

  it('a legacy free-text item: shown and editable as written; converted only by an explicit choice with valid references', async () => {
    const p = workProgram('w1', { items: [workItem('l1', { type: 'EXAM', version: 5, description: 'اختبار حر قديم في جزء تبارك' })] });
    stub((c) => (c.method === 'PATCH' ? ok(p) : undefined), p);
    await renderScreen(<TeacherWorkFormScreen programId="w1" />);
    await screen.findByText(w.items);
    // Kept as free text by default, with its words
    expect(radio(`${w.assignmentMode} — ${w.itemN(1)}`, w.mode.free).props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText(`${w.itemDescription} — ${w.itemN(1)}`).props.value).toBe('اختبار حر قديم في جزء تبارك');
    expect(screen.getByLabelText(w.savePlan).props.accessibilityState.disabled).toBe(true); // nothing changed, nothing sent
    // Explicit conversion: without a starting surah it is refused
    await fireEvent.press(radio(`${w.assignmentMode} — ${w.itemN(1)}`, w.mode.surahs));
    await fireEvent.press(screen.getByLabelText(w.savePlan));
    await settle();
    expect(screen.getByText('اختر سورة البداية')).toBeTruthy();
    expect(writes()).toHaveLength(0);
    await pickSurahIn(w.fromSurah, 1, 'الملك', '67. سورة الملك');
    await pickSurahIn(w.toSurah, 1, 'المرسلات', '77. سورة المرسلات');
    await fireEvent.press(screen.getByLabelText(w.savePlan));
    await settle();
    // Only the assignment is sent: the legacy words stay in the record
    expect(writes()[0]!.body).toEqual({
      items: [{ id: 'l1', version: 5, type: 'EXAM', recitationNumber: null, assignment: { kind: 'SURAH_RANGE', fromSurah: 67, toSurah: 77 } }],
    });
  });

  it('list row: the kinds of work only — the workload stays on the program screen (no duplicate), no verification sentence', async () => {
    const EDITION = 'qalun-abi-nashit-tn-hannibal-mualim-v1';
    const bounded = { kind: 'bounded' as const, greaterThan: 2, lessThan: 3, touched: 3, partialAtStart: true, partialAtEnd: true, dataStatus: 'x' };
    const exactOne = { kind: 'exact' as const, value: 1, touched: 1, dataStatus: 'x' };
    const p = workProgram('w1', {
      items: [
        workItem('a1', {
          type: 'MEMORIZATION',
          description: 'سورة مريم: من الآية 12 إلى الآية 50',
          assignment: { kind: 'AYAH_RANGE', editionId: EDITION, fromSurah: 19, fromAyah: 12, toSurah: 19, toAyah: 50, fromPage: null, toPage: null },
          workload: { editionId: EDITION, verses: 39, surahs: { whole: 0, touched: 1 }, pages: bounded, juz: exactOne, hizbs: exactOne, quarters: exactOne, eighths: exactOne, dataStatus: 'x', authoritative: false },
        }),
      ],
    });
    stub(undefined, p);
    await renderScreen(<TeacherWorkScreen />);
    expect(await screen.findByText('حفظ')).toBeTruthy();
    expect(screen.queryByText('39 آية · بين صفحتين و3 صفحات')).toBeNull();
    expect(screen.queryByText(/قيد التحقق/)).toBeNull(); // no per-item verification sentence
  });
});

describe('optional ending surah and hizbs + pages (mobile)', () => {
  const EDITION = 'qalun-abi-nashit-tn-hannibal-mualim-v1';
  async function startNew() {
    stub((c) => {
      if (c.path.endsWith('/eligible-sessions')) return ok([eligible('s20', '2026-11-18')]);
      if (c.method === 'POST') return { status: 201, body: workProgram('w5') };
      return undefined;
    });
    await renderScreen(<TeacherWorkFormScreen studentId="st1" />);
    await fireEvent.press(await screen.findByLabelText(`${w.session}: ${w.pickSession}`));
    await fireEvent.press(screen.getByRole('radio', { name: /^الأربعاء 18 نوفمبر 2026/ }));
  }
  const posted = () => (writes().find((c) => c.method === 'POST')?.body as { items: unknown[] } | undefined)?.items;

  it('مراجعة with only a starting surah: that whole surah; the ending surah is labelled optional', async () => {
    await startNew();
    expect(screen.getByText('إلى سورة (اختياري)')).toBeTruthy();
    await pickSurahIn(w.fromSurah, 1, 'التوبة', '9. سورة التوبة');
    await fireEvent.press(screen.getByLabelText(w.savePlan));
    await settle();
    expect(posted()).toEqual([{ type: 'REVISION', recitationNumber: null, assignment: { kind: 'SURAH_RANGE', fromSurah: 9, toSurah: 9 } }]);
  });

  it('اختبار with two surahs, then the ending surah cleared: the single surah is sent', async () => {
    await startNew();
    await fireEvent.press(within(screen.getByLabelText(`${w.itemType} — ${w.itemN(1)}`)).getByRole('radio', { name: w.type.EXAM }));
    await pickSurahIn(w.fromSurah, 1, 'التوبة', '9. سورة التوبة');
    await pickSurahIn(w.toSurah, 1, 'النور', '24. سورة النور');
    await fireEvent.press(screen.getByLabelText(`${w.clearToSurah} — ${w.itemN(1)}`));
    expect(screen.getByLabelText(`${w.toSurah} — ${w.itemN(1)}: ${w.pickSurah}`)).toBeTruthy();
    expect(screen.queryByLabelText(`${w.clearToSurah} — ${w.itemN(1)}`)).toBeNull();
    await fireEvent.press(screen.getByLabelText(w.savePlan));
    await settle();
    expect(posted()).toEqual([{ type: 'EXAM', recitationNumber: null, assignment: { kind: 'SURAH_RANGE', fromSurah: 9, toSurah: 9 } }]);
  });

  it('precision without an ending surah: the verses belong to the starting surah', async () => {
    await startNew();
    await pickSurahIn(w.fromSurah, 1, 'التوبة', '9. سورة التوبة');
    await fireEvent.press(screen.getByLabelText(`${w.preciseAyahs} — ${w.itemN(1)}`));
    await fireEvent.changeText(screen.getByLabelText(`${w.fromAyah} (التوبة) — ${w.itemN(1)}`), '10');
    await fireEvent.changeText(screen.getByLabelText(`${w.toAyah} (التوبة) — ${w.itemN(1)}`), '40');
    await fireEvent.press(screen.getByLabelText(w.savePlan));
    await settle();
    expect(posted()).toEqual([{ type: 'REVISION', recitationNumber: null, assignment: { kind: 'SURAH_RANGE', fromSurah: 9, toSurah: 9, fromAyah: 10, toAyah: 40 } }]);
  });

  it('editing: single-surah item re-opens without an ending surah; multi-surah with it; clearing sends the single surah', async () => {
    const a = (to: number, toAyah: number) => ({ kind: 'SURAH_RANGE' as const, editionId: EDITION, fromSurah: 9, fromAyah: 1, toSurah: to, toAyah, fromPage: null, toPage: null });
    const p = workProgram('w1', {
      items: [
        workItem('s1', { type: 'REVISION', version: 2, description: 'سورة التوبة', assignment: a(9, 129) }),
        workItem('s2', { position: 1, type: 'EXAM', version: 3, description: 'من سورة التوبة إلى سورة النور', assignment: a(24, 64) }),
      ],
    });
    stub((c) => (c.method === 'PATCH' ? ok(p) : undefined), p);
    await renderScreen(<TeacherWorkFormScreen programId="w1" />);
    expect(await screen.findByLabelText(`${w.toSurah} — ${w.itemN(1)}: ${w.pickSurah}`)).toBeTruthy();
    expect(screen.getByLabelText(`${w.toSurah} — ${w.itemN(2)}: سورة النور`)).toBeTruthy();
    expect(screen.getByLabelText(w.savePlan).props.accessibilityState.disabled).toBe(true); // unchanged
    await fireEvent.press(screen.getByLabelText(`${w.clearToSurah} — ${w.itemN(2)}`));
    await fireEvent.press(screen.getByLabelText(w.savePlan));
    await settle();
    expect(writes()[0]!.body).toEqual({
      items: [{ id: 's2', version: 3, type: 'EXAM', recitationNumber: null, assignment: { kind: 'SURAH_RANGE', fromSurah: 9, toSurah: 9 } }],
    });
  });

  it('cards and program screen, a snapshot without a size in hizbs: the page measure (no hizbs + pages breakdown); verse count below 100 only', async () => {
    const hp = (hizbsAndPages: unknown, verses: number, pages: unknown) => ({
      editionId: EDITION,
      verses,
      surahs: { whole: 1, touched: 1 },
      pages: pages as NonNullable<WorkItem['workload']>['pages'],
      juz: { kind: 'unavailable' as const, reason: 'x' },
      hizbs: { kind: 'unavailable' as const, reason: 'x' },
      quarters: { kind: 'unavailable' as const, reason: 'x' },
      eighths: { kind: 'unavailable' as const, reason: 'x' },
      hizbsAndPages: hizbsAndPages as NonNullable<WorkItem['workload']>['hizbsAndPages'],
      dataStatus: 'x',
      authoritative: false,
    });
    const a = (from: number, to: number, toAyah: number) => ({ kind: 'SURAH_RANGE' as const, editionId: EDITION, fromSurah: from, fromAyah: 1, toSurah: to, toAyah, fromPage: null, toPage: null });
    const p = workProgram('w1', {
      items: [
        workItem('h1', { type: 'REVISION', description: 'سورة التوبة', assignment: a(9, 9, 129), workload: hp({ kind: 'bounded', hizbs: 1, pages: { greaterThan: 11, lessThan: 13 }, dataStatus: 'x' }, 129, { kind: 'bounded', greaterThan: 20, lessThan: 22, touched: 22, partialAtStart: true, partialAtEnd: true, dataStatus: 'x' }) }),
        workItem('h2', { position: 1, type: 'EXAM', description: 'من سورة النبأ إلى سورة الناس', assignment: a(78, 114, 6), workload: hp({ kind: 'exact', hizbs: 2, pages: 0, dataStatus: 'x' }, 564, { kind: 'exact', value: 23, touched: 23, dataStatus: 'x' }) }),
      ],
    });
    stub(undefined, p);
    await renderScreen(<TeacherWorkProgramScreen programId="w1" />);
    expect(await screen.findByText('بين 20 و22 صفحة')).toBeTruthy();
    expect(screen.getByTestId('workload-bounded').props.children).toBe('بين 20 و22 صفحة');
    expect(screen.getByTestId('workload-exact').props.children).toBe('23 صفحة');
    expect(screen.queryByText(/حزب|129 آية|564 آية/)).toBeNull(); // no breakdown
    expect(screen.queryByTestId('workload-page-hint')).toBeNull(); // pages already shown
    expect(screen.getByText('سورة التوبة')).toBeTruthy();
  });
});

describe('optional ending surah and hizbs + pages (mobile)', () => {
  const EDITION = 'qalun-abi-nashit-tn-hannibal-mualim-v1';
  async function startNew() {
    stub((c) => {
      if (c.path.endsWith('/eligible-sessions')) return ok([eligible('s20', '2026-11-18')]);
      if (c.method === 'POST') return { status: 201, body: workProgram('w5') };
      return undefined;
    });
    await renderScreen(<TeacherWorkFormScreen studentId="st1" />);
    await fireEvent.press(await screen.findByLabelText(`${w.session}: ${w.pickSession}`));
    await fireEvent.press(screen.getByRole('radio', { name: /^الأربعاء 18 نوفمبر 2026/ }));
  }
  const posted = () => (writes().find((c) => c.method === 'POST')?.body as { items: unknown[] } | undefined)?.items;

  it('مراجعة with only a starting surah: that whole surah is sent; the ending surah is labelled optional', async () => {
    await startNew();
    expect(screen.getByText(w.toSurah)).toBeTruthy();
    expect(w.toSurah).toBe('إلى سورة (اختياري)');
    await pickSurahIn(w.fromSurah, 1, 'التوبة', '9. سورة التوبة');
    await fireEvent.press(screen.getByLabelText(w.savePlan));
    await settle();
    expect(posted()).toEqual([{ type: 'REVISION', recitationNumber: null, assignment: { kind: 'SURAH_RANGE', fromSurah: 9, toSurah: 9 } }]);
  });

  it('اختبار with two surahs, then the ending surah cleared: the single surah is sent', async () => {
    await startNew();
    await fireEvent.press(within(screen.getByLabelText(`${w.itemType} — ${w.itemN(1)}`)).getByRole('radio', { name: w.type.EXAM }));
    await pickSurahIn(w.fromSurah, 1, 'التوبة', '9. سورة التوبة');
    await pickSurahIn(w.toSurah, 1, 'النور', '24. سورة النور');
    await fireEvent.press(screen.getByLabelText(`${w.clearToSurah} — ${w.itemN(1)}`));
    expect(screen.getByLabelText(`${w.toSurah} — ${w.itemN(1)}: ${w.pickSurah}`)).toBeTruthy();
    expect(screen.queryByLabelText(`${w.clearToSurah} — ${w.itemN(1)}`)).toBeNull();
    await fireEvent.press(screen.getByLabelText(w.savePlan));
    await settle();
    expect(posted()).toEqual([{ type: 'EXAM', recitationNumber: null, assignment: { kind: 'SURAH_RANGE', fromSurah: 9, toSurah: 9 } }]);
  });

  it('precision without an ending surah: the verses belong to the starting surah', async () => {
    await startNew();
    await pickSurahIn(w.fromSurah, 1, 'التوبة', '9. سورة التوبة');
    await fireEvent.press(screen.getByLabelText(`${w.preciseAyahs} — ${w.itemN(1)}`));
    await fireEvent.changeText(screen.getByLabelText(`${w.fromAyah} (التوبة) — ${w.itemN(1)}`), '10');
    await fireEvent.changeText(screen.getByLabelText(`${w.toAyah} (التوبة) — ${w.itemN(1)}`), '40');
    await fireEvent.press(screen.getByLabelText(w.savePlan));
    await settle();
    expect(posted()).toEqual([
      { type: 'REVISION', recitationNumber: null, assignment: { kind: 'SURAH_RANGE', fromSurah: 9, toSurah: 9, fromAyah: 10, toAyah: 40 } },
    ]);
  });

  it('editing a single-surah item: no ending surah shown; adding one sends the range (version kept)', async () => {
    const p = workProgram('w1', {
      items: [
        workItem('t1', {
          type: 'REVISION',
          version: 2,
          description: 'سورة التوبة',
          assignment: { kind: 'SURAH_RANGE', editionId: EDITION, fromSurah: 9, fromAyah: 1, toSurah: 9, toAyah: 129, fromPage: null, toPage: null },
        }),
      ],
    });
    stub((c) => (c.method === 'PATCH' ? ok(p) : undefined), p);
    await renderScreen(<TeacherWorkFormScreen programId="w1" />);
    expect(await screen.findByLabelText(`${w.fromSurah} — ${w.itemN(1)}: سورة التوبة`)).toBeTruthy();
    expect(screen.getByLabelText(`${w.toSurah} — ${w.itemN(1)}: ${w.pickSurah}`)).toBeTruthy();
    expect(screen.getByLabelText(w.savePlan).props.accessibilityState.disabled).toBe(true); // unchanged
    await pickSurahIn(w.toSurah, 1, 'النور', '24. سورة النور');
    await fireEvent.press(screen.getByLabelText(w.savePlan));
    await settle();
    expect(writes()[0]!.body).toEqual({
      items: [{ id: 't1', version: 2, type: 'REVISION', recitationNumber: null, assignment: { kind: 'SURAH_RANGE', fromSurah: 9, toSurah: 24 } }],
    });
  });

  it('program screen: one size per item — in hizbs from one hizb (exact or «تقريبًا»), pages below; exact total page hint', async () => {
    const snap = (extra: Record<string, unknown>, verses: number, pages: unknown) =>
      ({
        editionId: EDITION,
        verses,
        surahs: { whole: 1, touched: 1 },
        pages,
        juz: { kind: 'unavailable', reason: 'x' },
        hizbs: { kind: 'unavailable', reason: 'x' },
        quarters: { kind: 'unavailable', reason: 'x' },
        eighths: { kind: 'unavailable', reason: 'x' },
        dataStatus: 'x',
        authoritative: false,
        ...extra,
      }) as unknown as NonNullable<WorkItem['workload']>;
    const a = (from: number, to: number, toAyah: number) =>
      ({ kind: 'SURAH_RANGE' as const, editionId: EDITION, fromSurah: from, fromAyah: 1, toSurah: to, toAyah, fromPage: null, toPage: null });
    const exactPages = (value: number) => ({ kind: 'exact', value, touched: value, dataStatus: 'x' });
    const bounded = (greaterThan: number, lessThan: number) => ({ kind: 'bounded', greaterThan, lessThan, touched: lessThan, partialAtStart: true, partialAtEnd: true, dataStatus: 'x' });
    const approx = (hizbs: number) => ({ kind: 'approximate', hizbs, step: hizbs >= 10 ? 1 : 0.5, eighths: { greaterThan: 0, lessThan: 1 } });
    const p = workProgram('w1', {
      items: [
        workItem('h1', { type: 'REVISION', description: 'سورة البقرة', assignment: a(2, 2, 286), workload: snap({ hizbsAndPages: { kind: 'bounded', hizbs: 3, pages: { greaterThan: 16, lessThan: 18 }, dataStatus: 'x' }, hizbEquivalent: approx(5) }, 286, bounded(47, 48)) }),
        workItem('h2', { position: 1, type: 'REVISION', description: 'من سورة الصافات إلى سورة الناس', assignment: a(37, 114, 6), workload: snap({ hizbEquivalent: approx(16) }, 2448, exactPages(159)) }),
        workItem('h3', { position: 2, type: 'EXAM', description: 'من سورة النبأ إلى سورة الناس', assignment: a(78, 114, 6), workload: snap({ hizbEquivalent: { kind: 'exact', hizbs: 2 } }, 564, exactPages(23)) }),
        workItem('h4', { position: 3, type: 'EXAM', description: 'سورة الملك', assignment: a(67, 67, 30), workload: snap({ hizbEquivalent: approx(0.5) }, 30, bounded(2, 3)) }),
      ],
    });
    stub(undefined, p);
    await renderScreen(<TeacherWorkProgramScreen programId="w1" />);
    expect(await screen.findByText('5 أحزاب تقريبًا')).toBeTruthy();
    expect(screen.queryByText(/16 و18 صفحة|286 آية/)).toBeNull();
    // the size, then the exact total pages, lighter, on the same line
    expect(screen.getByText('16 حزبًا تقريبًا · 159 صفحة')).toBeTruthy();
    expect(screen.getByLabelText(`${w.workload}: 16 حزبًا تقريبًا — ${w.totalPages}: 159 صفحة`)).toBeTruthy();
    expect(screen.getByText('حزبان · 23 صفحة')).toBeTruthy();
    expect(screen.getAllByTestId('workload-page-hint')).toHaveLength(2); // bounded pages: never a hint
    expect(screen.getByText('30 آية · بين صفحتين و3 صفحات')).toBeTruthy();
    expect(screen.queryByText(/قيد التحقق/)).toBeNull();
  });
});


describe('حفظ modes (mobile): whole surah, verses (optional end), pages (optional end)', () => {
  const EDITION = 'qalun-abi-nashit-tn-hannibal-mualim-v1';
  async function startNew() {
    stub((c) => {
      if (c.path.endsWith('/eligible-sessions')) return ok([eligible('s20', '2026-11-18')]);
      if (c.method === 'POST') return { status: 201, body: workProgram('w5') };
      return undefined;
    });
    await renderScreen(<TeacherWorkFormScreen studentId="st1" />);
    await fireEvent.press(await screen.findByLabelText(`${w.session}: ${w.pickSession}`));
    await fireEvent.press(screen.getByRole('radio', { name: /^الأربعاء 18 نوفمبر 2026/ }));
    await fireEvent.press(within(screen.getByLabelText(`${w.itemType} — ${w.itemN(1)}`)).getByRole('radio', { name: w.type.MEMORIZATION }));
  }
  const modeRow = () => within(screen.getByLabelText(`${w.assignmentMode} — ${w.itemN(1)}`));
  const posted = () => (writes().find((c) => c.method === 'POST')?.body as { items: unknown[] } | undefined)?.items;

  it('three modes; «سورة كاملة» shows the surah only and sends it alone (an-Nasr)', async () => {
    await startNew();
    expect(modeRow().getAllByRole('radio').map((r) => r.props.accessibilityLabel ?? '')).toHaveLength(3);
    for (const m of [w.mode.wholeSurah, w.mode.ayahs, w.mode.pages]) expect(modeRow().getByRole('radio', { name: m })).toBeTruthy();
    await fireEvent.press(modeRow().getByRole('radio', { name: w.mode.wholeSurah }));
    await pickSurahIn(w.surah, 1, 'النصر', '110. سورة النصر');
    expect(screen.getByText(/سورة النصر كاملة — عدد آيات السورة: 3/)).toBeTruthy();
    expect(screen.queryByLabelText(`${w.fromAyah} — ${w.itemN(1)}`)).toBeNull();
    expect(screen.queryByLabelText(`${w.fromPage} — ${w.itemN(1)}`)).toBeNull();
    await fireEvent.press(screen.getByLabelText(w.savePlan));
    await settle();
    expect(posted()).toEqual([{ type: 'MEMORIZATION', recitationNumber: null, assignment: { kind: 'AYAH_RANGE', fromSurah: 110, toSurah: 110 } }]);
  });

  it('a single verse: the ending verse is optional and can be cleared; switching to pages sends no stale verse', async () => {
    await startNew();
    await pickSurahIn(w.surah, 1, 'البقرة', '2. سورة البقرة');
    await fireEvent.changeText(screen.getByLabelText(`${w.fromAyah} — ${w.itemN(1)}`), '255');
    await fireEvent.changeText(screen.getByLabelText(`${w.toAyahOptional} — ${w.itemN(1)}`), '260');
    await fireEvent.press(screen.getByLabelText(`${w.clearToAyah} — ${w.itemN(1)}`));
    expect(screen.getByLabelText(`${w.toAyahOptional} — ${w.itemN(1)}`).props.value).toBe('');
    expect(screen.queryByLabelText(`${w.clearToAyah} — ${w.itemN(1)}`)).toBeNull();
    await fireEvent.press(modeRow().getByRole('radio', { name: w.mode.pages }));
    expect(screen.queryByLabelText(`${w.fromAyah} — ${w.itemN(1)}`)).toBeNull();
    await fireEvent.changeText(screen.getByLabelText(`${w.fromPage} — ${w.itemN(1)}`), '79');
    await fireEvent.press(screen.getByLabelText(w.savePlan));
    await settle();
    expect(posted()).toEqual([{ type: 'MEMORIZATION', recitationNumber: null, assignment: { kind: 'PAGE_RANGE', fromPage: 79 } }]);
  });

  it('back to verses: a single verse without pages; a missing starting verse / page is refused, nothing sent', async () => {
    await startNew();
    await fireEvent.press(modeRow().getByRole('radio', { name: w.mode.pages }));
    await fireEvent.changeText(screen.getByLabelText(`${w.toPageOptional} — ${w.itemN(1)}`), '82');
    await fireEvent.press(screen.getByLabelText(w.savePlan));
    expect(await screen.findByText('حدّد الصفحة الأولى')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(`${w.clearToPage} — ${w.itemN(1)}`));
    await fireEvent.press(modeRow().getByRole('radio', { name: w.mode.ayahs }));
    await pickSurahIn(w.surah, 1, 'البقرة', '2. سورة البقرة');
    await fireEvent.press(screen.getByLabelText(w.savePlan));
    expect(await screen.findByText('حدّد الآية الأولى')).toBeTruthy();
    expect(posted()).toBeUndefined();
    await fireEvent.changeText(screen.getByLabelText(`${w.fromAyah} — ${w.itemN(1)}`), '255');
    await fireEvent.press(screen.getByLabelText(w.savePlan));
    await settle();
    expect(posted()).toEqual([{ type: 'MEMORIZATION', recitationNumber: null, assignment: { kind: 'AYAH_RANGE', fromSurah: 2, fromAyah: 255, toSurah: 2 } }]);
  });

  it('re-opening: whole surah in «سورة كاملة», a single verse / page with an empty end; only the changed item is sent', async () => {
    const a = (p: Record<string, unknown>) => ({ kind: 'AYAH_RANGE' as const, editionId: EDITION, fromSurah: 110, fromAyah: 1, toSurah: 110, toAyah: 3, fromPage: null, toPage: null, ...p });
    const p = workProgram('w1', {
      items: [
        workItem('m1', { type: 'MEMORIZATION', version: 1, description: 'سورة النصر كاملة', assignment: a({}) }),
        workItem('m2', { position: 1, type: 'MEMORIZATION', version: 1, description: 'سورة البقرة: الآية 255', assignment: a({ fromSurah: 2, toSurah: 2, fromAyah: 255, toAyah: 255 }) }),
        // page 79 of the edition, its real first / last verses (from the reference)
        workItem('m3', { position: 2, type: 'MEMORIZATION', version: 1, description: 'الصفحة 79', assignment: { ...canonicalOf({ kind: 'PAGE_RANGE', fromPage: 79, toPage: 79 })!, editionId: EDITION } }),
      ],
    });
    stub((c) => (c.method === 'PATCH' ? ok(p) : undefined), p);
    await renderScreen(<TeacherWorkFormScreen programId="w1" />);
    const mode = (n: number, m: string) => within(screen.getByLabelText(`${w.assignmentMode} — ${w.itemN(n)}`)).getByRole('radio', { name: m }).props.accessibilityState;
    expect((await screen.findByLabelText(`${w.surah} — ${w.itemN(1)}: سورة النصر`))).toBeTruthy();
    expect(mode(1, w.mode.wholeSurah)).toMatchObject({ selected: true });
    expect(mode(2, w.mode.ayahs)).toMatchObject({ selected: true });
    expect(screen.getByLabelText(`${w.fromAyah} — ${w.itemN(2)}`).props.value).toBe('255');
    expect(screen.getByLabelText(`${w.toAyahOptional} — ${w.itemN(2)}`).props.value).toBe('');
    expect(screen.getByLabelText(`${w.fromPage} — ${w.itemN(3)}`).props.value).toBe('79');
    expect(screen.getByLabelText(`${w.toPageOptional} — ${w.itemN(3)}`).props.value).toBe('');
    expect(screen.getByLabelText(w.savePlan).props.accessibilityState.disabled).toBe(true); // unchanged
    await fireEvent.changeText(screen.getByLabelText(`${w.toPageOptional} — ${w.itemN(3)}`), '82');
    await fireEvent.press(screen.getByLabelText(w.savePlan));
    await settle();
    expect(writes()[0]!.body).toEqual({
      items: [{ id: 'm3', version: 1, type: 'MEMORIZATION', recitationNumber: null, assignment: { kind: 'PAGE_RANGE', fromPage: 79, toPage: 82 } }],
    });
  });

  it('program screen: «سورة النصر كاملة» and the older wording of the same item are not shown as a teacher note', async () => {
    const nasr = { kind: 'AYAH_RANGE' as const, editionId: EDITION, fromSurah: 110, fromAyah: 1, toSurah: 110, toAyah: 3, fromPage: null, toPage: null };
    const p = workProgram('w1', {
      items: [
        workItem('m1', { type: 'MEMORIZATION', description: 'سورة النصر كاملة', assignment: nasr }),
        workItem('m2', { position: 1, type: 'MEMORIZATION', description: 'سورة النصر: من الآية 1 إلى الآية 3', assignment: nasr }),
      ],
    });
    stub(undefined, p);
    await renderScreen(<TeacherWorkProgramScreen programId="w1" />);
    expect(await screen.findAllByText('سورة النصر كاملة')).toHaveLength(2);
    expect(screen.queryByText('سورة النصر: من الآية 1 إلى الآية 3')).toBeNull();
  });
});

describe('«متابعة العرضات» (mobile): each surah its numbered recitations', () => {
  const EDITION = 'qalun-abi-nashit-tn-hannibal-mualim-v1';
  const HISTORY = '/teacher/students/st1/recitations';
  let seq = 0;
  const entry = (number: number | null, e: string, status: string) => {
    seq++;
    return { itemId: `i${seq}`, programId: `p${seq}`, sessionId: `s${seq}`, sessionDate: `2026-11-${String(seq).padStart(2, '0')}`, number, entry: e, status, evaluationComment: null, evaluatedAt: null, evaluatedBy: e === 'PENDING' ? null : 'أحمد السالمي' };
  };
  // al-Mujadila: 1 ملغاة, 2 مؤجلة (rescheduled, keeps 2), 2 منجزة, 3 جزئي → next 4
  const mujadila = {
    surah: 58,
    attempts: 3,
    nextNumber: 4,
    entries: [entry(1, 'CANCELLED', 'CANCELLED'), entry(2, 'POSTPONED', 'POSTPONED'), entry(2, 'COMPLETED', 'COMPLETED'), entry(3, 'PARTIAL', 'PARTIAL')],
  };
  // more than five, no limit
  const baqara = {
    surah: 2,
    attempts: 6,
    nextNumber: 8,
    entries: [1, 2, 3, 4, 5, 6].map((n) => entry(n, 'COMPLETED', 'COMPLETED')).concat(entry(7, 'PENDING', 'NOT_EVALUATED')),
  };
  const history = { studentId: 'st1', surahs: [baqara, mujadila] };
  const labels = () => screen.queryAllByTestId(/^entry-/).map((v) => v.props.accessibilityLabel.split(' — ').slice(0, 2).join(' — '));

  it('history: the student, each surah with its recitations done; the opened surah in order with each result and the next number', async () => {
    stub((c) => (c.path.endsWith(HISTORY) ? ok(history) : undefined));
    await renderScreen(<TeacherStudentRecitationsScreen studentId="st1" initialSurah={58} />);
    expect(await screen.findByText('محمد التونسي')).toBeTruthy();
    expect(await screen.findByText('3 عرضات')).toBeTruthy();
    expect(screen.getByText('6 عرضات')).toBeTruthy();
    expect(screen.getByText('سورة المجادلة — متابعة العرضات')).toBeTruthy();
    expect(labels()).toEqual(['العرضة 1 — ملغاة', 'العرضة 2 — مؤجلة · لا تحتسب', 'العرضة 2 — منجزة', 'العرضة 3 — جزئي']);
    expect(screen.getByTestId('next-recitation').props.children).toBe('التالية: العرضة 4');
    // minimal wording: «لا تحتسب» only for the postponed one; no cycles, targets, «محتسبة» or new-cycle action
    expect(screen.queryAllByText(/لا تحتسب/)).toHaveLength(1);
    expect(screen.queryByText(/دورة|محتسب|من 4/)).toBeNull();
    expect(screen.queryByRole('button', { name: /دورة/ })).toBeNull();
  });

  it('a surah with more than five recitations and a pending one: all listed, numbering continues', async () => {
    stub((c) => (c.path.endsWith(HISTORY) ? ok(history) : undefined));
    await renderScreen(<TeacherStudentRecitationsScreen studentId="st1" />);
    await fireEvent.press(await screen.findByLabelText('سورة البقرة — 6 عرضات'));
    expect(labels()).toHaveLength(7);
    expect(labels().at(-1)).toBe('العرضة 7 — لم تُقيَّم بعد');
    expect(screen.getByTestId('next-recitation').props.children).toBe('التالية: العرضة 8');
  });

  it('empty, error and forbidden states; a student who is not mine is not requested', async () => {
    stub((c) => (c.path.endsWith(HISTORY) ? ok({ studentId: 'st1', surahs: [] }) : undefined));
    await renderScreen(<TeacherStudentRecitationsScreen studentId="st1" />);
    expect(await screen.findByText(w.recitationsEmpty)).toBeTruthy();
    stub((c) => (c.path.endsWith(HISTORY) ? { status: 403, body: { code: 'FORBIDDEN', message: 'x' } } : undefined));
    await renderScreen(<TeacherStudentRecitationsScreen studentId="st1" />);
    expect(await screen.findByText(ar.states.forbiddenTitle)).toBeTruthy();
    stub((c) => (c.path.endsWith(HISTORY) ? { status: 500, body: {} } : undefined));
    await renderScreen(<TeacherStudentRecitationsScreen studentId="st1" />);
    expect(await screen.findByLabelText(/إعادة المحاولة|retry/i)).toBeTruthy();
    stub();
    await renderScreen(<TeacherStudentRecitationsScreen studentId="nobody" />);
    expect(await screen.findByText(w.recitationsUnavailable)).toBeTruthy();
    expect(calls.some((c) => c.path.includes('/recitations'))).toBe(false);
  });

  it('student profile: a visible «متابعة العرضات» entry opens the history', async () => {
    stub();
    await renderScreen(<TeacherStudentScreen studentId="st1" />);
    await fireEvent.press(await screen.findByLabelText(`${w.recitations} — محمد التونسي`));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teacher/students/[id]/recitations', params: { id: 'st1' } });
  });

  const a = (from: number) => ({ kind: 'SURAH_RANGE' as const, editionId: EDITION, fromSurah: from, fromAyah: 1, toSurah: from, toAyah: 22, fromPage: null, toPage: null });
  const tracked = workItem('r1', { type: 'RECITATION', recitationNumber: 4, description: 'العرضة الرابعة من سورة المجادلة', assignment: a(58), recitation: { surah: 58, attempts: 3 } });
  const legacy = workItem('r2', { position: 1, type: 'RECITATION', recitationNumber: 2, description: 'عرضة حرة', assignment: null });

  it('program screen: a structured عرضة shows «سورة المجادلة · 3 عرضات» and opens the surah history; a free-text one shows nothing', async () => {
    stub(undefined, workProgram('w1', { items: [tracked, legacy] }));
    await renderScreen(<TeacherWorkProgramScreen programId="w1" />);
    expect((await screen.findByTestId('recitation-line')).props.children).toBe('3 عرضات');
    expect(screen.getAllByTestId('recitation-line')).toHaveLength(1);
    await fireEvent.press(screen.getByLabelText(`${w.recitationHistory} — سورة المجادلة · 3 عرضات`));
    // «سجل العرضات» opens «متابعة العرضات» on this student and surah
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teacher/recitations', params: { studentId: 'st1', surah: '58' } });
  });

  it('list card: simple — the «عرضة» badge only, no recitation history (that stays on the program screen)', async () => {
    stub(undefined, workProgram('w1', { items: [tracked] }));
    await renderScreen(<TeacherWorkScreen />);
    expect(await screen.findByTestId('card-type-RECITATION')).toBeTruthy();
    expect(screen.queryByText('سورة المجادلة · 3 عرضات')).toBeNull();
    expect(screen.queryByTestId('recitation-line')).toBeNull();
    expect(screen.queryByLabelText(/^سجل العرضات/)).toBeNull();
  });

  async function newRecitation(answer: (c: Call) => Answer | undefined) {
    stub((c) => (c.path.endsWith('/eligible-sessions') ? ok([eligible('s20', '2026-11-18')]) : answer(c)));
    await renderScreen(<TeacherWorkFormScreen studentId="st1" />);
    await fireEvent.press(await screen.findByLabelText(`${w.session}: ${w.pickSession}`));
    await fireEvent.press(screen.getByRole('radio', { name: /^الأربعاء 18 نوفمبر 2026/ }));
    await fireEvent.press(within(screen.getByLabelText(`${w.itemType} — ${w.itemN(1)}`)).getByRole('radio', { name: w.type.RECITATION }));
    await pickSurahIn(w.surah, 1, 'البقرة', '2. سورة البقرة');
  }
  const posted = () => (writes().find((c) => c.method === 'POST')?.body as { items: unknown[] } | undefined)?.items;

  it('form: no number field — «يُحدَّد رقم العرضة تلقائيًا»; nothing numbered is sent', async () => {
    await newRecitation((c) => (c.method === 'POST' ? { status: 201, body: workProgram('w5') } : undefined));
    expect(screen.queryByLabelText(`${w.recitationNumber} — ${w.itemN(1)}`)).toBeNull();
    expect(screen.getByTestId('recitation-auto-number').props.children).toBe('يُحدَّد رقم العرضة تلقائيًا');
    await fireEvent.press(screen.getByLabelText(w.savePlan));
    await settle();
    expect(posted()).toEqual([{ type: 'RECITATION', recitationNumber: null, assignment: { kind: 'SURAH_RANGE', fromSurah: 2, toSurah: 2 } }]);
  });

  it('form: the same surah twice in one session is refused by the server — its Arabic message is shown', async () => {
    const message = 'عرضة هذه السورة مبرمجة في هذه الحصة من قبل';
    await newRecitation((c) => (c.method === 'POST' ? { status: 409, body: { code: 'WORK_RECITATION_DUPLICATE', message } } : undefined));
    await fireEvent.press(screen.getByLabelText(w.savePlan));
    expect(await screen.findByText(message)).toBeTruthy();
  });

  it('form: editing a structured عرضة shows its server number', async () => {
    const p = workProgram('w1', { items: [tracked] });
    stub((c) => (c.method === 'PATCH' ? ok(p) : undefined), p);
    await renderScreen(<TeacherWorkFormScreen programId="w1" />);
    expect((await screen.findByTestId('recitation-auto-number')).props.children).toBe('العرضة 4 — يُحدَّد الرقم تلقائيًا');
    expect(screen.queryByLabelText(`${w.recitationNumber} — ${w.itemN(1)}`)).toBeNull();
  });
});

describe('«ترتيب حسب البرنامج» and compact rows (mobile)', () => {
  const S9 = workSession('s9', '2026-11-09');
  const person = (id: string, firstName: string, photoUrl: string | null = null) => ({ id, firstName, lastName: 'التونسي', photoUrl });
  const order = (group: number | null) =>
    group === null
      ? { comparable: false, group: null, pages: null, examPages: null, reason: 'FREE_TEXT' as const }
      : { comparable: true, group, pages: { lo: 10, hi: 12, exact: false }, examPages: { lo: 0, hi: 0, exact: true }, reason: null };
  const base = [
    workProgram('a', { student: person('sa', 'أمين', '/api/files/photo-a'), session: S9 }),
    workProgram('b', { student: person('sb', 'بلال'), session: S9 }),
    workProgram('c', { student: person('sc', 'جميلة'), session: S9 }),
    workProgram('d', { student: person('sd', 'دينا'), session: S9 }),
  ];
  // the server's advisory order: c alone, then a ≈ d, then b not comparable
  const advisory = [
    { ...base[2]!, workloadOrder: order(0) },
    { ...base[0]!, workloadOrder: order(1) },
    { ...base[3]!, workloadOrder: order(1) },
    { ...base[1]!, workloadOrder: order(null) },
  ];
  const answer = (c: Call) => {
    if (c.path.endsWith('/teacher/work-programs/session-options')) return ok([S9]);
    if (c.method === 'GET' && c.path.endsWith('/teacher/work-programs'))
      return ok(workPage(c.params.get('order') === 'workload' ? advisory : base));
    return undefined;
  };
  const rows = () => screen.queryAllByTestId(/^program-/).map((r) => r.props.testID.replace('program-', ''));
  async function chooseSession(label: RegExp | string) {
    await fireEvent.press(screen.getByLabelText(new RegExp(`^${w.sessionFilter}: `)));
    await fireEvent.press(screen.getByRole('radio', { name: label }));
  }

  it('photos: the real photo when there is one (private, with the token), the first letter otherwise', async () => {
    setAuthBridge({ getAccessToken: () => 'tok', refresh: async () => 'renewed', onSessionEnded: () => undefined });
    stub(answer);
    await renderScreen(<TeacherWorkScreen />);
    await screen.findByText('أمين التونسي');
    expect(screen.getAllByTestId('avatar-photo', { includeHiddenElements: true })).toHaveLength(1);
    const source = [screen.getByTestId('avatar-photo', { includeHiddenElements: true }).props.source].flat()[0];
    expect(source).toMatchObject({ uri: apiUrl('/api/files/photo-a'), headers: { Authorization: 'Bearer tok' } });
    expect(screen.getByText('ب', { includeHiddenElements: true })).toBeTruthy();
    setAuthBridge(null);
  });

  const openSort = () => fireEvent.press(screen.getByLabelText(new RegExp(`^${w.sort}: `)));

  it('off by default; needs a session; on request the server order with its groups; back to the original order', async () => {
    stub(answer);
    await renderScreen(<TeacherWorkScreen />);
    await screen.findByText('أمين التونسي');
    expect(rows()).toEqual(['a', 'b', 'c', 'd']);
    // without a session: «الترتيب» offers the original order only, and says why
    await openSort();
    expect(screen.getByText(WORKLOAD_ORDER.needsSession)).toBeTruthy();
    expect(screen.queryByRole('radio', { name: WORKLOAD_ORDER.workload })).toBeNull();
    await fireEvent.press(radio(w.pickOrder, WORKLOAD_ORDER.original));
    expect(lists().every((c) => !c.params.has('order'))).toBe(true);

    await chooseSession(/^الاثنين 9 نوفمبر 2026/);
    await settle();
    expect(lists().at(-1)!.params.get('sessionId')).toBe('s9');
    await openSort();
    expect(radio(w.pickOrder, WORKLOAD_ORDER.original).props.accessibilityState.selected).toBe(true);
    await fireEvent.press(radio(w.pickOrder, WORKLOAD_ORDER.workload));
    await settle();
    expect([lists().at(-1)!.params.get('order'), lists().at(-1)!.params.get('sessionId'), lists().at(-1)!.params.get('page')]).toEqual(['workload', 's9', '1']);
    expect(rows()).toEqual(['c', 'a', 'd', 'b']);
    expect(screen.getByTestId('section-group').props.children[0]).toBe(WORKLOAD_ORDER.comparable);
    expect(screen.getByTestId('section-unavailable').props.children[0]).toBe(WORKLOAD_ORDER.unavailable);
    expect(screen.getByTestId('order-active').props.children).toBe(WORKLOAD_ORDER.active);
    // no rank numbers anywhere
    expect(screen.queryByText(/الأول|الثاني|الثالث|رتبة/)).toBeNull();

    // the choice holds when the list is reloaded by another filter
    await fireEvent.press(screen.getByLabelText(w.filter));
    await fireEvent.press(radio(w.pickState, w.state.pending));
    await fireEvent.press(screen.getByLabelText(w.applyFilters));
    await settle();
    expect([lists().at(-1)!.params.get('state'), lists().at(-1)!.params.get('order')]).toEqual(['pending', 'workload']);

    await openSort();
    await fireEvent.press(radio(w.pickOrder, WORKLOAD_ORDER.original));
    await settle();
    expect(lists().at(-1)!.params.has('order')).toBe(false);
    expect(rows()).toEqual(['a', 'b', 'c', 'd']);
    expect(screen.queryByTestId('section-group')).toBeNull();
  });

  it('another session is never reordered without being asked', async () => {
    stub(answer);
    await renderScreen(<TeacherWorkScreen />);
    await screen.findByText('أمين التونسي');
    await chooseSession(/^الاثنين 9 نوفمبر 2026/);
    await openSort();
    await fireEvent.press(radio(w.pickOrder, WORKLOAD_ORDER.workload));
    await settle();
    expect(lists().at(-1)!.params.get('order')).toBe('workload');
    // clearing the session (its ×): back to the original order
    await fireEvent.press(screen.getByLabelText(w.clearSession));
    await settle();
    expect(lists().at(-1)!.params.has('sessionId')).toBe(false);
    expect(lists().at(-1)!.params.has('order')).toBe(false);
    await openSort();
    expect(screen.getByText(WORKLOAD_ORDER.needsSession)).toBeTruthy();
  });
});

describe('«اختر الطالب»: photos, search and compact rows (mobile)', () => {
  // the teacher workspace provides each student's photoUrl (private file)
  const workspace = () => {
    const ws = workspaceFixture();
    ws.students = ws.students.map((s) =>
      s.id === 'st1' ? { ...s, photoUrl: '/api/files/photo-st1' } : s.id === 'st2' ? { ...s, photoUrl: '/api/files/missing' } : s,
    );
    ws.students.push({ ...ws.students[0]!, id: 'st9', firstName: 'Sara', lastName: 'Ben Ali', photoUrl: null });
    return ws;
  };
  async function openSheet() {
    setAuthBridge({ getAccessToken: () => 'tok', refresh: async () => 'renewed', onSessionEnded: () => undefined });
    stub((c) => {
      if (c.path.endsWith('/teacher/workspace')) return ok(workspace());
      if (c.path.endsWith('/eligible-sessions')) return ok([eligible('s20', '2026-11-18')]);
      return undefined;
    });
    await renderScreen(<TeacherWorkFormScreen />);
    await fireEvent.press(await screen.findByLabelText(`${w.student}: ${w.pickStudent}`));
  }
  afterEach(() => setAuthBridge(null));
  const sheetStudents = () => screen.queryAllByTestId('student-option').map((r) => r.props.accessibilityLabel);
  const photoOf = (name: string) =>
    within(screen.getByRole('radio', { name })).queryByTestId('avatar-photo', { includeHiddenElements: true });

  it('each row: the real photo (private URL with the token) or the first letter; a broken photo falls back to the letter', async () => {
    await openSheet();
    expect(screen.getByLabelText(w.searchStudentLabel)).toBeTruthy(); // the sheet is open
    const source = [photoOf('محمد التونسي')!.props.source].flat()[0];
    expect(source).toMatchObject({ uri: apiUrl('/api/files/photo-st1'), headers: { Authorization: 'Bearer tok' } });
    // no photo: Latin and Arabic first letters
    expect(photoOf('Sara Ben Ali')).toBeNull();
    expect(within(screen.getByRole('radio', { name: 'Sara Ben Ali' })).getByText('S', { includeHiddenElements: true })).toBeTruthy();
    // a photo that fails to load (missing / no access) → the letter
    const broken = photoOf('آمنة التونسي')!;
    await act(async () => {
      fireEvent(broken, 'error', { nativeEvent: { error: 'HTTP 404' } });
    });
    expect(photoOf('آمنة التونسي')).toBeNull();
    expect(within(screen.getByRole('radio', { name: 'آمنة التونسي' })).getByText('آ', { includeHiddenElements: true })).toBeTruthy();
  });

  it('search: Arabic (hamza / tashkeel tolerant) and Latin (case-insensitive); group headings kept; a clear empty state', async () => {
    await openSheet();
    const all = sheetStudents();
    expect(all).toEqual(expect.arrayContaining(['محمد التونسي', 'آمنة التونسي', 'Sara Ben Ali']));
    await fireEvent.changeText(screen.getByLabelText(w.searchStudentLabel), 'امنة');
    expect(sheetStudents()).toEqual(['آمنة التونسي']);
    expect(screen.getByRole('header', { name: 'مجموعة الفجر' })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(w.searchStudentLabel), 'sARa');
    expect(sheetStudents()).toEqual(['Sara Ben Ali']);
    await fireEvent.changeText(screen.getByLabelText(w.searchStudentLabel), 'زكرياء');
    expect(sheetStudents()).toEqual([]);
    expect(screen.getByText(w.noStudentMatch)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(w.clearStudentSearch));
    expect(sheetStudents()).toEqual(all);
  });

  it('choosing a student closes the sheet, shows their photo and name, and loads their upcoming sessions', async () => {
    await openSheet();
    await fireEvent.changeText(screen.getByLabelText(w.searchStudentLabel), 'محمد');
    await fireEvent.press(screen.getByRole('radio', { name: 'محمد التونسي' }));
    await settle();
    expect(screen.queryByLabelText(w.searchStudentLabel)).toBeNull(); // sheet closed
    const field = screen.getByLabelText(`${w.student}: محمد التونسي`);
    expect(within(field).getByTestId('avatar-photo', { includeHiddenElements: true })).toBeTruthy();
    expect(calls.find((c) => c.path.endsWith('/eligible-sessions'))!.params.get('studentId')).toBe('st1');
    // reopening: a fresh search, the choice marked
    await fireEvent.press(field);
    expect(screen.getByLabelText(w.searchStudentLabel).props.value).toBe('');
    expect(screen.getByRole('radio', { name: 'محمد التونسي' }).props.accessibilityState.selected).toBe(true);
  });
});

describe('«التقييم العام» (mobile)', () => {
  const given = (level: 'EXCELLENT' | 'VERY_GOOD' | 'GOOD' | 'NEEDS_IMPROVEMENT') => ({ level, evaluatedAt: '2026-11-09T17:00:00.000Z', evaluatedBy: 'سارة بن علي' });
  const evaluationPath = (p: WorkProgram) => `/teacher/work-programs/${p.id}/evaluation`;
  const choices = () => within(screen.getByLabelText(OVERALL_EVALUATION.title)).getAllByRole('radio');

  it('not given yet: four choices (same words as the web), none selected; the empty state and the pending-items note', async () => {
    const p = workProgram('w1');
    stub(undefined, p);
    await renderScreen(<TeacherWorkProgramScreen programId="w1" />);
    expect(await screen.findByText(OVERALL_EVALUATION.title)).toBeTruthy();
    expect(choices().map((c) => [c.props.accessibilityLabel, c.props.accessibilityState.selected])).toEqual(
      WORK_PERFORMANCES.map((l) => [PERFORMANCE_LABEL[l], false]),
    );
    expect(screen.getByText(OVERALL_EVALUATION.none)).toBeTruthy();
    if (p.progress.pending > 0) expect(screen.getByText(overallPendingNote(p.progress.pending)!)).toBeTruthy();
    expect(screen.queryByLabelText(OVERALL_EVALUATION.save)).toBeNull(); // nothing chosen: nothing to save
  });

  it('choose → save: the request carries the version; shown only after the server confirms, with a confirmation', async () => {
    const p = workProgram('w1');
    stub((c) => (c.method === 'PATCH' && c.path.endsWith(evaluationPath(p)) ? 'pending' : undefined), p);
    await renderScreen(<TeacherWorkProgramScreen programId="w1" />);
    await fireEvent.press(await screen.findByRole('radio', { name: 'جيد جدًا' }));
    expect(screen.getByRole('radio', { name: 'جيد جدًا' }).props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByLabelText(OVERALL_EVALUATION.save));
    await settle();
    expect(writes().at(-1)!.body).toEqual({ items: [], version: p.version, overall: 'VERY_GOOD' });
    // still waiting for the server: nothing claimed
    expect(screen.getByText(OVERALL_EVALUATION.none)).toBeTruthy();
    expect(screen.queryByText(new RegExp(OVERALL_EVALUATION.saved))).toBeNull();

    const savedProgram = { ...p, version: p.version + 1, overallEvaluation: given('VERY_GOOD') };
    stub((c) => (c.method === 'PATCH' ? ok(savedProgram) : undefined), p);
    await renderScreen(<TeacherWorkProgramScreen programId="w1" />);
    await fireEvent.press(await screen.findByRole('radio', { name: 'جيد جدًا' }));
    await fireEvent.press(screen.getByLabelText(OVERALL_EVALUATION.save));
    expect(await screen.findByText(`${OVERALL_EVALUATION.saved} — جيد جدًا`)).toBeTruthy();
    expect(within(screen.getByTestId('overall-saved')).getByText('جيد جدًا')).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull(); // the choices close once saved
    expect(screen.getByLabelText(w.editOverall)).toBeTruthy();
    expect(screen.queryByLabelText(OVERALL_EVALUATION.save)).toBeNull();
  });

  it('a correction is explicit and sent with the current version', async () => {
    const p = workProgram('w1', { version: 7, overallEvaluation: given('GOOD') });
    stub((c) => (c.method === 'PATCH' ? ok({ ...p, version: 8, overallEvaluation: given('EXCELLENT') }) : undefined), p);
    await renderScreen(<TeacherWorkProgramScreen programId="w1" />);
    // the saved level prominent, its evaluator and date below; the choices behind «تعديل التقييم»
    expect(within(await screen.findByTestId('overall-saved')).getByText('جيد')).toBeTruthy();
    expect(screen.getByText(w.lastOverall('سارة بن علي · 9 نوفمبر 2026'))).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
    await fireEvent.press(screen.getByLabelText(w.editOverall));
    expect(screen.getByRole('radio', { name: 'جيد' }).props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByRole('radio', { name: 'ممتاز' }));
    expect(screen.getByText(overallChangeText('GOOD', 'EXCELLENT'))).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(OVERALL_EVALUATION.save));
    await settle();
    expect(writes().at(-1)!.body).toEqual({ items: [], version: 7, overall: 'EXCELLENT' });
    expect(await screen.findByText(`${OVERALL_EVALUATION.saved} — ممتاز`)).toBeTruthy();
  });

  it('a stale version (409): the server’s message and the program reloaded — nothing shown as saved', async () => {
    const p = workProgram('w1', { overallEvaluation: given('GOOD') });
    const message = 'تغيّر برنامج العمل منذ فتحه. أعد التحميل.';
    stub((c) => (c.method === 'PATCH' ? { status: 409, body: { code: 'WORK_PROGRAM_CHANGED', message } } : undefined), p);
    await renderScreen(<TeacherWorkProgramScreen programId="w1" />);
    await fireEvent.press(await screen.findByLabelText(w.editOverall));
    await fireEvent.press(screen.getByRole('radio', { name: 'ممتاز' }));
    const gets = () => calls.filter((c) => c.method === 'GET' && c.path.endsWith('/teacher/work-programs/w1')).length;
    const before = gets();
    await fireEvent.press(screen.getByLabelText(OVERALL_EVALUATION.save));
    expect(await screen.findByText(message)).toBeTruthy();
    await settle();
    expect(gets()).toBeGreaterThan(before);
    expect(screen.getByRole('radio', { name: 'جيد' }).props.accessibilityState.selected).toBe(true);
  });

  it('before the start / cancelled: choices disabled with this section’s reason; a recorded value stays visible', async () => {
    stub(undefined, workProgram('w1', { session: workSession('s9', '2099-11-09'), evaluation: { allowed: false, blockedReason: 'SESSION_NOT_STARTED' } }));
    await renderScreen(<TeacherWorkProgramScreen programId="w1" />);
    await screen.findByText(OVERALL_EVALUATION.title);
    expect(choices().every((c) => c.props.accessibilityState.disabled)).toBe(true);
    expect(screen.getByTestId('overall-blocked').props.children).toBe(OVERALL_BLOCKED.notStarted);
    stub(
      undefined,
      workProgram('w1', {
        session: workSession('s9', '2099-11-09', { status: 'CANCELLED' }),
        evaluation: { allowed: false, blockedReason: 'SESSION_CANCELLED' },
        overallEvaluation: given('GOOD'),
      }),
    );
    await renderScreen(<TeacherWorkProgramScreen programId="w1" />);
    await screen.findByText(OVERALL_EVALUATION.title);
    expect(within(screen.getByTestId('overall-saved')).getByText('جيد')).toBeTruthy();
    expect(screen.getByTestId('overall-blocked').props.children).toBe(OVERALL_BLOCKED.cancelled);
    // a recorded level cannot be corrected while closed: no «تعديل التقييم», no choices
    expect(screen.queryByLabelText(w.editOverall)).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('card: the level only («جيد جدًا», no «التقييم العام:»), next to the items’ results; nothing when not given', async () => {
    for (const level of WORK_PERFORMANCES) {
      const p = workProgram('w1', { overallEvaluation: given(level) });
      stub(undefined, p);
      await renderScreen(<TeacherWorkScreen />);
      const badge = await screen.findByTestId('card-overall');
      expect(within(badge).getByText(PERFORMANCE_LABEL[level])).toBeTruthy();
      expect(screen.queryByText(/التقييم العام:/)).toBeNull();
      for (const part of completionParts(p.items.map((i) => i.status)))
        expect(screen.getByTestId(`card-result-${part.status}`).props.children).toBe(part.text);
    }
    stub(undefined, workProgram('w2'));
    await renderScreen(<TeacherWorkScreen />);
    await screen.findByText(w.total(1));
    expect(screen.queryByTestId('card-overall')).toBeNull();
  });
});

describe('«تفاصيل برنامج العمل» (mobile redesign)', () => {
  const surah = (n: number) => ({ kind: 'SURAH_RANGE' as const, editionId: 'qalun-tunisia', fromSurah: n, fromAyah: 1, toSurah: n, toAyah: 22, fromPage: null, toPage: null });
  const counters = () =>
    screen.queryAllByTestId(/^summary-(COMPLETED|PARTIAL|NOT_COMPLETED|POSTPONED|CANCELLED|NOT_EVALUATED)$/).map((c) =>
      within(c).getAllByText(/./).map((t) => String(t.props.children)).join(' '),
    );
  const bg = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as never)?.backgroundColor;

  it('title «تفاصيل برنامج العمل»; the student, the level and «ملخص الأعمال» counting EVERY item: 1 منجز · 1 ملغى (never «جميع الأعمال»)', async () => {
    const p = workProgram('w1', {
      overallEvaluation: { level: 'GOOD', evaluatedAt: '2026-11-22T17:00:00.000Z', evaluatedBy: 'حمدي الشوك' },
      items: [workItem('i1', { status: 'CANCELLED' }), workItem('i2', { position: 1, type: 'REVISION', status: 'COMPLETED' })],
    });
    stub(undefined, p);
    await renderScreen(<TeacherWorkProgramScreen programId="w1" />);
    expect(await screen.findByTestId('items-summary')).toBeTruthy();
    expect(headerTitles()).toContain(w.detailsTitle);
    expect(within(screen.getByTestId('summary-overall')).getByText('جيد')).toBeTruthy();
    expect(screen.getByText(w.itemsTotal(2))).toBeTruthy();
    expect(counters()).toEqual(['1 منجز', '1 ملغى']);
    expect(screen.getByLabelText(`${w.itemsSummary}: 1 منجز · 1 ملغى`)).toBeTruthy();
    expect(screen.queryByText(/جميع الأعمال/)).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('other mixes: 2 منجزان; 1 منجز · 4 ملغاة; pending and partial counted too', async () => {
    const cases: [WorkItem['status'][], string[]][] = [
      [['COMPLETED', 'COMPLETED'], ['2 منجزان']],
      [['COMPLETED', 'CANCELLED', 'CANCELLED', 'CANCELLED', 'CANCELLED'], ['1 منجز', '4 ملغاة']],
      [['PARTIAL', 'NOT_EVALUATED', 'POSTPONED', 'NOT_COMPLETED'], ['1 جزئي', '1 غير منجز', '1 مؤجل', '1 بانتظار التقييم']],
    ];
    for (const [statuses, expected] of cases) {
      stub(undefined, workProgram('w1', { items: statuses.map((status, i) => workItem(`i${i}`, { position: i, status })) }));
      await renderScreen(<TeacherWorkProgramScreen programId="w1" />);
      await screen.findByTestId('items-summary');
      expect(counters()).toEqual(expected);
    }
  });

  it('each item keeps its details: coloured type, result, range and size, evaluator, notes, recitation history and the next recitation', async () => {
    const recitation = workItem('r1', {
      type: 'RECITATION',
      recitationNumber: 1,
      description: 'العرضة الأولى من سورة المجادلة',
      assignment: surah(58),
      recitation: { surah: 58, attempts: 1 },
      status: 'CANCELLED',
      evaluatedBy: 'حمدي الشوك',
      evaluatedAt: '2026-11-22T17:00:00.000Z',
      evaluationComment: 'غاب عن الحصة',
      continuedBy: [{ itemId: 'r2', programId: 'w2', sessionId: 's2', sessionDate: '2026-11-26' }],
    });
    stub(undefined, workProgram('w1', { items: [recitation] }));
    await renderScreen(<TeacherWorkProgramScreen programId="w1" />);
    const type = await screen.findByTestId('type-RECITATION');
    // purple marks the عرضة TYPE; the result has its own (gray for ملغى)
    expect(bg(type)).toBe(lightColors.recitationSoft);
    expect(within(type).getByText('عرضة 1')).toBeTruthy();
    expect(bg(screen.getByTestId('status-CANCELLED'))).toBe(lightColors.muted);
    expect(screen.getByText('سورة المجادلة')).toBeTruthy();
    expect(screen.getByLabelText(w.evaluatedBy('حمدي الشوك', '22 نوفمبر 2026'))).toBeTruthy();
    expect(screen.getByText('غاب عن الحصة')).toBeTruthy();
    expect(screen.getByTestId('recitation-line').props.children).toBe('عرضة واحدة');
    expect(screen.getByText(w.linkContinuedBy)).toBeTruthy();
    expect(screen.getByText(w.scheduledOn('26 نوفمبر 2026'))).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(w.continuedBy('26 نوفمبر 2026')));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/teacher/work/[id]', params: { id: 'w2' } });
    // simplified recitations: no cycles, no «تحتسب»
    expect(screen.queryByText(/دورة|تحتسب|من 4/)).toBeNull();
  });

  it('primary actions are GREEN (the app colour) — «إضافة العرضة التالية» included; transfer stays outlined', async () => {
    const recitation = workItem('r1', { type: 'RECITATION', recitationNumber: 2, description: 'العرضة الثانية من سورة التوبة', status: 'PARTIAL' });
    stub(undefined, workProgram('w1', { items: [recitation] }));
    await renderScreen(<TeacherWorkProgramScreen programId="w1" />);
    const next = await screen.findByLabelText(`${w.next}: العرضة الثانية من سورة التوبة`);
    expect(bg(next)).toBe(lightColors.primary);
    expect(bg(next)).not.toBe(lightColors.recitationForeground);
    expect(bg(screen.getByLabelText(`${w.carry}: العرضة الثانية من سورة التوبة`))).toBe(lightColors.card);
    expect(bg(screen.getByLabelText(w.evaluate))).toBe(lightColors.primary);
    expect(bg(screen.getByLabelText(w.edit))).toBe(lightColors.card);
  });
});

describe('«متابعة العرضات» — the module (mobile)', () => {
  const HISTORY = '/teacher/students/st1/recitations';
  let n = 0;
  const entry = (number: number | null, e: string, status: string, date: string) => {
    n++;
    return { itemId: `m${n}`, programId: `wp${n}`, sessionId: `ms${n}`, sessionDate: date, number, entry: e, status, evaluationComment: null, evaluatedAt: null, evaluatedBy: null };
  };
  // past sessions (2020), whatever today is — al-Mujadila: 1 ملغاة, 2 postponed twice then منجزة (one recitation), 3 جزئي, 4 pending
  const mujadila = {
    surah: 58,
    attempts: 3,
    nextNumber: 5,
    entries: [
      entry(1, 'CANCELLED', 'CANCELLED', '2020-11-02'),
      entry(2, 'POSTPONED', 'POSTPONED', '2020-11-09'),
      entry(2, 'POSTPONED', 'POSTPONED', '2020-11-16'),
      entry(2, 'COMPLETED', 'COMPLETED', '2020-11-23'),
      entry(3, 'PARTIAL', 'PARTIAL', '2020-11-30'),
      entry(4, 'PENDING', 'NOT_EVALUATED', '2020-12-07'),
    ],
  };
  // unlimited, numbered on their own
  const baqara = { surah: 2, attempts: 12, nextNumber: 13, entries: Array.from({ length: 12 }, (_, i) => entry(i + 1, 'COMPLETED', 'COMPLETED', '2020-10-01')) };
  const history = { studentId: 'st1', surahs: [baqara, mujadila] };
  const entries = () => screen.queryAllByTestId(/^entry-/).map((v) => v.props.accessibilityLabel as string);
  const cards = () => screen.queryAllByTestId(/^surah-\d+$/).map((v) => v.props.accessibilityLabel as string);

  it('no student yet: a prompt; the picker lists my students (photos / first letters); choosing one loads only theirs', async () => {
    stub((c) => (c.path.endsWith(HISTORY) ? ok(history) : undefined));
    await renderScreen(<TeacherRecitationsScreen />);
    expect((await screen.findAllByText(w.recitationsPick)).length).toBeGreaterThan(0);
    expect(calls.some((c) => c.path.includes('/recitations'))).toBe(false);
    await fireEvent.press(screen.getByLabelText(w.recitationsPick));
    await fireEvent.press(await screen.findByRole('radio', { name: 'محمد التونسي' }));
    expect(await screen.findByLabelText('سورة المجادلة — 3 عرضات')).toBeTruthy();
    expect(calls.filter((c) => c.path.includes('/recitations')).map((c) => c.path.replace(/^\/api/, ''))).toEqual([HISTORY]);
  });

  it('collapsed: one card per surah with recitations and «3 عرضات»; open: numbered recitations, a postponed one and its continuation as ONE', async () => {
    stub((c) => (c.path.endsWith(HISTORY) ? ok(history) : undefined));
    await renderScreen(<TeacherRecitationsScreen initialStudentId="st1" />);
    await screen.findByLabelText('سورة المجادلة — 3 عرضات');
    expect(cards()).toEqual(['سورة البقرة — 12 عرضة', 'سورة المجادلة — 3 عرضات']);
    expect(entries()).toEqual([]);
    await fireEvent.press(screen.getByLabelText('سورة المجادلة — 3 عرضات'));
    expect(entries().map((l) => l.split(' · ').slice(0, 2).join(' · '))).toEqual([
      'سورة المجادلة — العرضة 1 · ملغى',
      'سورة المجادلة — العرضة 2 · منجز',
      'سورة المجادلة — العرضة 3 · جزئي',
      'سورة المجادلة — العرضة 4 · بانتظار التقييم',
    ]);
    expect(screen.getByTestId('postponed-note').props.children).toBe(w.postponedOn('9 نوفمبر 2020، 16 نوفمبر 2020'));
    expect(screen.getByTestId('next-recitation').props.children).toBe('التالية: العرضة 5');
    expect(screen.queryByText(/دورة|محتسب|من 4/)).toBeNull();
    // an entry opens its program
    await fireEvent.press(screen.getAllByTestId('entry-COMPLETED')[0]!);
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/teacher/work/[id]', params: { id: 'wp4' } });
  });

  it('unlimited recitations in another surah; totals by result', async () => {
    stub((c) => (c.path.endsWith(HISTORY) ? ok(history) : undefined));
    await renderScreen(<TeacherRecitationsScreen initialStudentId="st1" />);
    await fireEvent.press(await screen.findByLabelText('سورة البقرة — 12 عرضة'));
    expect(entries()).toHaveLength(12);
    expect(within(screen.getByTestId('total-attempts')).getByText('15')).toBeTruthy();
    expect(within(screen.getByTestId('total-COMPLETED')).getByText('13')).toBeTruthy();
    expect(screen.queryByTestId('total-POSTPONED')).toBeNull();
  });

  it('all 114 surahs on request; surah search (Arabic tolerant)', async () => {
    stub((c) => (c.path.endsWith(HISTORY) ? ok(history) : undefined));
    await renderScreen(<TeacherRecitationsScreen initialStudentId="st1" />);
    await screen.findByLabelText('سورة المجادلة — 3 عرضات');
    await fireEvent.press(screen.getByRole('radio', { name: w.scopeAll }));
    expect(cards()).toHaveLength(114);
    expect(screen.getByLabelText('سورة الناس — لا عرضات بعد')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(w.searchSurahLabel), 'المجادله');
    expect(cards()).toEqual(['سورة المجادلة — 3 عرضات']);
  });

  it('deep link («سجل العرضات»): the student chosen, the surah open — even one without recitations', async () => {
    stub((c) => (c.path.endsWith(HISTORY) ? ok(history) : undefined));
    await renderScreen(<TeacherRecitationsScreen initialStudentId="st1" initialSurah={110} />);
    const card = await screen.findByLabelText('سورة النصر — لا عرضات بعد');
    expect(card.props.accessibilityState).toMatchObject({ expanded: true });
  });

  it('«إضافة عرضة»: the Work Program form for this student (and this surah from its card); the button is GREEN', async () => {
    stub((c) => (c.path.endsWith(HISTORY) ? ok(history) : undefined));
    await renderScreen(<TeacherRecitationsScreen initialStudentId="st1" initialSurah={58} />);
    await fireEvent.press(await screen.findByLabelText(w.addRecitationFor('سورة المجادلة')));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/teacher/work/new', params: { studentId: 'st1', surah: '58' } });
    const main = screen.getByLabelText(w.addRecitation);
    expect(StyleSheet.flatten(main.props.style).backgroundColor).toBe(lightColors.primary);
    await fireEvent.press(main);
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/teacher/work/new', params: { studentId: 'st1' } });
  });

  it('the form opened for a surah starts with a عرضة of it (the server numbers it)', async () => {
    stub();
    await renderScreen(<TeacherWorkFormScreen studentId="st1" surah={58} />);
    expect((await screen.findAllByText(/المجادلة/)).length).toBeGreaterThan(0);
    expect(screen.getByRole('radio', { name: w.type.RECITATION }).props.accessibilityState.selected).toBe(true);
  });

  it('no recitations yet: an empty state that points to «كل السور»; an API refusal: its message', async () => {
    stub((c) => (c.path.endsWith(HISTORY) ? ok({ studentId: 'st1', surahs: [] }) : undefined));
    await renderScreen(<TeacherRecitationsScreen initialStudentId="st1" />);
    expect(await screen.findByText(w.recitationsEmpty)).toBeTruthy();
    expect(screen.getByText(w.recitationsEmptyHint)).toBeTruthy();
    stub((c) => (c.path.endsWith(HISTORY) ? { status: 403, body: { code: 'FORBIDDEN', message: 'لا يمكنك عرض هذا الطالب' } } : undefined));
    await renderScreen(<TeacherRecitationsScreen initialStudentId="st1" />);
    expect(await screen.findByText('لا يمكنك عرض هذا الطالب')).toBeTruthy();
  });

  it('«مجدولة» (session not started) vs «بانتظار التقييم» (started or past, unevaluated); results unchanged', async () => {
    const today = platformClock(PREFS.timezone).today;
    const nas = {
      surah: 114,
      attempts: 2,
      nextNumber: 7,
      entries: [
        entry(1, 'COMPLETED', 'COMPLETED', '2020-11-02'),
        entry(2, 'NOT_COMPLETED', 'NOT_COMPLETED', '2020-11-09'),
        entry(3, 'PENDING', 'NOT_EVALUATED', '2020-11-16'), // past, not evaluated
        { ...entry(4, 'PENDING', 'NOT_EVALUATED', today), sessionId: 'started' }, // today, started 00:00
        { ...entry(5, 'PENDING', 'NOT_EVALUATED', today), sessionId: 'later' }, // today, starts 23:59
        entry(6, 'PENDING', 'NOT_EVALUATED', '2099-01-04'), // a future session
      ],
    };
    const todaySessions = { data: [{ id: 'started', date: today, startTime: '00:00' }, { id: 'later', date: today, startTime: '23:59' }], meta: { page: 1, pageSize: 20, total: 2, totalPages: 1 } };
    stub((c) => (c.path.endsWith(HISTORY) ? ok({ studentId: 'st1', surahs: [nas] }) : c.path.endsWith('/teacher/sessions') ? ok(todaySessions) : undefined));
    await renderScreen(<TeacherRecitationsScreen initialStudentId="st1" initialSurah={114} />);
    // today's start times come from my sessions of today (the «الحصص» tab's query)
    await screen.findByLabelText(/العرضة 5 · مجدولة/);
    expect(calls.some((c) => c.path.endsWith('/teacher/sessions') && c.params.get('from') === today && c.params.get('to') === today)).toBe(true);
    expect(entries().map((l) => l.split(' · ').slice(0, 2).join(' · '))).toEqual([
      'سورة الناس — العرضة 1 · منجز',
      'سورة الناس — العرضة 2 · غير منجز',
      'سورة الناس — العرضة 3 · بانتظار التقييم',
      'سورة الناس — العرضة 4 · بانتظار التقييم',
      'سورة الناس — العرضة 5 · مجدولة',
      'سورة الناس — العرضة 6 · مجدولة',
    ]);
    // a neutral badge with a calendar; the totals count each state apart, the attempts unchanged
    const scheduled = screen.getAllByTestId('entry-SCHEDULED')[0]!;
    expect(StyleSheet.flatten(scheduled.props.style).backgroundColor).toBe(lightColors.secondary);
    expect(within(screen.getByTestId('total-SCHEDULED')).getByText('2')).toBeTruthy();
    expect(within(screen.getByTestId('total-SCHEDULED')).getByText('مجدولة')).toBeTruthy();
    expect(within(screen.getByTestId('total-PENDING')).getByText('2')).toBeTruthy();
    expect(within(screen.getByTestId('total-attempts')).getByText('2')).toBeTruthy();
    expect(within(screen.getByTestId('total-COMPLETED')).getByText('1')).toBeTruthy();
    expect(within(screen.getByTestId('total-NOT_COMPLETED')).getByText('1')).toBeTruthy();
  });

  it('filters stay compact (never stretched by spare height): own height, centred, 40 dp — cards open or closed', async () => {
    stub((c) => (c.path.endsWith(HISTORY) ? ok(history) : undefined));
    await renderScreen(<TeacherRecitationsScreen initialStudentId="st1" />);
    await screen.findByLabelText('سورة المجادلة — 3 عرضات');
    const check = () => {
      const group = screen.getByLabelText(w.surahScope);
      expect(StyleSheet.flatten(group.props.style)).toMatchObject({ flexGrow: 0, flexShrink: 0 });
      expect(StyleSheet.flatten(group.props.contentContainerStyle)).toMatchObject({ alignItems: 'center' });
      for (const name of [w.scopeHistory, w.scopeAll]) {
        const chip = StyleSheet.flatten(screen.getByRole('radio', { name }).props.style);
        expect(chip.minHeight).toBe(40);
        expect(chip.height).toBeUndefined();
        expect(chip.flex ?? chip.flexGrow).toBeUndefined();
      }
    };
    check(); // collapsed
    await fireEvent.press(screen.getByLabelText('سورة المجادلة — 3 عرضات'));
    check(); // expanded
    await fireEvent.press(screen.getByRole('radio', { name: w.scopeAll }));
    expect(cards()).toHaveLength(114); // filtering unchanged
    check();
  });
});
