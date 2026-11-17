import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';

import { AppText, Card, Screen, SuccessToast } from '@/components/ui';
import { useConfirmThenBack } from '@/features/teacher/use-confirm-then-back';
import { ar } from '@/i18n/ar';
import { spacing } from '@/theme';

import { ChangePasswordForm } from './change-password-form';

/**
 * Voluntary «تغيير كلمة المرور» from «حسابي» (any role's account screen can
 * open it). Same endpoint and rules as the forced change; on success this
 * device keeps a NEW session (other devices are signed out), a confirmation
 * shows, then the account screen comes back.
 */
export function AccountChangePasswordScreen({ fallback }: { fallback: Parameters<typeof useConfirmThenBack>[0] }) {
  const { confirmation, confirm } = useConfirmThenBack(fallback);
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Card style={styles.card}>
          <AppText variant="small" tone="muted">
            {ar.auth.changePasswordHint}
          </AppText>
          {confirmation ? (
            <SuccessToast message={confirmation} />
          ) : (
            <ChangePasswordForm submitLabel={ar.auth.saveChanges} onChanged={() => confirm(ar.auth.passwordChanged)} />
          )}
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  card: { gap: spacing.lg, padding: spacing.xl },
});
