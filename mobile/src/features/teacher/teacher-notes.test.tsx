import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { SessionUser } from '@/features/auth/types';
import { ar } from '@/i18n/ar';

import { noteFixture, notesFixture, notesPage } from './__fixtures__/notes';
import { TeacherNoteScreen } from './teacher-note';
import { TeacherNoteFormScreen } from './teacher-note-form';
import { TeacherNotesScreen } from './teacher-notes';
import type { TeacherNote } from './types';
import { CONFIRMATION_MS } from './use-confirm-then-back';
import { notesKey } from './use-notes';

/*
 * «ملاحظاتي» screens against stubbed HTTP answers shaped like the
 * /teacher/notes DTOs (test-only fixtures). Only native modules, navigation
 * and the network are replaced.
 */
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockNav = { canGoBack: true, focused: true };
let mockPreventRemove: { active: boolean } = { active: false };
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace, canGoBack: () => mockNav.canGoBack }),
  useNavigation: () => ({ isFocused: () => mockNav.focused }),
  Stack: { Screen: () => null },
  // As expo-router's: returns a function that lifts the prevention at once
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
type Call = { method: string; url: string; body?: unknown };
const calls: Call[] = [];
let answer: (call: Call) => Answer;

/** GET list answered from `notes` (one page unless `pages` given); writes answered by `write`. */
function stub({
  notes = notesFixture(),
  list,
  write = () => ({ status: 500, body: {} }),
}: { notes?: TeacherNote[]; list?: (call: Call) => Answer; write?: (call: Call) => Answer } = {}) {
  calls.length = 0;
  answer = (call) => {
    if (call.url.includes('/platform-preferences'))
      return {
        status: 200,
        body: { timezone: 'Africa/Tunis', dateFormat: 'DD/MM/YYYY', defaultCalendarView: 'week', defaultPageSize: 20, currentAcademicYear: null },
      };
    if (call.method === 'GET' && call.url.includes('/teacher/notes')) return list ? list(call) : { status: 200, body: notesPage(notes) };
    return write(call);
  };
  globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const call: Call = { method: init?.method ?? 'GET', url, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const a = answer(call);
    if (a === 'offline') throw new TypeError('Network request failed');
    if (a === 'pending')
      return new Promise((_, reject) =>
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))),
      );
    return {
      status: a.status,
      ok: a.status >= 200 && a.status < 300,
      text: async () => (a.body === undefined ? '' : JSON.stringify(a.body)),
    };
  }) as unknown as typeof fetch;
}
const writes = () => calls.filter((c) => c.method !== 'GET');
const listCalls = () => calls.filter((c) => c.method === 'GET' && c.url.includes('/teacher/notes'));

const clients: QueryClient[] = [];
let client: QueryClient;
function renderScreen(ui: React.ReactElement) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
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
  mockNav.canGoBack = true;
  mockNav.focused = true;
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

const n = ar.notes;
const field = () => screen.getByLabelText(n.field);
const saveButton = () => screen.getByRole('button', { name: n.save });

