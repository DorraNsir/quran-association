import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ar } from '@/i18n/ar';
import { lightColors } from '@/theme/colors';

import { AccountScreen } from './account-screen';
import { AccountChangePasswordScreen } from './change-password-screen';
import type { SessionUser } from './types';

const mockPush = jest.fn();
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useNavigation: () => ({ isFocused: () => true }),
}));
const mockUser: SessionUser = {
  id: 'u1',
  username: 'hamdichouk',
  person: { id: 'p1', firstName: 'حمدي', lastName: 'الشوك', photoUrl: null, email: null, phone: null },
  roles: ['TEACHER'],
  mustChangePassword: false,
  teacherId: 't-me',
  studentId: null,
};
const mockLogout = jest.fn();
jest.mock('./auth-provider', () => ({
  useSession: () => ({ status: 'signedIn', user: mockUser, endedReason: null, restoreError: null }),
  session: { logout: () => mockLogout(), changePassword: jest.fn() },
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
    {children}
  </SafeAreaProvider>
);
const flat = (node: { props: Record<string, unknown> }) => StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;

beforeEach(() => {
  mockPush.mockReset();
  mockLogout.mockReset();
});

describe('«حسابي» actions', () => {
  it('«تغيير كلمة المرور» is a GREEN row, «تسجيل الخروج» a RED one (soft background, dark text, border)', async () => {
    await render(<AccountScreen workspace="teacher" passwordHref="/teacher/password" />, { wrapper });
    const green = screen.getByTestId('account-action-brand');
    const red = screen.getByTestId('account-action-danger');
    expect(green.props.accessibilityLabel).toBe(ar.auth.changePasswordTitle);
    expect(red.props.accessibilityLabel).toBe(ar.auth.logout);
    expect(flat(green)).toMatchObject({ backgroundColor: lightColors.brandSoft, borderColor: lightColors.primary });
    expect(flat(red)).toMatchObject({ backgroundColor: lightColors.destructiveSoft, borderColor: lightColors.destructive });
    expect(StyleSheet.flatten(screen.getByText(ar.auth.logout).props.style).color).toBe(lightColors.destructiveSoftForeground);
  });

  it('the green row opens the password screen; the red one asks first, then logs out', async () => {
    await render(<AccountScreen workspace="teacher" passwordHref="/teacher/password" />, { wrapper });
    await fireEvent.press(screen.getByLabelText(ar.auth.changePasswordTitle));
    expect(mockPush).toHaveBeenCalledWith('/teacher/password');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === 'destructive')?.onPress?.());
    await fireEvent.press(screen.getByLabelText(ar.auth.logout));
    expect(alert).toHaveBeenCalledWith(ar.auth.logoutConfirmTitle, ar.auth.logoutConfirmMessage, expect.any(Array));
    expect(mockLogout).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });

  it('without a password route (a role that has none yet), no password row', async () => {
    await render(<AccountScreen workspace="teacher" />, { wrapper });
    expect(screen.queryByTestId('account-action-brand')).toBeNull();
    expect(screen.getByTestId('account-action-danger')).toBeTruthy();
  });
});

describe('«تغيير كلمة المرور» screen', () => {
  it('the card is centred vertically (grows and centres in the scroll area), with its title and subtitle', async () => {
    await render(<AccountChangePasswordScreen fallback="/teacher/account" />, { wrapper });
    expect(flat(screen.getByTestId('password-centered'))).toMatchObject({ flexGrow: 1, justifyContent: 'center' });
    expect(screen.getByRole('header', { name: ar.auth.changePasswordTitle })).toBeTruthy();
    expect(screen.getByText(ar.auth.changePasswordSubtitle)).toBeTruthy();
    expect(screen.getByLabelText(ar.auth.saveChanges)).toBeTruthy();
  });
});
