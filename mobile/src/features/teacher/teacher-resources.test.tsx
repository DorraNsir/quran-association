import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert, Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { SessionUser } from '@/features/auth/types';
import { ar } from '@/i18n/ar';
import { auto, ltr } from '@/i18n/format';

import { linkResource, resourceFixture, resourcePage } from './__fixtures__/resources';
import { workspaceFixture } from './__fixtures__/workspace';
import { FileOpenError } from './private-file';
import type { Resource } from './resource-types';
import { TeacherResourceScreen } from './teacher-resource';
import { TeacherResourceFormScreen } from './teacher-resource-form';
import { TeacherResourcesScreen } from './teacher-resources';
import { CONFIRMATION_MS } from './use-confirm-then-back';
import { resourceKey } from './use-resources';

/*
 * «الموارد التعليمية» screens against stubbed HTTP answers shaped like the
 * resource DTOs (test-only fixtures). Replaced: native modules (icons, the
 * document picker, the private-file opener — unit-tested on its own),
 * navigation and the network. No real upload or deletion.
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
const mockPick = jest.fn();
jest.mock('expo-document-picker', () => ({ getDocumentAsync: (...a: unknown[]) => mockPick(...a) }));
const mockOpen = jest.fn();
jest.mock('./private-file', () => ({
  ...jest.requireActual('./private-file'),
  openPrivateFile: (...a: unknown[]) => mockOpen(...a),
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

/** The app's FormData as the phone has it (Jest's Node FormData stringifies objects). */
class MockFormData {
  readonly parts: [string, unknown][] = [];
  append(name: string, value: unknown) {
    this.parts.push([name, value]);
  }
  entries() {
    return this.parts;
  }
}
/** The picked file's content, read through expo-file-system (no real disk). */
jest.mock('expo-file-system', () => ({
  ...jest.requireActual('expo-file-system'),
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    async arrayBuffer() {
      return new TextEncoder().encode(`%PDF-1.4 content of ${this.uri}`).buffer;
    }
  },
}));
/**
 * What expo/fetch (SDK 58's global fetch) really sends for this FormData:
 * ITS converter — which refuses React Native's { uri } parts.
 */
async function multipartText(form: unknown) {
  const { convertFormDataAsync } = jest.requireActual('expo/src/winter/fetch/convertFormData');
  const { body } = await convertFormDataAsync(form, 'BOUNDARY');
  return new TextDecoder().decode(body as Uint8Array);
}
const realFormData = globalThis.FormData;
beforeAll(() => {
  globalThis.FormData = MockFormData as unknown as typeof FormData;
});
afterAll(() => {
  globalThis.FormData = realFormData;
});

type Answer = { status: number; body?: unknown } | 'offline' | 'pending';
type Call = { method: string; path: string; params: URLSearchParams; body?: unknown; parts?: unknown[]; form?: unknown };
const calls: Call[] = [];
const ok = (body: unknown): Answer => ({ status: 200, body });
const PREFS = { timezone: 'Africa/Tunis', dateFormat: 'DD/MM/YYYY', defaultCalendarView: 'week', defaultPageSize: 20, currentAcademicYear: null };