describe('«ملاحظاتي» list', () => {
  it('shows MY notes from the API, most recently updated first, with their platform dates', async () => {
    stub();
    await renderScreen(<TeacherNotesScreen />);
    expect(await screen.findByText(n.count(2))).toBeTruthy();
    expect(screen.getByText(n.privateNotice)).toBeTruthy();
    const rows = screen.getAllByRole('button').filter((b) => /^(آخر تعديل|\d)/.test(String(b.props.accessibilityLabel)));
    expect(rows.map((r) => r.props.accessibilityLabel)).toEqual([
      expect.stringContaining('مراجعة سورة الملك'),
      expect.stringContaining('تذكير'),
    ]);
    // Edited note: its last update, in Tunis time (13:05Z → 14:05)
    expect(screen.getByText(`${n.updated}: 15 نوفمبر 2026 · ⁦14:05⁩`)).toBeTruthy();
    expect(screen.getByText('12 نوفمبر 2026 · ⁦10:30⁩')).toBeTruthy();
    // Only the teacher-scoped endpoint: the server decides whose notes these are
    expect(listCalls()[0]!.url).toMatch(/\/teacher\/notes\?page=1&pageSize=100$/);
  });

  it('loads EVERY page, so the search covers all my notes', async () => {
    const first = [noteFixture('p1', 'الصفحة الأولى', '2026-11-14T08:00:00.000Z')];
    const second = [noteFixture('p2', 'ملاحظة في الصفحة الثانية', '2026-11-01T08:00:00.000Z')];
    stub({ list: (c) => ({ status: 200, body: c.url.includes('page=2') ? notesPage(second, 2, 2) : notesPage(first, 1, 2) }) });
    await renderScreen(<TeacherNotesScreen />);
    expect(await screen.findByText(n.count(2))).toBeTruthy();
    expect(listCalls().map((c) => new URL(c.url).searchParams.get('page'))).toEqual(['1', '2']);
    await fireEvent.changeText(screen.getByLabelText(n.searchLabel), 'الثانيه');
    expect(screen.getByText(n.matches(1, 2))).toBeTruthy();
    expect(screen.getByText('ملاحظة في الصفحة الثانية')).toBeTruthy();
    expect(screen.queryByText('الصفحة الأولى')).toBeNull();
  });

  it('search without a match, then cleared', async () => {
    stub();
    await renderScreen(<TeacherNotesScreen />);
    await fireEvent.changeText(await screen.findByLabelText(n.searchLabel), 'لا شيء هنا');
    expect(screen.getByText(n.noMatch)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(n.clearSearch));
    expect(screen.getByText(n.count(2))).toBeTruthy();
  });

  it('opening a note and adding one navigate through the stack', async () => {
    stub();
    await renderScreen(<TeacherNotesScreen />);
    await fireEvent.press(await screen.findByLabelText(/مراجعة سورة الملك/));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teacher/notes/[id]', params: { id: 'n2' } });
    await fireEvent.press(screen.getByLabelText(n.add));
    expect(mockPush).toHaveBeenLastCalledWith('/teacher/notes/new');
  });

  it('empty notebook: invitation to write, still able to add', async () => {
    stub({ notes: [] });
    await renderScreen(<TeacherNotesScreen />);
    expect(await screen.findByText(n.empty)).toBeTruthy();
    expect(screen.getByText(n.emptyHint)).toBeTruthy();
    expect(screen.getByLabelText(n.add)).toBeTruthy();
    expect(screen.queryByLabelText(n.searchLabel)).toBeNull();
  });

  it('loading state', async () => {
    stub({ list: () => 'pending' });
    await renderScreen(<TeacherNotesScreen />);
    expect(await screen.findByLabelText(ar.states.loading)).toBeTruthy();
  });

  it('offline: message and a working retry', async () => {
    let online = false;
    stub({ list: () => (online ? { status: 200, body: notesPage(notesFixture()) } : 'offline') });
    await renderScreen(<TeacherNotesScreen />);
    expect(await screen.findByText(ar.states.offlineTitle)).toBeTruthy();
    expect(screen.queryByLabelText(n.add)).toBeNull();
    online = true;
    await fireEvent.press(screen.getByLabelText(ar.states.retry));
    await settle(50);
    expect(screen.getByText(n.count(2))).toBeTruthy();
  });

  it('403 (inactive teacher profile): the API message, no retry, no add', async () => {
    stub({ list: () => ({ status: 403, body: { code: 'TEACHER_INACTIVE', message: 'ملف المعلم غير نشط' } }) });
    await renderScreen(<TeacherNotesScreen />);
    expect(await screen.findByText(ar.states.forbiddenTitle)).toBeTruthy();
    expect(screen.getByText('ملف المعلم غير نشط')).toBeTruthy();
    expect(screen.queryByLabelText(ar.states.retry)).toBeNull();
    expect(screen.queryByLabelText(n.add)).toBeNull();
  });
});

