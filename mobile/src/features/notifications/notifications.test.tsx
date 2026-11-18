import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert, AppState, type AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { SessionUser } from '@/features/auth/types';
import { ar } from '@/i18n/ar';
import { ltr } from '@/i18n/format';

import { workspaceFixture } from '@/features/teacher/__fixtures__/workspace';
import { resourceFixture } from '@/features/teacher/__fixtures__/resources';

import { notificationFixture, notificationPage } from './__fixtures__/notifications';
import { NotificationBell } from './notification-bell';
import type { AppNotification } from './notification-types';
import { TeacherNotificationsScreen } from './notifications-screen';
import { UNREAD_POLL_MS } from './use-notifications';

/*
 * The bell and «الإشعارات» against stubbed HTTP answers shaped like the
 * NotificationDto (test-only fixtures). Only native modules, navigation,
 * AppState and the network are replaced: nothing is really marked read.
 */
const mockPush = jest.fn();
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useNavigation: () => ({ isFocused: () => true }),
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

/* AppState: the foreground / background switch is driven by the test */
let appListeners: ((s: AppStateStatus) => void)[] = [];
async function setAppState(status: AppStateStatus) {
  Object.defineProperty(AppState, 'currentState', { value: status, configurable: true });
  await act(async () => appListeners.forEach((l) => l(status)));
}

type Answer = { status: number; body?: unknown } | 'offline' | 'pending';
type Call = { method: string; path: string; params: URLSearchParams };
const calls: Call[] = [];
const ok = (body: unknown): Answer => ({ status: 200, body });
const PREFS = { timezone: 'Africa/Tunis', dateFormat: 'DD/MM/YYYY', defaultCalendarView: 'week', defaultPageSize: 20, currentAcademicYear: null };

/** Server state: the notifications of the account, and its unread count derived from them. */
let inbox: AppNotification[] = [];
function stub(custom: (c: Call) => Answer | undefined = () => undefined) {
  calls.length = 0;
  const route = (c: Call): Answer => {
    const hit = custom(c);
    if (hit) return hit;
    if (c.path.endsWith('/platform-preferences')) return ok(PREFS);
    if (c.path.endsWith('/notifications/unread-count')) return ok({ count: inbox.filter((n) => !n.isRead).length });
    if (c.method === 'GET' && c.path.endsWith('/notifications')) {
      const rows = c.params.get('unreadOnly') === 'true' ? inbox.filter((n) => !n.isRead) : inbox;
      return ok(notificationPage(rows));
    }
    if (c.method === 'PATCH' && c.path.endsWith('/notifications/read-all')) {
      const updated = inbox.filter((n) => !n.isRead).length;
      inbox = inbox.map((n) => ({ ...n, isRead: true, readAt: '2026-11-18T12:00:00.000Z' }));
      return ok({ updated });
    }
    const read = c.method === 'PATCH' && /\/notifications\/([^/]+)\/read$/.exec(c.path);
    if (read) {
      const one = inbox.find((n) => n.id === read[1]);
      if (!one) return { status: 404, body: { code: 'NOTIFICATION_NOT_FOUND', message: 'الإشعار غير موجود' } };
      Object.assign(one, { isRead: true, readAt: '2026-11-18T12:00:00.000Z' });
      return ok(one);
    }
    if (c.path.endsWith('/teacher/workspace')) return ok(workspaceFixture());
    const res = /\/teacher\/resources\/([^/]+)$/.exec(c.path);
    if (res) return ok(resourceFixture(res[1]!));
    return { status: 500, body: {} };
  };
  globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    const call: Call = { method: init?.method ?? 'GET', path: u.pathname, params: u.searchParams };
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
const countCalls = () => calls.filter((c) => c.path.endsWith('/notifications/unread-count')).length;
const patches = () => calls.filter((c) => c.method === 'PATCH');

const clients: QueryClient[] = [];
let client: QueryClient;
function renderUi(ui: React.ReactElement, reuse = false) {
  if (!reuse || !client) {
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
    clients.push(client);
  }
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

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  mockPush.mockReset();
  inbox = [];
  appListeners = [];
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appListeners.push(listener as (s: AppStateStatus) => void);
    return { remove: () => (appListeners = appListeners.filter((l) => l !== listener)) } as never;
  });
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(async () => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  await act(async () => {
    for (const c of clients.splice(0)) {
      await c.cancelQueries();
      c.clear();
    }
  });
});

const t = ar.notifications;
const unreadRows = (n: number) => Array.from({ length: n }, (_, i) => notificationFixture(`n${i}`));

/* ---------------------------------- bell ---------------------------------- */

