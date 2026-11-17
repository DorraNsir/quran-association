import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ar } from '@/i18n/ar';
import { ApiError } from '@/services/api';

import { mobileChangePassword } from './auth.api';
import { ChangePasswordForm } from './change-password-form';

/*
 * «تغيير كلمة المرور» (shared by the forced and the voluntary change). The
 * session is replaced (session.changePassword is unit-tested in
 * session.test.ts: the NEW session is adopted); the network is stubbed.
 */
const mockChange = jest.fn();
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('./auth-provider', () => ({
  session: { changePassword: (...a: unknown[]) => mockChange(...a) },
}));

const a = ar.auth;
async function renderForm(onChanged = jest.fn()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      {children}
    </SafeAreaProvider>
  );
  await render(<ChangePasswordForm submitLabel={a.saveChanges} onChanged={onChanged} />, { wrapper });
  return { onChanged };
}
const type = async (label: string, value: string) => fireEvent.changeText(screen.getByLabelText(label), value);
const fill = async (current: string, next: string, confirm = next) => {
  await type(a.currentPassword, current);
  await type(a.newPassword, next);
  await type(a.confirmPassword, confirm);
};
const save = () => fireEvent.press(screen.getByLabelText(a.saveChanges));

beforeEach(() => mockChange.mockReset());

describe('validation before sending (backend policy 8–128)', () => {
  it('current password required; new one too short; nothing sent', async () => {
    await renderForm();
    await fill('', 'short');
    await save();
    expect(screen.getByText(a.currentRequired)).toBeTruthy();
    expect(screen.getByText(a.passwordTooShort)).toBeTruthy();
    expect(mockChange).not.toHaveBeenCalled();
  });

  it('the confirmation must match; the new one must differ from the current one', async () => {
    await renderForm();
    await fill('old-password-1', 'new-password-1', 'new-password-2');
    await save();
    expect(screen.getByText(a.confirmMismatch)).toBeTruthy();
    await fill('same-password-1', 'same-password-1');
    await save();
    expect(screen.getByText(a.passwordSame)).toBeTruthy();
    expect(mockChange).not.toHaveBeenCalled();
  });

  it('password fields are secure (masked)', async () => {
    await renderForm();
    for (const label of [a.currentPassword, a.newPassword, a.confirmPassword])
      expect(screen.getByLabelText(label).props.secureTextEntry).toBe(true);
  });
});

describe('saving', () => {
  it('success: the current and new passwords go to the session; the form is cleared; onChanged', async () => {
    mockChange.mockResolvedValue(undefined);
    const { onChanged } = await renderForm();
    await fill('old-password-1', 'new-password-1');
    await save();
    await act(async () => undefined);
    expect(mockChange).toHaveBeenCalledWith('old-password-1', 'new-password-1');
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(a.newPassword).props.value).toBe('');
  });

  it('wrong current password: the server message, the current field cleared, the new one kept, no onChanged', async () => {
    mockChange.mockRejectedValue(new ApiError(400, 'WRONG_CURRENT_PASSWORD', 'كلمة المرور الحالية غير صحيحة'));
    const { onChanged } = await renderForm();
    await fill('wrong-password', 'new-password-1');
    await save();
    await act(async () => undefined);
    expect(screen.getByRole('alert', { name: 'كلمة المرور الحالية غير صحيحة' })).toBeTruthy();
    expect(screen.getByLabelText(a.currentPassword).props.value).toBe('');
    expect(screen.getByLabelText(a.newPassword).props.value).toBe('new-password-1');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('a double tap sends ONE request', async () => {
    let finish!: () => void;
    mockChange.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
    await renderForm();
    await fill('old-password-1', 'new-password-1');
    await save();
    await save();
    expect(mockChange).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });
});

describe('endpoint and payload (no new endpoint)', () => {
  it('POST /api/auth/mobile/change-password with { currentPassword, newPassword }', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return { status: 200, ok: true, text: async () => JSON.stringify({}) };
    }) as unknown as typeof fetch;
    await mobileChangePassword('old-password-1', 'new-password-1');
    expect(calls[0]!.url).toMatch(/\/api\/auth\/mobile\/change-password$/);
    expect(calls[0]!.init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ currentPassword: 'old-password-1', newPassword: 'new-password-1' });
  });
});