describe('note details', () => {
  it('the full text (line breaks kept, readable line height) and both dates', async () => {
    stub();
    await renderScreen(<TeacherNoteScreen noteId="n1" />);
    const content = await screen.findByText('تذكير: إحضار المصاحف الجديدة.\nوالتنسيق مع الإدارة بشأن القاعة 2');
    expect(StyleSheet.flatten(content.props.style).lineHeight).toBe(28);
    expect(screen.getByText(`${n.created}: 12 نوفمبر 2026 · ⁦10:30⁩`)).toBeTruthy();
    expect(screen.queryByText(new RegExp(`^${n.updated}`))).toBeNull(); // never edited
    await fireEvent.press(screen.getByLabelText(n.edit));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teacher/notes/[id]/edit', params: { id: 'n1' } });
  });

  it('an id that is not in MY list (another teacher\'s, or deleted): «غير موجودة», no actions', async () => {
    stub();
    await renderScreen(<TeacherNoteScreen noteId="someone-elses-note" />);
    expect(await screen.findByText(n.notFound)).toBeTruthy();
    expect(screen.queryByLabelText(n.edit)).toBeNull();
    expect(screen.queryByLabelText(n.delete)).toBeNull();
    await fireEvent.press(screen.getByLabelText(n.backToList));
    expect(mockReplace).toHaveBeenCalledWith('/teacher/notes');
  });

  it('offline: error state with retry', async () => {
    stub({ list: () => 'offline' });
    await renderScreen(<TeacherNoteScreen noteId="n1" />);
    expect(await screen.findByText(ar.states.offlineTitle)).toBeTruthy();
  });
});

describe('deleting a note', () => {
  /** Press «حذف» and answer the native confirmation with the given button. */
  async function pressDelete(choice: 'cancel' | 'confirm') {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      const button = buttons?.find((b) => (choice === 'cancel' ? b.style === 'cancel' : b.style === 'destructive'));
      button?.onPress?.();
    });
    await fireEvent.press(screen.getByLabelText(n.delete));
    await settle();
    return alert;
  }

  it('asks first, naming the note; cancelling sends nothing', async () => {
    stub();
    await renderScreen(<TeacherNoteScreen noteId="n1" />);
    await screen.findByLabelText(n.delete);
    const alert = await pressDelete('cancel');
    expect(alert).toHaveBeenCalledWith(
      n.deleteTitle,
      n.deleteMessage('تذكير: إحضار المصاحف الجديدة. والتنسيق مع الإدارة بشأن القاعة 2'),
      expect.any(Array),
    );
    expect(writes()).toHaveLength(0);
    expect(screen.getByText(/تذكير: إحضار المصاحف/)).toBeTruthy();
    alert.mockRestore();
  });

  it('confirmed: DELETE, removed from my list only after the server confirmed, then back to the list', async () => {
    let deleted = false;
    stub({
      list: () => ({ status: 200, body: notesPage(deleted ? notesFixture().filter((x) => x.id !== 'n1') : notesFixture()) }),
      write: (c) => {
        deleted = true;
        return c.method === 'DELETE' ? { status: 204 } : { status: 500, body: {} };
      },
    });
    await renderScreen(<TeacherNoteScreen noteId="n1" />);
    await screen.findByLabelText(n.delete);
    const before = listCalls().length;
    const alert = await pressDelete('confirm');
    expect(writes()).toEqual([expect.objectContaining({ method: 'DELETE', url: expect.stringMatching(/\/teacher\/notes\/n1$/) })]);
    expect(await screen.findByRole('alert', { name: n.deleted_ok })).toBeTruthy();
    // The list cache no longer has it, and the list was refetched from the server
    expect(client.getQueryData<TeacherNote[]>(notesKey('t-me'))!.map((x) => x.id)).toEqual(['n2']);
    expect(listCalls().length).toBeGreaterThan(before);
    await settle(CONFIRMATION_MS + 50);
    expect(mockBack).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });

  it('failure (offline): nothing removed, the note stays with an error, no navigation', async () => {
    stub({ write: () => 'offline' });
    await renderScreen(<TeacherNoteScreen noteId="n1" />);
    await screen.findByLabelText(n.delete);
    const alert = await pressDelete('confirm');
    expect(screen.getByRole('alert', { name: n.offlineDelete })).toBeTruthy();
    expect(screen.getByText(/تذكير: إحضار المصاحف/)).toBeTruthy();
    expect(client.getQueryData<TeacherNote[]>(notesKey('t-me'))).toHaveLength(2);
    await settle(CONFIRMATION_MS + 50);
    expect(mockBack).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});

