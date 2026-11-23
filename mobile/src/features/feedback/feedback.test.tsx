import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { SessionUser } from '@/features/auth/types';
import { teacherNotificationTarget } from '@/features/notifications/notification-model';
import { ar } from '@/i18n/ar';
import { lightColors } from '@/theme/colors';

import { FeedbackDetailScreen, FeedbackFormScreen, FeedbackListScreen } from './feedback-screens';
import { FeedbackEntry } from './feedback-entry';
import { validateFeedback } from './feedback-model';

/*
 * «الملاحظات والاقتراحات» (mobile) against stubbed HTTP answers shaped like the feedback DTOs.
 * Only native modules, navigation and the network are replaced.
 */
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.4.0' } } }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn(), canGoBack: () => true }),
  useNavigation: () => ({ isFocused: () => true }),
  Stack: { Screen: () => null },
}));
const mockPicker = { launchImageLibraryAsync: jest.fn(), launchCameraAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn() };
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: (o: unknown) => mockPicker.launchImageLibraryAsync(o),
  launchCameraAsync: (o: unknown) => mockPicker.launchCameraAsync(o),
  requestCameraPermissionsAsync: () => mockPicker.requestCameraPermissionsAsync(),
}));
jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    async arrayBuffer() {
      return new TextEncoder().encode(`PNG of ${this.uri}`).buffer;
    }
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

/** React Native's FormData as the phone has it. */
class MockFormData {
  readonly parts: [string, unknown][] = [];
  append(name: string, value: unknown) {
    this.parts.push([name, value]);
  }
}

type Answer = { status: number; body?: unknown } | 'pending-until-released';
type Call = { method: string; path: string; params: URLSearchParams; body?: unknown };
const calls: Call[] = [];
let release: (() => void) | null = null;
const PREFS = { timezone: 'Africa/Tunis', dateFormat: 'DD/MM/YYYY', defaultCalendarView: 'week', defaultPageSize: 20, currentAcademicYear: null };
const ok = (body: unknown, status = 200): Answer => ({ status, body });

function stub(custom: (c: Call) => Answer | undefined) {
  calls.length = 0;
  globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    const call: Call = {
      method: init?.method ?? 'GET',
      path: u.pathname,
      params: u.searchParams,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
    };
    calls.push(call);
    const a = custom(call) ?? (call.path.endsWith('/platform-preferences') ? ok(PREFS) : ok({}, 500));
    if (a === 'pending-until-released') await new Promise<void>((r) => (release = r));
    const answer = a === 'pending-until-released' ? { status: 201, body: feedback({ id: 'new1' }) } : a;
    return { status: answer.status, ok: answer.status < 300, text: async () => (answer.body === undefined ? '' : JSON.stringify(answer.body)) };
  }) as unknown as typeof fetch;
}
const writes = () => calls.filter((c) => c.method !== 'GET');

const feedback = (over: object = {}) => ({
  id: 'f1',
  category: 'BUG',
  title: 'زر الحفظ لا يعمل',
  description: 'لا يحدث شيء عند الضغط',
  status: 'NEW',
  screenshot: null,
  response: null,
  respondedAt: null,
  resolvedAt: null,
  createdAt: '2026-11-20T10:00:00.000Z',
  updatedAt: '2026-11-20T10:00:00.000Z',
  version: 1,
  ...over,
});
const page = (data: unknown[]) => ({ data, meta: { page: 1, pageSize: 50, total: data.length, totalPages: 1 } });

const clients: QueryClient[] = [];
function renderScreen(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  return render(ui, { wrapper });
}
const settle = (ms = 30) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));

const f = ar.feedback;
const originalFormData = globalThis.FormData;
beforeEach(() => {
  mockPush.mockReset();
  mockBack.mockReset();
  mockPicker.launchImageLibraryAsync.mockReset();
  mockPicker.launchCameraAsync.mockReset();
  mockPicker.requestCameraPermissionsAsync.mockReset();
  globalThis.FormData = MockFormData as unknown as typeof FormData;
  release = null;
});
afterEach(async () => {
  globalThis.FormData = originalFormData;
  await act(async () => {
    for (const c of clients.splice(0)) {
      await c.cancelQueries();
      c.clear();
    }
  });
});