describe('the bell', () => {
  it('no badge at 0; the unread count otherwise; «99+» beyond 99 — and it opens the inbox', async () => {
    stub();
    const onPress = jest.fn();
    await renderUi(<NotificationBell userId="u1" onPress={onPress} />);
    await settle();
    expect(screen.queryByTestId('notification-badge')).toBeNull();
    expect(screen.getByTestId('notification-bell').props.accessibilityLabel).toBe(t.bellLabel(0));
    await fireEvent.press(screen.getByTestId('notification-bell'));
    expect(onPress).toHaveBeenCalledTimes(1);
    await screen.unmount();

    inbox = unreadRows(3);
    await renderUi(<NotificationBell userId="u1" onPress={jest.fn()} />);
    await settle();
    expect(screen.getByText(ltr('3'), { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByLabelText(t.bellLabel(3))).toBeTruthy();
    await screen.unmount();

    stub((c) => (c.path.endsWith('/unread-count') ? ok({ count: 250 }) : undefined));
    await renderUi(<NotificationBell userId="u1" onPress={jest.fn()} />);
    await settle();
    expect(screen.getByText(ltr('99+'), { includeHiddenElements: true })).toBeTruthy();
  });

  it('polls every 30 s while ACTIVE, never in the background, refreshes at once on return; one timer only', async () => {
    jest.useFakeTimers();
    stub();
    await renderUi(<NotificationBell userId="u1" onPress={jest.fn()} />);
    await act(() => jest.advanceTimersByTimeAsync(0));
    expect(countCalls()).toBe(1);
    await act(() => jest.advanceTimersByTimeAsync(UNREAD_POLL_MS));
    expect(countCalls()).toBe(2);
    await act(() => jest.advanceTimersByTimeAsync(UNREAD_POLL_MS));
    expect(countCalls()).toBe(3);

    await setAppState('background');
    await act(() => jest.advanceTimersByTimeAsync(UNREAD_POLL_MS * 4));
    expect(countCalls()).toBe(3);

    inbox = unreadRows(2);
    await setAppState('active');
    await act(() => jest.advanceTimersByTimeAsync(0));
    expect(countCalls()).toBe(4);
    expect(screen.getByText(ltr('2'), { includeHiddenElements: true })).toBeTruthy();
    // Back to the normal rhythm: exactly one more per 30 s (no second timer)
    await act(() => jest.advanceTimersByTimeAsync(UNREAD_POLL_MS));
    expect(countCalls()).toBe(5);
  });

  it('no request and no timer without an account; none after it is gone (logout unmounts the workspace)', async () => {
    jest.useFakeTimers();
    stub();
    await renderUi(<NotificationBell userId="" onPress={jest.fn()} />);
    await act(() => jest.advanceTimersByTimeAsync(UNREAD_POLL_MS * 3));
    expect(countCalls()).toBe(0);
    await screen.unmount();

    await renderUi(<NotificationBell userId="u1" onPress={jest.fn()} />);
    await act(() => jest.advanceTimersByTimeAsync(0));
    expect(countCalls()).toBe(1);
    await screen.unmount();
    await act(() => jest.advanceTimersByTimeAsync(UNREAD_POLL_MS * 3));
    expect(countCalls()).toBe(1);
    expect(appListeners).toHaveLength(0);
  });

  it('another account on the same phone never sees the previous count', async () => {
    stub((c) => (c.path.endsWith('/unread-count') ? ok({ count: 7 }) : undefined));
    await renderUi(<NotificationBell userId="u1" onPress={jest.fn()} />);
    await settle();
    expect(screen.getByText(ltr('7'), { includeHiddenElements: true })).toBeTruthy();
    await screen.unmount();
    stub((c) => (c.path.endsWith('/unread-count') ? 'pending' : undefined));
    await renderUi(<NotificationBell userId="u2" onPress={jest.fn()} />, true);
    await settle();
    expect(screen.queryByTestId('notification-badge')).toBeNull();
  });
});

/* ---------------------------------- inbox ---------------------------------- */

describe('«الإشعارات»', () => {
  it('lists my notifications, unread clearly marked, with their Arabic time and «content gone» note', async () => {
    inbox = [
      notificationFixture('n1', { title: 'إعلان جديد', entityType: 'ANNOUNCEMENT', type: 'ANNOUNCEMENT_PUBLISHED' }),
      notificationFixture('n2', { isRead: true, title: 'مورد جديد', available: false }),
    ];
    stub();
    await renderUi(<TeacherNotificationsScreen />);
    await settle();
    expect(screen.getAllByTestId('notification-unread')).toHaveLength(1);
    expect(screen.getAllByTestId('notification-read')).toHaveLength(1);
    expect(screen.getAllByTestId('unread-dot')).toHaveLength(1);
    expect(screen.getByTestId('notification-unread').props.accessibilityLabel).toMatch(new RegExp(`^${t.unread}، إعلان جديد`));
    expect(screen.getByTestId('notification-read').props.accessibilityLabel).toContain(t.gone);
    expect(calls.find((c) => c.method === 'GET' && c.path.endsWith('/notifications'))!.params.get('pageSize')).toBe('20');
  });

  it('«غير المقروءة» asks the server for unreadOnly=true; each filter has its own empty state', async () => {
    stub();
    await renderUi(<TeacherNotificationsScreen />);
    await settle();
    expect(screen.getByText(t.empty)).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: t.filter.unread }));
    await settle();
    const last = calls.filter((c) => c.method === 'GET' && c.path.endsWith('/notifications')).at(-1)!;
    expect(last.params.get('unreadOnly')).toBe('true');
    expect(screen.getByText(t.emptyUnread)).toBeTruthy();
  });

  it('«عرض المزيد» loads the next page', async () => {
    stub((c) =>
      c.method === 'GET' && c.path.endsWith('/notifications')
        ? ok(c.params.get('page') === '2' ? notificationPage([notificationFixture('p2')], 2, 2, 21) : notificationPage(unreadRows(20), 1, 2, 21))
        : undefined,
    );
    await renderUi(<TeacherNotificationsScreen />);
    await settle();
    expect(screen.getAllByTestId('notification-unread')).toHaveLength(20);
    await fireEvent.press(screen.getByLabelText(t.loadMore));
    await settle();
    expect(screen.getAllByTestId('notification-unread')).toHaveLength(21);
    expect(screen.queryByLabelText(t.loadMore)).toBeNull();
  });

  it('offline: the connection error state, no fake list', async () => {
    stub((c) => (c.path.endsWith('/notifications') ? 'offline' : undefined));
    await renderUi(<TeacherNotificationsScreen />);
    await settle();
    expect(screen.getByText(ar.states.offlineTitle)).toBeTruthy();
    expect(screen.queryByTestId('notification-unread')).toBeNull();
  });
});