describe('writing a note', () => {
  it('validation: empty (or only spaces) is refused locally, nothing sent', async () => {
    stub();
    await renderScreen(<TeacherNoteFormScreen />);
    await fireEvent.changeText(field(), '   ');
    await fireEvent.press(saveButton());
    expect(screen.getByText(n.required)).toBeTruthy();
    expect(writes()).toHaveLength(0);
  });

  it('validation: over 2000 characters is explained and not sent', async () => {
    stub();
    await renderScreen(<TeacherNoteFormScreen />);
    await fireEvent.changeText(field(), 'ا'.repeat(2001));
    expect(screen.getByText(n.tooLong)).toBeTruthy();
    expect(screen.getByText(n.length(2001, 2000))).toBeTruthy();
    await fireEvent.press(saveButton());
    expect(writes()).toHaveLength(0);
  });

  it('create: POST with the trimmed text only, confirmation, list refreshed, then back', async () => {
    const created = noteFixture('n3', 'ملاحظة جديدة', '2026-11-16T10:00:00.000Z');
    let saved = false;
    stub({
      list: () => ({ status: 200, body: notesPage(saved ? [created, ...notesFixture()] : notesFixture()) }),
      write: () => {
        saved = true;
        return { status: 201, body: created };
      },
    });
    await renderScreen(<TeacherNoteFormScreen />);
    await fireEvent.changeText(field(), '  ملاحظة جديدة  ');
    expect(mockPreventRemove.active).toBe(true); // unsaved text blocks leaving
    await fireEvent.press(saveButton());
    await settle();
    expect(writes()).toEqual([{ method: 'POST', url: expect.stringMatching(/\/teacher\/notes$/), body: { content: 'ملاحظة جديدة' } }]);
    expect(screen.getByRole('alert', { name: n.created_ok })).toBeTruthy();
    expect(mockPreventRemove.active).toBe(false);
    // The list was refetched from the server after the confirmed write
    expect(listCalls()).toHaveLength(2);
    expect(client.getQueryData<TeacherNote[]>(notesKey('t-me'))!.map((x) => x.id)).toEqual(['n3', 'n2', 'n1']);
    expect(mockBack).not.toHaveBeenCalled();
    await settle(CONFIRMATION_MS + 50);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('a double tap sends ONE request', async () => {
    let release: (() => void) | undefined;
    let posts = 0;
    stub({
      write: () => ({ status: 201, body: noteFixture('n3', 'نص', '2026-11-16T10:00:00.000Z') }),
    });
    const original = globalThis.fetch;
    globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts++;
        await new Promise<void>((resolve) => (release = resolve));
      }
      return (original as unknown as (u: string, i?: RequestInit) => Promise<Response>)(url, init);
    }) as unknown as typeof fetch;
    await renderScreen(<TeacherNoteFormScreen />);
    await fireEvent.changeText(field(), 'نص');
    await fireEvent.press(saveButton());
    await fireEvent.press(screen.getByRole('button', { name: n.saving }));
    await fireEvent.press(screen.getByRole('button', { name: n.saving }));
    await settle();
    expect(posts).toBe(1);
    await act(async () => release?.());
    await settle();
    expect(posts).toBe(1);
    expect(screen.getByRole('alert', { name: n.created_ok })).toBeTruthy();
  });

  it('offline: nothing saved, the text stays, no navigation; saving again works', async () => {
    let online = false;
    stub({ write: () => (online ? { status: 201, body: noteFixture('n3', 'لا تضع', '2026-11-16T10:00:00.000Z') } : 'offline') });
    await renderScreen(<TeacherNoteFormScreen />);
    await fireEvent.changeText(field(), 'لا تضع');
    await fireEvent.press(saveButton());
    await settle();
    expect(screen.getByRole('alert', { name: n.offlineSave })).toBeTruthy();
    expect(field().props.value).toBe('لا تضع');
    expect(mockPreventRemove.active).toBe(true);
    await settle(CONFIRMATION_MS + 50);
    expect(mockBack).not.toHaveBeenCalled();
    online = true;
    await fireEvent.press(saveButton());
    await settle();
    expect(screen.getByRole('alert', { name: n.created_ok })).toBeTruthy();
  });

  it('400 from the server: its own message is shown, the text stays', async () => {
    stub({ write: () => ({ status: 400, body: { statusCode: 400, message: ['نص الملاحظة مطلوب'], error: 'Bad Request' } }) });
    await renderScreen(<TeacherNoteFormScreen />);
    await fireEvent.changeText(field(), 'نص');
    await fireEvent.press(saveButton());
    await settle();
    expect(screen.getByRole('alert', { name: /نص الملاحظة مطلوب/ })).toBeTruthy();
    expect(field().props.value).toBe('نص');
  });

  it('edit: prefilled with MY note, unchanged text cannot be saved, PATCH sends the new text', async () => {
    const updated = { ...notesFixture()[1]!, content: 'نص معدّل', updatedAt: '2026-11-16T11:00:00.000Z' };
    let saved = false;
    stub({
      list: () => ({ status: 200, body: notesPage(saved ? [updated, notesFixture()[0]!] : notesFixture()) }),
      write: () => {
        saved = true;
        return { status: 200, body: updated };
      },
    });
    await renderScreen(<TeacherNoteFormScreen noteId="n1" />);
    expect((await screen.findByLabelText(n.field)).props.value).toBe(notesFixture()[1]!.content);
    expect(saveButton().props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(field(), 'نص معدّل');
    await fireEvent.press(saveButton());
    await settle();
    expect(writes()).toEqual([{ method: 'PATCH', url: expect.stringMatching(/\/teacher\/notes\/n1$/), body: { content: 'نص معدّل' } }]);
    expect(screen.getByRole('alert', { name: n.updated_ok })).toBeTruthy();
    // The server's note is in the list, first (most recently updated)
    expect(client.getQueryData<TeacherNote[]>(notesKey('t-me'))![0]).toEqual(updated);
  });

  it('edit of a note deleted meanwhile (404): explained, the text stays', async () => {
    stub({ write: () => ({ status: 404, body: { code: 'TEACHER_NOTE_NOT_FOUND', message: 'الملاحظة غير موجودة' } }) });
    await renderScreen(<TeacherNoteFormScreen noteId="n1" />);
    await fireEvent.changeText(await screen.findByLabelText(n.field), 'محاولة');
    await fireEvent.press(saveButton());
    await settle();
    expect(screen.getByRole('alert', { name: n.goneOnSave })).toBeTruthy();
    expect(field().props.value).toBe('محاولة');
  });

  it('editing an id that is not in MY list: «غير موجودة», no form', async () => {
    stub();
    await renderScreen(<TeacherNoteFormScreen noteId="someone-elses-note" />);
    expect(await screen.findByText(n.notFound)).toBeTruthy();
    expect(screen.queryByLabelText(n.field)).toBeNull();
  });

  it('RTL text input: right-aligned, RTL writing direction', async () => {
    stub();
    await renderScreen(<TeacherNoteFormScreen />);
    expect(field()).toHaveStyle({ textAlign: 'right', writingDirection: 'rtl' });
  });
});
