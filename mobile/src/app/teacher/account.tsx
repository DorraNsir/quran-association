import { AccountScreen } from '@/features/auth/account-screen';

export default function TeacherAccountRoute() {
  return <AccountScreen workspace="teacher" passwordHref="/teacher/password" photoRole="teacher" />;
}
