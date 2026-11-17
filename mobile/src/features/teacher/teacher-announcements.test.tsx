import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { SessionUser } from '@/features/auth/types';
import { ar } from '@/i18n/ar';
import { auto } from '@/i18n/format';

import { announcementFixture, announcementPage, myAnnouncement } from './__fixtures__/announcements';
import { workspaceFixture } from './__fixtures__/workspace';
import type { Announcement } from './announcement-types';
import { TeacherAnnouncementScreen } from './teacher-announcement';
import { TeacherAnnouncementFormScreen } from './teacher-announcement-form';
import { TeacherAnnouncementsScreen } from './teacher-announcements';
import { announcementKey } from './use-announcements';
import { CONFIRMATION_MS } from './use-confirm-then-back';

/*
 * «الإعلانات» screens against stubbed HTTP answers shaped like the
 * announcement DTOs (test-only fixtures). Only native modules, navigation and
 * the network are replaced: nothing is really published or deleted.
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
type Call = { method: string; path: string; params: URLSearchParams; body?: unknown };
const calls: Call[] = [];
const ok = (body: unknown): Answer => ({ status: 200, body });
const PREFS = { timezone: 'Africa/Tunis', dateFormat: 'DD/MM/YYYY', defaultCalendarView: 'week', defaultPageSize: 20, currentAcademicYear: null };

function stub(custom: (c: Call) => Answer | undefined = () => undefined, one: Announcement = myAnnouncement('a1')) {
  calls.length = 0;
  const route = (c: Call): Answer => {
    const hit = custom(c);
    if (hit) return hit;
    if (c.path.endsWith('/platform-preferences')) return ok(PREFS);
    if (c.path.endsWith('/teacher/workspace')) return ok(workspaceFixture());
    if (c.method === 'GET' && c.path.endsWith('/teacher/announcements')) return ok(announcementPage([one]));
    if (c.method === 'GET' && c.path.endsWith(`/teacher/announcements/${one.id}`)) return ok(one);
    return { status: 500, body: {} };
  };
  globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    const call: Call = { method: init?.method ?? 'GET', path: u.pathname, params: u.searchParams, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const a = route(call);
    if (a === 'offline') throw new TypeError('Network request failed');
    if (a === 'pending')
      return new Promise((_, reject) =>
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))),
      );
    return { status: a.status, ok: a.status >= 200 && a.status < 300, text: async () => (a.body === undefined ? '' : JSON.stringify(a.body)) };
  }) as unknown as typeof fetch;
}
const writes = () => calls.filter((c) => c.method !== 'GET');
const lists = () => calls.filter((c) => c.method === 'GET' && c.path.endsWith('/teacher/announcements'));

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

const t = ar.announcements;
const radio = (name: string) => screen.getByRole('radio', { name });
const answerAlert = (pick: 'cancel' | 'confirm') =>
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((b) => (pick === 'cancel' ? b.style === 'cancel' : b.style !== 'cancel'))?.onPress?.());

describe('list', () => {
  it('the feed: what the SERVER returns for me, PUBLISHED and still ACTIVE only (admin and teacher authors)', async () => {
    stub((c) =>
      c.method === 'GET' && c.path.endsWith('/teacher/announcements')
        ? ok(
            announcementPage([
              announcementFixture('a0'),
              myAnnouncement('a1'),
              // My own published one, expired today: not in the feed (kept in «إعلاناتي»)
              myAnnouncement('a2', { title: 'إعلان منتهٍ', state: 'EXPIRED', expiresAt: '2026-11-10' }),
            ]),
          )
        : undefined,
    );
    await renderScreen(<TeacherAnnouncementsScreen />);
    expect(await screen.findByText(auto('عطلة نهاية السداسي'))).toBeTruthy();
    expect(screen.getByText(auto('مراجعة يوم السبت'))).toBeTruthy();
    expect(screen.queryByText(auto('إعلان منتهٍ'))).toBeNull();
    // Audience: «الجميع» for an admin's, the class for mine; author · full date
    expect(screen.getByText(t.audience.EVERYONE)).toBeTruthy();
    expect(screen.getByText(auto('مجموعة الفجر — الفرع الرئيسي'))).toBeTruthy();
    expect(screen.getByText(t.byLine(auto('إدارة الجمعية'), '12 نوفمبر 2026'))).toBeTruthy();
    // No state badges in the feed
    expect(screen.queryByText(t.state.ACTIVE)).toBeNull();
    expect(lists()[0]!.params.get('status')).toBe('PUBLISHED');
    expect(lists()[0]!.params.get('mine')).toBeNull();
  });

  it('«إعلاناتي»: mine=true, every state with its badge', async () => {
    stub((c) =>
      c.method === 'GET' && c.path.endsWith('/teacher/announcements') && c.params.get('mine') === 'true'
        ? ok(announcementPage([myAnnouncement('a1'), myAnnouncement('a3', { title: 'مسودة', status: 'DRAFT', state: 'DRAFT', publishedAt: null })]))
        : undefined,
    );
    await renderScreen(<TeacherAnnouncementsScreen />);
    await screen.findByText(auto('مراجعة يوم السبت'));
    await fireEvent.press(radio(t.tabs.mine));
    expect(await screen.findByText(t.state.DRAFT)).toBeTruthy();
    expect(screen.getByText(t.state.ACTIVE)).toBeTruthy();
    expect(lists().at(-1)!.params.get('status')).toBeNull();
  });

  it('search after a pause and the class filter go to the server; pagination', async () => {
    const ws = workspaceFixture();
    ws.groupClasses = ws.groupClasses.map((c) => ({ ...c, status: 'ACTIVE' as const }));
    stub((c) => {
      if (c.path.endsWith('/teacher/workspace')) return ok(ws);
      if (c.method === 'GET' && c.path.endsWith('/teacher/announcements'))
        return ok(c.params.get('page') === '2' ? announcementPage([announcementFixture('a9', { title: 'إعلان قديم' })], 2, 2, 2) : announcementPage([announcementFixture('a0')], 1, 2, 2));
      return undefined;
    });
    await renderScreen(<TeacherAnnouncementsScreen />);
    await fireEvent.press(await screen.findByLabelText(t.loadMore));
    await settle();
    expect(screen.getByText(auto('إعلان قديم'))).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(t.searchLabel), 'عطلة');
    await settle(450);
    expect(lists().at(-1)!.params.get('search')).toBe('عطلة');
    await fireEvent.press(screen.getByLabelText(t.filters));
    await fireEvent.press(radio('مجموعة الأمل'));
    await fireEvent.press(screen.getByLabelText(t.done));
    await settle();
    expect(lists().at(-1)!.params.get('groupClassId')).toBe('c2');
  });

  it('no current active class: no «إعلان جديد» (the server would refuse)', async () => {
    const ws = workspaceFixture();
    ws.groupClasses = ws.groupClasses.map((c) => ({ ...c, status: 'INACTIVE' as const }));
    stub((c) => (c.path.endsWith('/teacher/workspace') ? ok(ws) : undefined));
    await renderScreen(<TeacherAnnouncementsScreen />);
    expect(await screen.findByText(t.noClasses)).toBeTruthy();
    expect(screen.queryByLabelText(t.add)).toBeNull();
  });

  it('empty feed, offline (retry), 403 and loading', async () => {
    stub((c) => (c.method === 'GET' && c.path.endsWith('/teacher/announcements') ? ok(announcementPage([])) : undefined));
    await renderScreen(<TeacherAnnouncementsScreen />);
    expect(await screen.findByText(t.empty)).toBeTruthy();
  });

  it('offline: retry offered, never «not found»', async () => {
    stub((c) => (c.path.endsWith('/teacher/announcements') ? 'offline' : undefined));
    await renderScreen(<TeacherAnnouncementsScreen />);
    expect(await screen.findByText(ar.states.offlineTitle)).toBeTruthy();
    expect(screen.getByLabelText(ar.states.retry)).toBeTruthy();
  });

  it('403: the forbidden state', async () => {
    stub((c) => (c.path.endsWith('/teacher/announcements') ? { status: 403, body: { code: 'TEACHER_INACTIVE', message: 'ملف المعلم غير نشط' } } : undefined));
    await renderScreen(<TeacherAnnouncementsScreen />);
    expect(await screen.findByText(ar.states.forbiddenTitle)).toBeTruthy();
  });

  it('loading', async () => {
    stub((c) => (c.path.endsWith('/teacher/announcements') ? 'pending' : undefined));
    await renderScreen(<TeacherAnnouncementsScreen />);
    expect(await screen.findByLabelText(ar.states.loading)).toBeTruthy();
  });
});

describe('details', () => {
  it('an administration announcement: full text, publication day, author — and NO actions (not mine)', async () => {
    stub(undefined, announcementFixture('a0', { audience: 'TEACHERS', expiresAt: '2026-12-31' }));
    await renderScreen(<TeacherAnnouncementScreen announcementId="a0" />);
    expect(await screen.findByText(auto('تتوقف الحصص من 20 ديسمبر إلى 3 جانفي. نتمنى للجميع عطلة سعيدة.'))).toBeTruthy();
    expect(screen.getByText(t.publishedOn('الخميس 12 نوفمبر 2026'))).toBeTruthy();
    expect(screen.getByText(t.expiresOn('الخميس 31 ديسمبر 2026'))).toBeTruthy();
    expect(screen.getByText(t.audience.TEACHERS)).toBeTruthy();
    expect(screen.queryByLabelText(t.edit)).toBeNull();
    expect(screen.queryByLabelText(t.delete)).toBeNull();
  });

  it('my PUBLISHED one: edit, archive, delete — no «publish»', async () => {
    stub();
    await renderScreen(<TeacherAnnouncementScreen announcementId="a1" />);
    expect(await screen.findByLabelText(t.edit)).toBeTruthy();
    expect(screen.getByLabelText(t.archive)).toBeTruthy();
    expect(screen.getByLabelText(t.delete)).toBeTruthy();
    expect(screen.queryByLabelText(t.publish)).toBeNull();
    expect(screen.getByText(auto('مجموعة الفجر — الفرع الرئيسي'))).toBeTruthy();
  });

  it('my DRAFT: «publish now» after a confirmation; the server copy is cached, the lists refetched', async () => {
    const draftA = myAnnouncement('a3', { status: 'DRAFT', state: 'DRAFT', publishedAt: null });
    stub((c) => (c.method === 'POST' && c.path.endsWith('/a3/publish') ? ok({ announcement: myAnnouncement('a3'), notifiedCount: 12 }) : undefined), draftA);
    const alert = answerAlert('confirm');
    await renderScreen(<TeacherAnnouncementScreen announcementId="a3" />);
    expect(await screen.findByText(t.draftLine)).toBeTruthy();
    expect(screen.queryByLabelText(t.archive)).toBeNull();
    await fireEvent.press(screen.getByLabelText(t.publish));
    await settle();
    expect(alert).toHaveBeenCalledWith(t.confirm.publish.title, t.confirm.publish.message('مراجعة يوم السبت'), expect.any(Array));
    expect(writes()).toEqual([expect.objectContaining({ method: 'POST', path: '/api/teacher/announcements/a3/publish' })]);
    expect(screen.getByRole('alert', { name: t.done_publish })).toBeTruthy();
    expect(client.getQueryData<Announcement>(announcementKey('t-me', 'a3'))!.status).toBe('PUBLISHED');
    alert.mockRestore();
  });

  it('409 (already published meanwhile): the server message, the announcement reloaded', async () => {
    const draftA = myAnnouncement('a3', { status: 'DRAFT', state: 'DRAFT', publishedAt: null });
    stub((c) => (c.method === 'POST' ? { status: 409, body: { code: 'ANNOUNCEMENT_PUBLISH_CONFLICT', message: 'هذا الإعلان منشور بالفعل (أو مؤرشف)' } } : undefined), draftA);
    const alert = answerAlert('confirm');
    await renderScreen(<TeacherAnnouncementScreen announcementId="a3" />);
    await fireEvent.press(await screen.findByLabelText(t.publish));
    await settle();
    expect(screen.getByRole('alert', { name: 'هذا الإعلان منشور بالفعل (أو مؤرشف)' })).toBeTruthy();
    expect(calls.filter((c) => c.method === 'GET' && c.path.endsWith('/a3')).length).toBe(2);
    alert.mockRestore();
  });

  it('delete: cancelled sends nothing; confirmed waits for the server, then goes back', async () => {
    stub((c) => (c.method === 'DELETE' ? { status: 204 } : undefined));
    let alert = answerAlert('cancel');
    await renderScreen(<TeacherAnnouncementScreen announcementId="a1" />);
    await fireEvent.press(await screen.findByLabelText(t.delete));
    expect(writes()).toHaveLength(0);
    alert.mockRestore();
    alert = answerAlert('confirm');
    await fireEvent.press(screen.getByLabelText(t.delete));
    await settle();
    expect(writes()).toEqual([expect.objectContaining({ method: 'DELETE', path: '/api/teacher/announcements/a1' })]);
    expect(screen.getByRole('alert', { name: t.done_delete })).toBeTruthy();
    await settle(CONFIRMATION_MS + 50);
    expect(mockBack).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });

  it('archive offline: nothing changed, an error', async () => {
    stub((c) => (c.method === 'POST' ? 'offline' : undefined));
    const alert = answerAlert('confirm');
    await renderScreen(<TeacherAnnouncementScreen announcementId="a1" />);
    await fireEvent.press(await screen.findByLabelText(t.archive));
    await settle();
    expect(screen.getByRole('alert', { name: t.offlineAction })).toBeTruthy();
    expect(screen.getByLabelText(t.archive)).toBeTruthy();
    alert.mockRestore();
  });

  it('404 (deleted, expired, or not addressed to me): «غير موجود»', async () => {
    stub((c) => (c.path.endsWith('/teacher/announcements/a7') ? { status: 404, body: { code: 'ANNOUNCEMENT_NOT_FOUND', message: 'x' } } : undefined));
    await renderScreen(<TeacherAnnouncementScreen announcementId="a7" />);
    expect(await screen.findByText(t.notFound)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(t.backToList));
    expect(mockReplace).toHaveBeenCalledWith('/teacher/announcements');
  });
});

describe('writing', () => {
  it('validation before sending, then «publish now» with the exact TeacherAnnouncementDto', async () => {
    stub((c) => (c.method === 'POST' ? { status: 201, body: { announcement: myAnnouncement('a5'), notifiedCount: 3 } } : undefined));
    await renderScreen(<TeacherAnnouncementFormScreen />);
    await fireEvent.press(await screen.findByLabelText(t.publishNow));
    expect(screen.getByRole('alert', { name: t.errors.titleRequired })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(t.titleLabel), '  مراجعة يوم السبت ');
    await fireEvent.changeText(screen.getByLabelText(t.contentLabel), 'مراجعة جماعية.');
    await fireEvent.changeText(screen.getByLabelText(t.expiryLabel), '31/12/2026');
    await fireEvent.press(screen.getByLabelText(t.publishNow));
    expect(screen.getByRole('alert', { name: t.errors.expiryInvalid })).toBeTruthy();
    expect(writes()).toHaveLength(0);
    await fireEvent.changeText(screen.getByLabelText(t.expiryLabel), '2099-12-31');
    expect(screen.getByText(t.expiryPreview('الخميس 31 ديسمبر 2099'))).toBeTruthy();
    // My only ACTIVE class is preselected; the inactive one is not offered
    expect(screen.getByRole('checkbox', { name: 'مجموعة الفجر' }).props.accessibilityState.checked).toBe(true);
    expect(screen.queryByRole('checkbox', { name: 'مجموعة الأمل' })).toBeNull();
    await fireEvent.press(screen.getByLabelText(t.publishNow));
    await settle();
    expect(writes()).toEqual([
      expect.objectContaining({
        method: 'POST',
        path: '/api/teacher/announcements',
        body: { title: 'مراجعة يوم السبت', content: 'مراجعة جماعية.', groupClassIds: ['c1'], expiresAt: '2099-12-31', mode: 'PUBLISH_NOW' },
      }),
    ]);
    expect(screen.getByRole('alert', { name: `${t.created}${t.notified(3)}` })).toBeTruthy();
    await settle(CONFIRMATION_MS + 50);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('«save as draft»: mode DRAFT, nobody notified', async () => {
    stub((c) => (c.method === 'POST' ? { status: 201, body: { announcement: myAnnouncement('a6', { status: 'DRAFT', state: 'DRAFT' }), notifiedCount: 0 } } : undefined));
    await renderScreen(<TeacherAnnouncementFormScreen />);
    await fireEvent.changeText(await screen.findByLabelText(t.titleLabel), 'مسودة');
    await fireEvent.changeText(screen.getByLabelText(t.contentLabel), 'نص');
    await fireEvent.press(screen.getByLabelText(t.saveDraft));
    await settle();
    expect(writes()[0]!.body).toMatchObject({ mode: 'DRAFT' });
    expect(screen.getByRole('alert', { name: t.drafted })).toBeTruthy();
  });

  it('offline: nothing published, the text stays; a double tap sends ONE request', async () => {
    stub();
    let release: (() => void) | undefined;
    let posts = 0;
    const base = globalThis.fetch;
    globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts++;
        await new Promise<void>((r) => (release = r));
        throw new TypeError('Network request failed');
      }
      return (base as unknown as (u: string, i?: RequestInit) => Promise<Response>)(url, init);
    }) as unknown as typeof fetch;
    await renderScreen(<TeacherAnnouncementFormScreen />);
    await fireEvent.changeText(await screen.findByLabelText(t.titleLabel), 'عنوان');
    await fireEvent.changeText(screen.getByLabelText(t.contentLabel), 'نص مهم');
    await fireEvent.press(screen.getByLabelText(t.publishNow));
    await fireEvent.press(screen.getByLabelText(t.saving));
    await fireEvent.press(screen.getByLabelText(t.saveDraft));
    expect(posts).toBe(1);
    await act(async () => release?.());
    await settle();
    expect(screen.getByRole('alert', { name: t.offlineSave })).toBeTruthy();
    expect(screen.getByLabelText(t.contentLabel).props.value).toBe('نص مهم');
    expect(mockPreventRemove.active).toBe(true);
  });

  it('editing my PUBLISHED one: classes locked, only the changed fields are sent', async () => {
    const published = myAnnouncement('a1');
    stub((c) => (c.method === 'PATCH' ? ok({ ...published, title: 'مراجعة يوم الأحد' }) : undefined), published);
    await renderScreen(<TeacherAnnouncementFormScreen announcementId="a1" />);
    const title = await screen.findByLabelText(t.titleLabel);
    expect(screen.queryByRole('checkbox', { name: 'مجموعة الفجر' })).toBeNull(); // locked after publication
    expect(screen.getAllByText(t.publishedLockHint).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(t.saveEdit).props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(title, 'مراجعة يوم الأحد');
    await fireEvent.press(screen.getByLabelText(t.saveEdit));
    await settle();
    expect(writes()).toEqual([expect.objectContaining({ method: 'PATCH', path: '/api/teacher/announcements/a1', body: { title: 'مراجعة يوم الأحد' } })]);
    expect(screen.getByRole('alert', { name: t.updated })).toBeTruthy();
  });

  it('a server refusal (INVALID_DATE_RANGE) is shown, the form kept', async () => {
    const published = myAnnouncement('a1');
    stub((c) => (c.method === 'PATCH' ? { status: 400, body: { code: 'INVALID_DATE_RANGE', message: 'تاريخ الانتهاء قبل تاريخ النشر' } } : undefined), published);
    await renderScreen(<TeacherAnnouncementFormScreen announcementId="a1" />);
    await fireEvent.changeText(await screen.findByLabelText(t.expiryLabel), '2026-11-01');
    await fireEvent.press(screen.getByLabelText(t.saveEdit));
    await settle();
    expect(screen.getByRole('alert', { name: 'تاريخ الانتهاء قبل تاريخ النشر' })).toBeTruthy();
    expect(screen.getByLabelText(t.expiryLabel).props.value).toBe('2026-11-01');
  });

  it('someone else\'s announcement: no edit form', async () => {
    stub(undefined, announcementFixture('a0'));
    await renderScreen(<TeacherAnnouncementFormScreen announcementId="a0" />);
    expect(await screen.findByText(t.notFound)).toBeTruthy();
    expect(screen.queryByLabelText(t.titleLabel)).toBeNull();
  });

  it('RTL text fields; the date field is LTR', async () => {
    stub();
    await renderScreen(<TeacherAnnouncementFormScreen />);
    expect(await screen.findByLabelText(t.contentLabel)).toHaveStyle({ textAlign: 'right', writingDirection: 'rtl' });
    expect(screen.getByLabelText(t.expiryLabel)).toHaveStyle({ textAlign: 'left', writingDirection: 'ltr' });
  });
});