describe('opening a notification', () => {
  it('unread resource: marked read FIRST, the count drops, then the verified resource screen opens', async () => {
    inbox = [notificationFixture('n1', { entityId: 'res-1' }), notificationFixture('n2')];
    stub();
    await renderUi(<TeacherNotificationsScreen />);
    await settle();
    expect(screen.getByRole('radio', { name: `${t.filter.unread} (${ltr('2')})` })).toBeTruthy();
    await fireEvent.press(screen.getAllByTestId('notification-unread')[0]!);
    await settle();
    const order = calls.filter((c) => c.method === 'PATCH' || c.path.includes('/teacher/resources/')).map((c) => `${c.method} ${c.path.replace(/^.*\/api/, '')}`);
    expect(order).toEqual(['PATCH /notifications/n1/read', 'GET /teacher/resources/res-1']);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teacher/resources/[id]', params: { id: 'res-1' } });
    expect(screen.getAllByTestId('notification-unread')).toHaveLength(1);
    expect(screen.getByRole('radio', { name: `${t.filter.unread} (${ltr('1')})` })).toBeTruthy();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('already read: no PATCH, it just opens', async () => {
    inbox = [notificationFixture('n1', { isRead: true })];
    stub();
    await renderUi(<TeacherNotificationsScreen />);
    await settle();
    await fireEvent.press(screen.getByTestId('notification-read'));
    await settle();
    expect(patches()).toHaveLength(0);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('mark-read FAILS: the error is shown, the row stays unread, nothing opens', async () => {
    inbox = [notificationFixture('n1')];
    stub((c) => (c.method === 'PATCH' ? 'offline' : undefined));
    await renderUi(<TeacherNotificationsScreen />);
    await settle();
    await fireEvent.press(screen.getByTestId('notification-unread'));
    await settle();
    expect(alertSpy).toHaveBeenCalledWith(t.title, expect.stringContaining(t.markReadFailed));
    expect(screen.getByTestId('notification-unread')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('deleted content: read, «لم يعد هذا المحتوى متاحًا», nothing fetched or opened', async () => {
    inbox = [notificationFixture('n1', { available: false })];
    stub();
    await renderUi(<TeacherNotificationsScreen />);
    await settle();
    await fireEvent.press(screen.getByTestId('notification-unread'));
    await settle();
    expect(patches()).toHaveLength(1);
    expect(calls.some((c) => c.path.includes('/teacher/resources/'))).toBe(false);
    expect(alertSpy).toHaveBeenCalledWith(t.title, t.gone);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('an admin-only subject: read, then the «not in the app yet» message', async () => {
    inbox = [notificationFixture('n1', { type: 'REGISTRATION_REQUEST_SUBMITTED', entityType: 'REGISTRATION_REQUEST' })];
    stub();
    await renderUi(<TeacherNotificationsScreen />);
    await settle();
    await fireEvent.press(screen.getByTestId('notification-unread'));
    await settle();
    expect(alertSpy).toHaveBeenCalledWith(t.title, t.unsupported);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('content this account lost (404 / 403): «لم يعد هذا المحتوى متاحًا لحسابك»', async () => {
    for (const status of [404, 403]) {
      inbox = [notificationFixture('n1', { isRead: true })];
      stub((c) => (c.path.includes('/teacher/resources/') ? { status, body: { code: 'X', message: 'x' } } : undefined));
      await renderUi(<TeacherNotificationsScreen />);
      await settle();
      await fireEvent.press(screen.getByTestId('notification-read'));
      await settle();
      expect(alertSpy).toHaveBeenLastCalledWith(t.title, t.goneForMe);
      await screen.unmount();
    }
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('a student: opened only while still in my classes (the workspace, fetched fresh)', async () => {
    inbox = [
      notificationFixture('in', { isRead: true, type: 'STUDENT_JOINED_CLASS', entityType: 'STUDENT', entityId: 'st1', title: 'طالب في مجموعتي' }),
      notificationFixture('out', { isRead: true, type: 'STUDENT_LEFT_CLASS', entityType: 'STUDENT', entityId: 'st-gone', title: 'طالب غادر' }),
    ];
    stub();
    await renderUi(<TeacherNotificationsScreen />);
    await settle();
    await fireEvent.press(screen.getByLabelText(/طالب في مجموعتي/));
    await settle();
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teacher/students/[id]', params: { id: 'st1' } });
    await fireEvent.press(screen.getByLabelText(/طالب غادر/));
    await settle();
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(t.title, t.goneForMe);
  });

  it('a double tap marks read ONCE and opens ONCE', async () => {
    inbox = [notificationFixture('n1')];
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => (finish = resolve));
    stub();
    const route = globalThis.fetch as jest.Mock;
    globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') await gate;
      return route(url, init);
    }) as unknown as typeof fetch;
    await renderUi(<TeacherNotificationsScreen />);
    await settle();
    const row = screen.getByTestId('notification-unread');
    await fireEvent.press(row);
    // Still marking: busy, and a second tap is ignored
    expect(row.props.accessibilityState).toMatchObject({ busy: true });
    await fireEvent.press(row);
    await act(async () => finish());
    await settle();
    expect(patches()).toHaveLength(1);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});

describe('«تحديد الكل كمقروء»', () => {
  it('no confirmation, ONE request on a double tap; every row read and the count gone', async () => {
    inbox = unreadRows(3);
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => (finish = resolve));
    stub();
    const route = globalThis.fetch as jest.Mock;
    globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') await gate;
      return route(url, init);
    }) as unknown as typeof fetch;
    await renderUi(<TeacherNotificationsScreen />);
    await settle();
    const button = screen.getByLabelText(t.markAll);
    await fireEvent.press(button);
    await fireEvent.press(button);
    await act(async () => finish());
    await settle();
    expect(patches().map((c) => c.path.replace(/^.*\/api/, ''))).toEqual(['/notifications/read-all']);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(screen.queryAllByTestId('notification-unread')).toHaveLength(0);
    expect(screen.getAllByTestId('notification-read')).toHaveLength(3);
    expect(screen.getByLabelText(t.markAll).props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('disabled with nothing unread; a failure is shown and nothing is marked', async () => {
    stub();
    await renderUi(<TeacherNotificationsScreen />);
    await settle();
    expect(screen.getByLabelText(t.markAll).props.accessibilityState).toMatchObject({ disabled: true });
    await screen.unmount();

    inbox = unreadRows(2);
    stub((c) => (c.method === 'PATCH' ? { status: 500, body: { message: 'خطأ في الخادم' } } : undefined));
    await renderUi(<TeacherNotificationsScreen />);
    await settle();
    await fireEvent.press(screen.getByLabelText(t.markAll));
    await settle();
    expect(screen.getByRole('alert', { name: new RegExp(t.markAllFailed) })).toBeTruthy();
    expect(screen.getAllByTestId('notification-unread')).toHaveLength(2);
  });
});