function stub(custom: (c: Call) => Answer | undefined = () => undefined, one: Resource = resourceFixture('r1')) {
  calls.length = 0;
  const route = (c: Call): Answer => {
    const hit = custom(c);
    if (hit) return hit;
    if (c.path.endsWith('/platform-preferences')) return ok(PREFS);
    if (c.path.endsWith('/teacher/workspace')) return ok(workspaceFixture());
    if (c.method === 'GET' && c.path.endsWith('/teacher/resources')) return ok(resourcePage([one]));
    if (c.method === 'GET' && c.path.endsWith(`/teacher/resources/${one.id}`)) return ok(one);
    return { status: 500, body: {} };
  };
  globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    const form = init?.body instanceof MockFormData ? init.body : null;
    const call: Call = {
      method: init?.method ?? 'GET',
      path: u.pathname,
      params: u.searchParams,
      body: !form && init?.body ? JSON.parse(String(init.body)) : undefined,
      parts: form?.parts,
      form: form ?? undefined,
    };
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
const lists = () => calls.filter((c) => c.method === 'GET' && c.path.endsWith('/teacher/resources'));

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
  mockPick.mockReset();
  mockOpen.mockReset();
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

const r = ar.resources;
const radio = (name: string) => screen.getByRole('radio', { name });

describe('list', () => {
  it('compact rows: title, file (name · size) or site, type and targets, publisher · date — no «منشوري» badge', async () => {
    stub((c) =>
      c.method === 'GET' && c.path.endsWith('/teacher/resources')
        ? ok(resourcePage([resourceFixture('r1'), linkResource('r2', { canManage: false, publishedBy: { id: 'u9', firstName: 'سارة', lastName: 'بن علي' } })]))
        : undefined,
    );
    await renderScreen(<TeacherResourcesScreen />);
    expect(await screen.findByText(r.total(2))).toBeTruthy();
    expect(screen.getByText(auto('أحكام النون الساكنة'))).toBeTruthy();
    // A Latin file name / site: an LTR run (characters unchanged); the size apart
    expect(screen.getByText(ltr('ahkam-noun.pdf'))).toBeTruthy();
    expect(screen.getByText('· 2.4 م.ب')).toBeTruthy();
    expect(screen.getByText(ltr('youtube.com'))).toBeTruthy();
    expect(screen.getAllByText(auto('مجموعة الفجر — الفرع الرئيسي'))).toHaveLength(2);
    expect(screen.getByText(r.publishedBy(auto('سارة بن علي'), '10 نوفمبر 2026'))).toBeTruthy();
    // The «منشوري» badge is gone from the cards; the «منشوراتي» filter stays
    expect(screen.queryByText(r.mine)).toBeNull();
    expect(radio(r.scope.mine)).toBeTruthy();
    expect(screen.getByLabelText(r.add)).toBeTruthy();
  });

  it('long target lists: two compact chips and «+n» (named for screen readers); the details keep every name', async () => {
    const many = resourceFixture('r1', {
      groupClasses: ['أ', 'ب', 'ج', 'د'].map((n, i) => ({ id: `c${i}`, group: { id: `g${i}`, name: `مجموعة ${n}` }, branch: { id: 'b1', name: 'الفرع الرئيسي' } })),
    });
    stub((c) => (c.method === 'GET' && c.path.endsWith('/teacher/resources') ? ok(resourcePage([many])) : undefined), many);
    await renderScreen(<TeacherResourcesScreen />);
    expect(await screen.findByText(auto('مجموعة أ — الفرع الرئيسي'))).toBeTruthy();
    expect(screen.queryByText(auto('مجموعة ج — الفرع الرئيسي'))).toBeNull();
    expect(screen.getByText(ltr('+2'))).toBeTruthy();
    expect(screen.getByLabelText(r.moreTargetsLabel('مجموعة ج — الفرع الرئيسي، مجموعة د — الفرع الرئيسي'))).toBeTruthy();
  });

  it('mixed directions: an English title and a Latin name keep their own direction, characters unchanged', async () => {
    stub((c) =>
      c.method === 'GET' && c.path.endsWith('/teacher/resources')
        ? ok(resourcePage([resourceFixture('r1', { title: 'Tajweed rules (part 1).', publishedBy: { id: 'u2', firstName: 'Sami', lastName: 'Ben Ali' } })]))
        : undefined,
    );
    await renderScreen(<TeacherResourcesScreen />);
    const title = await screen.findByText(auto('Tajweed rules (part 1).'));
    // First-strong isolate around the unchanged text
    expect(title.props.children).toBe('\u2068Tajweed rules (part 1).\u2069');
    expect(screen.getByText(r.publishedBy(auto('Sami Ben Ali'), '10 نوفمبر 2026'))).toBeTruthy();
  });

  it('filters are applied BY THE SERVER: mine, type, class, and the search after a pause; pagination', async () => {
    stub((c) =>
      c.method === 'GET' && c.path.endsWith('/teacher/resources')
        ? ok(c.params.get('page') === '2' ? resourcePage([linkResource('r2')], 2, 2, 2) : resourcePage([resourceFixture('r1')], 1, 2, 2))
        : undefined,
    );
    await renderScreen(<TeacherResourcesScreen />);
    await fireEvent.press(await screen.findByLabelText(r.loadMore));
    await settle();
    expect(screen.getByText(auto('تلاوة سورة الملك'))).toBeTruthy();
    await fireEvent.press(radio(r.scope.mine));
    // Type and class: in the filter sheet
    await fireEvent.press(screen.getByLabelText(r.filters));
    await fireEvent.press(radio(r.type.AUDIO));
    await fireEvent.press(radio('مجموعة الأمل'));
    await fireEvent.press(screen.getByLabelText(r.done));
    await settle();
    const q = lists().at(-1)!.params;
    expect([q.get('mine'), q.get('type'), q.get('groupClassId')]).toEqual(['true', 'AUDIO', 'c2']);
    // Shown as removable chips on one line; removing one re-queries without it
    expect(screen.getByLabelText(`${r.filters}، ${r.activeFilters(2)}`)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(r.removeFilter(r.type.AUDIO)));
    await settle();
    expect(lists().at(-1)!.params.get('type')).toBeNull();
    expect(lists().at(-1)!.params.get('groupClassId')).toBe('c2');
    await fireEvent.changeText(screen.getByLabelText(r.searchLabel), 'تجويد');
    await settle(450);
    expect(lists().at(-1)!.params.get('search')).toBe('تجويد');
  });

  it('opened from a class: that class filter; add keeps it', async () => {
    stub();
    await renderScreen(<TeacherResourcesScreen initialClassId="c1" />);
    await screen.findByText(r.total(1));
    expect(lists()[0]!.params.get('groupClassId')).toBe('c1');
    await fireEvent.press(screen.getByLabelText(r.add));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teacher/resources/new', params: { classId: 'c1' } });
  });

  it('no current active class: no «إضافة مورد» (the server would refuse)', async () => {
    const ws = workspaceFixture();
    ws.groupClasses = ws.groupClasses.map((c) => ({ ...c, status: 'INACTIVE' as const }));
    stub((c) => (c.path.endsWith('/teacher/workspace') ? ok(ws) : undefined));
    await renderScreen(<TeacherResourcesScreen />);
    expect(await screen.findByText(r.noClasses)).toBeTruthy();
    expect(screen.queryByLabelText(r.add)).toBeNull();
  });

  it('empty, filtered empty with reset, offline, 403 and loading states', async () => {
    stub((c) => (c.method === 'GET' && c.path.endsWith('/teacher/resources') ? ok(resourcePage([])) : undefined));
    await renderScreen(<TeacherResourcesScreen />);
    expect(await screen.findByText(r.empty)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(r.filters));
    await fireEvent.press(radio(r.type.PDF));
    await fireEvent.press(screen.getByLabelText(r.done));
    expect(await screen.findByText(r.noMatch)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(r.resetFilters));
    expect(await screen.findByText(r.empty)).toBeTruthy();
  });

  it('offline: retry offered', async () => {
    stub((c) => (c.path.endsWith('/teacher/resources') ? 'offline' : undefined));
    await renderScreen(<TeacherResourcesScreen />);
    expect(await screen.findByText(ar.states.offlineTitle)).toBeTruthy();
    expect(screen.getByLabelText(ar.states.retry)).toBeTruthy();
  });

  it('403: the forbidden state, no retry', async () => {
    stub((c) => (c.path.endsWith('/teacher/resources') ? { status: 403, body: { code: 'TEACHER_INACTIVE', message: 'ملف المعلم غير نشط' } } : undefined));
    await renderScreen(<TeacherResourcesScreen />);
    expect(await screen.findByText(ar.states.forbiddenTitle)).toBeTruthy();
    expect(screen.queryByLabelText(ar.states.retry)).toBeNull();
  });

  it('loading', async () => {
    stub((c) => (c.path.endsWith('/teacher/resources') ? 'pending' : undefined));
    await renderScreen(<TeacherResourcesScreen />);
    expect(await screen.findByLabelText(ar.states.loading)).toBeTruthy();
  });
});

describe('details', () => {
  it('a file: full information, opened through the authenticated opener (never a raw URL)', async () => {
    stub();
    mockOpen.mockResolvedValue(undefined);
    const linking = jest.spyOn(Linking, 'openURL');
    await renderScreen(<TeacherResourceScreen resourceId="r1" />);
    expect(await screen.findByText(auto('ملخص مصوّر لأحكام النون الساكنة والتنوين'))).toBeTruthy();
    expect(screen.getByText(r.publishedBy(auto('أحمد السالمي'), 'الثلاثاء 10 نوفمبر 2026'))).toBeTruthy();
    expect(screen.getByText(r.visibility.GROUP_CLASS)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(r.openFile));
    await settle();
    expect(mockOpen).toHaveBeenCalledWith(resourceFixture('r1').file, 'أحكام النون الساكنة');
    expect(linking).not.toHaveBeenCalled();
    linking.mockRestore();
  });

  it.each([
    ['unavailable', r.fileErrors.unavailable],
    ['offline', r.fileErrors.offline],
    ['noViewer', r.fileErrors.noViewer],
    ['expired', r.fileErrors.expired],
  ] as const)('file opening failure «%s» is explained', async (kind, message) => {
    stub();
    mockOpen.mockRejectedValue(new FileOpenError(kind));
    await renderScreen(<TeacherResourceScreen resourceId="r1" />);
    await fireEvent.press(await screen.findByLabelText(r.openFile));
    await settle();
    expect(screen.getByRole('alert', { name: message })).toBeTruthy();
  });

  it('a safe link opens through the system; an unsafe one is never opened', async () => {
    const linking = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
    stub(undefined, linkResource('r2'));
    await renderScreen(<TeacherResourceScreen resourceId="r2" />);
    await fireEvent.press(await screen.findByLabelText(r.openLink));
    expect(linking).toHaveBeenCalledWith('https://www.youtube.com/watch?v=abc123');
    linking.mockRestore();
  });

  it('an unsafe stored link (javascript:): a warning, no open button', async () => {
    const linking = jest.spyOn(Linking, 'openURL');
    stub(undefined, linkResource('r3', { externalUrl: 'javascript:alert(1)' }));
    await renderScreen(<TeacherResourceScreen resourceId="r3" />);
    expect(await screen.findByText(r.unsafeLink)).toBeTruthy();
    expect(screen.queryByLabelText(r.openLink)).toBeNull();
    expect(linking).not.toHaveBeenCalled();
    linking.mockRestore();
  });

  it('someone else\'s resource (canManage false): no edit, no delete', async () => {
    stub(undefined, resourceFixture('r1', { canManage: false }));
    await renderScreen(<TeacherResourceScreen resourceId="r1" />);
    await screen.findByLabelText(r.openFile);
    expect(screen.queryByLabelText(r.edit)).toBeNull();
    expect(screen.queryByLabelText(r.delete)).toBeNull();
  });

  it('404 (deleted or not visible): «غير موجود»; offline is not', async () => {
    stub((c) => (c.path.endsWith('/teacher/resources/r9') ? { status: 404, body: { code: 'RESOURCE_NOT_FOUND', message: 'المورد غير موجود' } } : undefined));
    await renderScreen(<TeacherResourceScreen resourceId="r9" />);
    expect(await screen.findByText(r.notFound)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(r.backToList));
    expect(mockReplace).toHaveBeenCalledWith('/teacher/resources');
  });

  it('offline details: the offline state with retry', async () => {
    stub((c) => (c.path.endsWith('/teacher/resources/r1') ? 'offline' : undefined));
    await renderScreen(<TeacherResourceScreen resourceId="r1" />);
    expect(await screen.findByText(ar.states.offlineTitle)).toBeTruthy();
    expect(screen.queryByText(r.notFound)).toBeNull();
  });
});

describe('deleting (my own resource)', () => {
  const answerAlert = (choice: 'cancel' | 'destructive') =>
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === choice)?.onPress?.());

  it('asks first, naming the resource; cancelling sends nothing', async () => {
    stub();
    const alert = answerAlert('cancel');
    await renderScreen(<TeacherResourceScreen resourceId="r1" />);
    await fireEvent.press(await screen.findByLabelText(r.delete));
    expect(alert).toHaveBeenCalledWith(r.deleteTitle, r.deleteMessage('أحكام النون الساكنة'), expect.any(Array));
    expect(writes()).toHaveLength(0);
    alert.mockRestore();
  });

  it('confirmed: DELETE, the lists refetched only after the server confirmed, then back', async () => {
    stub((c) => (c.method === 'DELETE' ? { status: 204 } : undefined));
    const alert = answerAlert('destructive');
    await renderScreen(<TeacherResourceScreen resourceId="r1" />);
    await fireEvent.press(await screen.findByLabelText(r.delete));
    await settle();
    expect(writes()).toEqual([expect.objectContaining({ method: 'DELETE', path: '/api/teacher/resources/r1' })]);
    expect(screen.getByRole('alert', { name: r.deleted })).toBeTruthy();
    // The deleted resource is not requested again; the lists are refetched
    const detailGets = () => calls.filter((c) => c.method === 'GET' && c.path.endsWith('/teacher/resources/r1')).length;
    const before = detailGets();
    await settle(50);
    expect(detailGets()).toBe(before);
    expect(client.getQueryState(resourceKey('t-me', 'r1'))?.isInvalidated).toBe(false);
    await settle(CONFIRMATION_MS + 50);
    expect(mockBack).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });

  it('failure (offline): nothing removed, an error, no navigation', async () => {
    stub((c) => (c.method === 'DELETE' ? 'offline' : undefined));
    const alert = answerAlert('destructive');
    await renderScreen(<TeacherResourceScreen resourceId="r1" />);
    await fireEvent.press(await screen.findByLabelText(r.delete));
    await settle();
    expect(screen.getByRole('alert', { name: r.offlineDelete })).toBeTruthy();
    expect(screen.getByText(auto('أحكام النون الساكنة'))).toBeTruthy();
    await settle(CONFIRMATION_MS + 50);
    expect(mockBack).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});

describe('expo/fetch multipart (SDK 58 global fetch)', () => {
  it('refuses React Native\'s { uri, name, type } part — the cause of the false «تعذّر الاتصال»', async () => {
    const form = new MockFormData();
    form.append('file', { uri: 'file:///x.pdf', name: 'x.pdf', type: 'application/pdf' });
    await expect(multipartText(form)).rejects.toThrow('Unsupported FormDataPart implementation');
  });
});

describe('publishing / editing', () => {
  const picked = { canceled: false, assets: [{ uri: 'file:///cache/DocumentPicker/tajwid.pdf', name: 'tajwid.pdf', mimeType: 'application/pdf', size: 1_048_576 }] };

  it('a link: validated, then POST with the exact TeacherResourceDto; confirmation and back', async () => {
    stub((c) => (c.method === 'POST' ? { status: 201, body: linkResource('r5') } : undefined));
    await renderScreen(<TeacherResourceFormScreen initialClassId="c1" />);
    await fireEvent.changeText(await screen.findByLabelText(r.titleLabel), '  تلاوة سورة الملك ');
    await fireEvent.press(radio(r.type.VIDEO_LINK));
    await fireEvent.changeText(screen.getByLabelText(r.urlLabel), 'javascript:alert(1)');
    await fireEvent.press(screen.getByLabelText(r.save));
    expect(screen.getByRole('alert', { name: r.errors.urlInvalid })).toBeTruthy();
    expect(writes()).toHaveLength(0);
    await fireEvent.changeText(screen.getByLabelText(r.urlLabel), 'https://www.youtube.com/watch?v=abc123');
    await fireEvent.press(screen.getByLabelText(r.save));
    await settle();
    expect(writes()).toEqual([
      expect.objectContaining({
        method: 'POST',
        path: '/api/teacher/resources',
        body: { title: 'تلاوة سورة الملك', description: '', type: 'VIDEO_LINK', externalUrl: 'https://www.youtube.com/watch?v=abc123', fileId: null, groupClassIds: ['c1'] },
      }),
    ]);
    expect(screen.getByRole('alert', { name: r.created })).toBeTruthy();
    await settle(CONFIRMATION_MS + 50);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('a file: picked (limited to the type), uploaded multipart with field «file» for the first class, then attached by id', async () => {
    mockPick.mockResolvedValue(picked);
    stub((c) => {
      if (c.method === 'POST' && c.path.endsWith('/files')) return { status: 201, body: { id: 'file-9', purpose: 'EDUCATIONAL_RESOURCE', mimeType: 'application/pdf', size: 1, originalName: 'tajwid.pdf', createdAt: '', url: '/api/files/file-9' } };
      if (c.method === 'POST') return { status: 201, body: resourceFixture('r6') };
      return undefined;
    });
    await renderScreen(<TeacherResourceFormScreen />);
    await fireEvent.changeText(await screen.findByLabelText(r.titleLabel), 'أحكام التجويد');
    // Only my ACTIVE classes are offered (c2 is inactive: the server would refuse it)
    expect(screen.queryByRole('checkbox', { name: 'مجموعة الأمل' })).toBeNull();
    // My only active class is preselected
    expect(screen.getByRole('checkbox', { name: 'مجموعة الفجر' }).props.accessibilityState.checked).toBe(true);
    await fireEvent.press(screen.getByLabelText(r.pickFile));
    await settle();
    expect(mockPick).toHaveBeenCalledWith({ type: ['application/pdf'], copyToCacheDirectory: true, multiple: false });
    expect(screen.getByText('tajwid.pdf · 1 م.ب')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(r.save));
    await settle();
    const [upload, create] = writes();
    expect(upload!.path).toBe('/api/files');
    expect([upload!.params.get('purpose'), upload!.params.get('groupClassId')]).toEqual(['EDUCATIONAL_RESOURCE', 'c1']);
    // Exactly what expo/fetch puts on the wire: field «file», the name, the declared type, the bytes
    expect(await multipartText(upload!.form)).toBe(
      '--BOUNDARY\r\ncontent-disposition: form-data; name="file"; filename="tajwid.pdf"\r\ncontent-type: application/pdf\r\n\r\n' +
        '%PDF-1.4 content of file:///cache/DocumentPicker/tajwid.pdf\r\n--BOUNDARY--\r\n',
    );
    expect(create!.body).toEqual({ title: 'أحكام التجويد', description: '', type: 'PDF', fileId: 'file-9', groupClassIds: ['c1'] });
  });

  it('the phone reports a generic type: the upload DECLARES the real one (else the server refuses FILE_TYPE_MISMATCH)', async () => {
    mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/DocumentPicker/tajwid.pdf', name: 'tajwid.pdf', mimeType: 'application/octet-stream', size: 1000 }] });
    stub((c) => {
      if (c.method === 'POST' && c.path.endsWith('/files')) return { status: 201, body: { id: 'file-9', purpose: 'EDUCATIONAL_RESOURCE', mimeType: 'application/pdf', size: 1000, originalName: 'tajwid.pdf', createdAt: '', url: '/api/files/file-9' } };
      if (c.method === 'POST') return { status: 201, body: resourceFixture('r6') };
      return undefined;
    });
    await renderScreen(<TeacherResourceFormScreen initialClassId="c1" />);
    await fireEvent.changeText(await screen.findByLabelText(r.titleLabel), 'أحكام التجويد');
    await fireEvent.press(screen.getByLabelText(r.pickFile));
    await settle();
    await fireEvent.press(screen.getByLabelText(r.save));
    await settle();
    expect(await multipartText(writes()[0]!.form)).toContain('content-type: application/pdf\r\n');
    expect(screen.getByRole('alert', { name: r.created })).toBeTruthy();
  });

  it('picker cancelled: nothing chosen, nothing sent; a file of the wrong type or too large is refused locally', async () => {
    stub();
    await renderScreen(<TeacherResourceFormScreen initialClassId="c1" />);
    await fireEvent.changeText(await screen.findByLabelText(r.titleLabel), 'صورة');
    await fireEvent.press(radio(r.type.IMAGE));
    mockPick.mockResolvedValueOnce({ canceled: true, assets: null });
    await fireEvent.press(screen.getByLabelText(r.pickFile));
    await settle();
    await fireEvent.press(screen.getByLabelText(r.save));
    expect(screen.getByRole('alert', { name: r.errors.fileRequired })).toBeTruthy();
    mockPick.mockResolvedValueOnce(picked); // a PDF for an IMAGE resource
    await fireEvent.press(screen.getByLabelText(r.pickFile));
    await settle();
    expect(screen.getByRole('alert', { name: r.errors.fileTypeMismatch })).toBeTruthy();
    mockPick.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///x.png', name: 'x.png', mimeType: 'image/png', size: 6 * 1024 * 1024 }] });
    await fireEvent.press(screen.getByLabelText(r.replaceFile));
    await settle();
    expect(screen.getByRole('alert', { name: r.errors.fileTooLarge })).toBeTruthy();
    expect(writes()).toHaveLength(0);
  });

  it('upload fails on the network: the resource is NOT created, the form keeps the title and the file', async () => {
    mockPick.mockResolvedValue(picked);
    stub((c) => (c.method === 'POST' && c.path.endsWith('/files') ? 'offline' : undefined));
    await renderScreen(<TeacherResourceFormScreen initialClassId="c1" />);
    await fireEvent.changeText(await screen.findByLabelText(r.titleLabel), 'أحكام التجويد');
    await fireEvent.press(screen.getByLabelText(r.pickFile));
    await settle();
    await fireEvent.press(screen.getByLabelText(r.save));
    await settle();
    expect(screen.getByRole('alert', { name: r.offlineSave })).toBeTruthy();
    expect(writes().map((c) => c.path)).toEqual(['/api/files']);
    expect(screen.getByLabelText(r.titleLabel).props.value).toBe('أحكام التجويد');
    expect(screen.getByText('tajwid.pdf · 1 م.ب')).toBeTruthy();
    expect(mockPreventRemove.active).toBe(true);
  });

  it('a double tap sends ONE request', async () => {
    stub();
    let release: (() => void) | undefined;
    let posts = 0;
    const base = globalThis.fetch;
    globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts++;
        await new Promise<void>((resolve) => (release = resolve));
        return { status: 201, ok: true, text: async () => JSON.stringify(linkResource('r7')) };
      }
      return (base as unknown as (u: string, i?: RequestInit) => Promise<Response>)(url, init);
    }) as unknown as typeof fetch;
    await renderScreen(<TeacherResourceFormScreen initialClassId="c1" />);
    await fireEvent.changeText(await screen.findByLabelText(r.titleLabel), 'رابط');
    await fireEvent.press(radio(r.type.EXTERNAL_LINK));
    await fireEvent.changeText(screen.getByLabelText(r.urlLabel), 'https://example.org');
    await fireEvent.press(screen.getByLabelText(r.save));
    await fireEvent.press(screen.getByLabelText(r.saving));
    await fireEvent.press(screen.getByLabelText(r.saving));
    expect(posts).toBe(1);
    await act(async () => release?.());
    await settle();
    expect(screen.getByRole('alert', { name: r.created })).toBeTruthy();
  });

  it('edit MY resource: prefilled; keeping the file sends no fileId; PATCH; the server copy is cached', async () => {
    const saved = resourceFixture('r1');
    stub((c) => (c.method === 'PATCH' ? ok({ ...saved, title: 'أحكام النون والميم' }) : undefined), saved);
    await renderScreen(<TeacherResourceFormScreen resourceId="r1" />);
    const title = await screen.findByLabelText(r.titleLabel);
    expect(title.props.value).toBe('أحكام النون الساكنة');
    expect(screen.getByText(r.keepsFile('ahkam-noun.pdf'))).toBeTruthy();
    expect(screen.getByLabelText(r.saveEdit).props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(title, 'أحكام النون والميم');
    await fireEvent.press(screen.getByLabelText(r.saveEdit));
    await settle();
    expect(writes()).toEqual([
      expect.objectContaining({
        method: 'PATCH',
        path: '/api/teacher/resources/r1',
        body: { title: 'أحكام النون والميم', description: 'ملخص مصوّر لأحكام النون الساكنة والتنوين', type: 'PDF', groupClassIds: ['c1'] },
      }),
    ]);
    expect(client.getQueryData<Resource>(resourceKey('t-me', 'r1'))!.title).toBe('أحكام النون والميم');
    expect(screen.getByRole('alert', { name: r.updated })).toBeTruthy();
  });

  it('someone else\'s resource: no edit form at all', async () => {
    stub(undefined, resourceFixture('r1', { canManage: false }));
    await renderScreen(<TeacherResourceFormScreen resourceId="r1" />);
    expect(await screen.findByText(r.notFound)).toBeTruthy();
    expect(screen.queryByLabelText(r.titleLabel)).toBeNull();
  });

  it('a server refusal (403 RESOURCE_CLASS_ACCESS_DENIED): its message, the form kept', async () => {
    stub((c) => (c.method === 'POST' ? { status: 403, body: { code: 'RESOURCE_CLASS_ACCESS_DENIED', message: 'لا يمكنك النشر إلا لأقسامك الحالية' } } : undefined));
    await renderScreen(<TeacherResourceFormScreen initialClassId="c1" />);
    await fireEvent.changeText(await screen.findByLabelText(r.titleLabel), 'رابط');
    await fireEvent.press(radio(r.type.EXTERNAL_LINK));
    await fireEvent.changeText(screen.getByLabelText(r.urlLabel), 'https://example.org');
    await fireEvent.press(screen.getByLabelText(r.save));
    await settle();
    expect(screen.getByRole('alert', { name: 'لا يمكنك النشر إلا لأقسامك الحالية' })).toBeTruthy();
    expect(screen.getByLabelText(r.urlLabel).props.value).toBe('https://example.org');
  });

  it('RTL inputs; the URL field is LTR', async () => {
    stub();
    await renderScreen(<TeacherResourceFormScreen initialClassId="c1" />);
    expect(await screen.findByLabelText(r.titleLabel)).toHaveStyle({ textAlign: 'right', writingDirection: 'rtl' });
    await fireEvent.press(radio(r.type.EXTERNAL_LINK));
    expect(screen.getByLabelText(r.urlLabel)).toHaveStyle({ textAlign: 'left', writingDirection: 'ltr' });
  });
});