describe('«الملاحظات والاقتراحات» — mobile', () => {
  it('the entry (account / settings area) opens the feedback of this workspace', async () => {
    await renderScreen(<FeedbackEntry space="teacher" />);
    await fireEvent.press(screen.getByTestId('feedback-entry'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/feedback', params: { space: 'teacher' } });
  });

  it('«ملاحظاتي»: compact cards (title, category, date, status, response indicator); the green «إرسال ملاحظة»', async () => {
    stub((c) =>
      c.path === '/api/teacher/feedback'
        ? ok(page([feedback(), feedback({ id: 'f2', title: 'اقتراح', category: 'IMPROVEMENT', status: 'RESOLVED', response: 'تم' })]))
        : undefined,
    );
    await renderScreen(<FeedbackListScreen space="teacher" />);
    const first = await screen.findByTestId('feedback-f1');
    expect(first.props.accessibilityLabel).toBe(`زر الحفظ لا يعمل · ${f.category.BUG} · ${f.status.NEW} · 20 نوفمبر 2026`);
    expect(screen.getByTestId('feedback-f2').props.accessibilityLabel).toContain(`${f.status.RESOLVED} · 20 نوفمبر 2026 · ${f.responded}`);
    expect(screen.getAllByTestId('has-response')).toHaveLength(1);
    await fireEvent.press(first);
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/feedback/[id]', params: { id: 'f1', space: 'teacher' } });
    const send = screen.getByLabelText(f.send);
    expect(StyleSheet.flatten(send.props.style).backgroundColor).toBe(lightColors.primary);
    await fireEvent.press(send);
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/feedback/new', params: { space: 'teacher' } });
    // my own list only
    expect(calls.filter((c) => c.path.includes('/feedback')).every((c) => c.path === '/api/teacher/feedback')).toBe(true);
  });

  it('an empty history: «لم ترسل أي ملاحظات بعد»', async () => {
    stub((c) => (c.path === '/api/student/feedback' ? ok(page([])) : undefined));
    await renderScreen(<FeedbackListScreen space="student" />);
    expect(await screen.findByText(f.empty)).toBeTruthy();
  });

  it('the form: required fields (nothing sent); the server confirmation before success; one request for two taps; the text kept on failure', async () => {
    stub((c) => (c.method === 'POST' && c.path === '/api/teacher/feedback' ? 'pending-until-released' : undefined));
    await renderScreen(<FeedbackFormScreen space="teacher" />);
    const submit = screen.getByLabelText(f.submit);
    await fireEvent.press(submit);
    expect(screen.getByText(f.required(f.titleLabel))).toBeTruthy();
    expect(screen.getByText(f.required(f.descriptionLabel))).toBeTruthy();
    expect(writes()).toEqual([]);
    await fireEvent.press(screen.getByRole('radio', { name: f.category.IMPROVEMENT }));
    await fireEvent.changeText(screen.getByLabelText(f.titleLabel), '  إضافة بحث  ');
    await fireEvent.changeText(screen.getByLabelText(f.descriptionLabel), 'أقترح خانة بحث في الحصص');
    await fireEvent.press(submit);
    await fireEvent.press(screen.getByLabelText(f.sending));
    await settle();
    expect(writes()).toHaveLength(1);
    expect(screen.queryByText(f.sent)).toBeNull(); // not before the server answered
    expect(writes()[0]).toMatchObject({
      path: '/api/teacher/feedback',
      body: { category: 'IMPROVEMENT', title: 'إضافة بحث', description: 'أقترح خانة بحث في الحصص', platform: 'IOS', appVersion: '1.4.0' },
    });
    expect(writes()[0]!.body).not.toHaveProperty('status');
    expect(writes()[0]!.body).not.toHaveProperty('createdByUserId');
    await act(async () => release?.());
    expect(await screen.findByText(f.sent)).toBeTruthy();
    expect(writes()).toHaveLength(1);
  });

  it('an error: its Arabic message, no success, the text kept', async () => {
    stub((c) =>
      c.method === 'POST' ? ok({ code: 'FEEDBACK_RATE_LIMITED', message: 'أرسلت عددًا كبيرًا من الملاحظات خلال وقت قصير، يرجى المحاولة لاحقًا' }, 429) : undefined,
    );
    await renderScreen(<FeedbackFormScreen space="student" />);
    await fireEvent.changeText(screen.getByLabelText(f.titleLabel), 'عنوان');
    await fireEvent.changeText(screen.getByLabelText(f.descriptionLabel), 'وصف');
    await fireEvent.press(screen.getByLabelText(f.submit));
    expect(await screen.findByText(/أرسلت عددًا كبيرًا من الملاحظات/)).toBeTruthy();
    expect(screen.queryByText(f.sent)).toBeNull();
    expect(screen.getByLabelText(f.titleLabel).props.value).toBe('عنوان');
  });

  it('a screenshot from the GALLERY only (no camera, no camera permission): previewed, uploaded first, then attached', async () => {
    mockPicker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///shot.png', mimeType: 'image/png', fileSize: 1000 }] });
    stub((c) => {
      if (c.path === '/api/files') return ok({ id: 'file-1' }, 201);
      if (c.method === 'POST' && c.path === '/api/teacher/feedback') return ok(feedback({ id: 'new2' }), 201);
      return undefined;
    });
    await renderScreen(<FeedbackFormScreen space="teacher" />);
    await fireEvent.press(screen.getByLabelText(f.addScreenshot));
    expect(await screen.findByTestId('screenshot-preview')).toBeTruthy();
    expect(mockPicker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ['images'], allowsEditing: false }));
    expect(mockPicker.launchCameraAsync).not.toHaveBeenCalled();
    expect(mockPicker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText(f.titleLabel), 'صفحة الحضور');
    await fireEvent.changeText(screen.getByLabelText(f.descriptionLabel), 'لا تُفتح');
    await fireEvent.press(screen.getByLabelText(f.submit));
    await settle();
    const [upload, created] = writes();
    expect(upload!.path).toBe('/api/files');
    expect(upload!.params.get('purpose')).toBe('FEEDBACK_SCREENSHOT');
    expect((upload!.body as MockFormData).parts[0]![0]).toBe('file');
    expect(created!.body).toMatchObject({ screenshotFileId: 'file-1' });
  });

  it('a picked file that is not an image: refused before anything is sent', async () => {
    mockPicker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///doc.pdf', mimeType: 'application/pdf' }] });
    stub(() => undefined);
    await renderScreen(<FeedbackFormScreen space="teacher" />);
    await fireEvent.press(screen.getByLabelText(f.addScreenshot));
    expect(await screen.findByText(f.screenshotType)).toBeTruthy();
    expect(screen.queryByTestId('screenshot-preview')).toBeNull();
    expect(writes()).toEqual([]);
  });

  it('details: the status, the description and the admins’ response', async () => {
    stub((c) =>
      c.path === '/api/teacher/feedback/f1'
        ? ok(feedback({ status: 'RESOLVED', response: 'شكرًا على ملاحظتك. تم إصلاح المشكلة في صفحة الحصص.', respondedAt: '2026-11-21T09:00:00.000Z' }))
        : undefined,
    );
    await renderScreen(<FeedbackDetailScreen space="teacher" id="f1" />);
    expect(await screen.findByText('زر الحفظ لا يعمل')).toBeTruthy();
    expect(screen.getByText(f.status.RESOLVED)).toBeTruthy();
    expect(screen.getByText('لا يحدث شيء عند الضغط')).toBeTruthy();
    expect(screen.getByText('شكرًا على ملاحظتك. تم إصلاح المشكلة في صفحة الحصص.')).toBeTruthy();
  });

  it('details without a response yet: the hint; another user’s id: not found (the server answers 404)', async () => {
    stub((c) => (c.path === '/api/teacher/feedback/f1' ? ok(feedback()) : c.path === '/api/teacher/feedback/other' ? ok({ code: 'FEEDBACK_NOT_FOUND', message: 'الملاحظة غير موجودة' }, 404) : undefined));
    await renderScreen(<FeedbackDetailScreen space="teacher" id="f1" />);
    expect(await screen.findByText(f.noResponse)).toBeTruthy();
    await renderScreen(<FeedbackDetailScreen space="teacher" id="other" />);
    expect(await screen.findByText('الملاحظة غير موجودة')).toBeTruthy();
  });

  it('a feedback notification opens my submission', () => {
    expect(teacherNotificationTarget({ type: 'FEEDBACK_UPDATED', entityType: 'FEEDBACK', entityId: 'f1', available: true })).toEqual({
      kind: 'open',
      href: { pathname: '/feedback/[id]', params: { id: 'f1', space: 'teacher' } },
      check: { kind: 'feedback', id: 'f1' },
    });
  });

  it('validation rules (the same as the server)', () => {
    expect(validateFeedback({ category: 'BUG', title: ' ', description: 'x' })).toEqual({ title: 'required' });
    expect(validateFeedback({ category: 'BUG', title: 'x'.repeat(121), description: 'y'.repeat(3001) })).toEqual({ title: 'tooLong', description: 'tooLong' });
    expect(validateFeedback({ category: 'OTHER', title: 'x', description: 'y' })).toEqual({});
  });
});
