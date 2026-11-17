import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';

import { AlertBox, AppText, Button, Card, Screen } from '@/components/ui';
import { session } from '@/features/auth/auth-provider';
import { ChangePasswordForm } from '@/features/auth/change-password-form';
import { ar } from '@/i18n/ar';
import { spacing } from '@/theme';

/**
 * Forced password change (mustChangePassword): the only screen reachable
 * until it succeeds — the backend enforces the same rule (403
 * PASSWORD_CHANGE_REQUIRED). POST /api/auth/mobile/change-password returns a
 * new session; every other session of the account is ended. Once it
 * succeeds mustChangePassword is false and the navigator opens the workspace.
 */
export default function ChangePasswordScreen() {
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Card style={styles.card}>
          <AlertBox tone="info" message={ar.auth.changePasswordForced} />
          <ChangePasswordForm submitLabel={ar.auth.savePassword} />
        </Card>
        <Button variant="ghost" icon="logout" label={ar.auth.logout} onPress={() => void session.logout()} />
        <AppText variant="caption" tone="muted" center>
          {ar.auth.accountsNote}
        </AppText>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  card: { gap: spacing.lg, padding: spacing.xl },
});
