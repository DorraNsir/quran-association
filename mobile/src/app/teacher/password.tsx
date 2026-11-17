import { AccountChangePasswordScreen } from '@/features/auth/change-password-screen';

export default function TeacherChangePasswordRoute() {
  return <AccountChangePasswordScreen fallback="/teacher/account" />;
}
