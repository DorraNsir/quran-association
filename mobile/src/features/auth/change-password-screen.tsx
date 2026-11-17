import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { AppText, Card, Icon, Screen, SuccessToast } from '@/components/ui';
import { useConfirmThenBack } from '@/features/teacher/use-confirm-then-back';
import { ar } from '@/i18n/ar';
import { radius, spacing, useAppTheme } from '@/theme';

import { ChangePasswordForm } from './change-password-form';

/**
 * Voluntary «تغيير كلمة المرور» from «حسابي» (any role's account screen can
 * open it). Same endpoint and rules as the forced change; on success this
 * device keeps a NEW session (other devices are signed out), a confirmation
 * shows, then the account screen comes back. The card is centred vertically
 * and still scrolls above the keyboard.
 */
export function AccountChangePasswordScreen({ fallback }: { fallback: Parameters<typeof useConfirmThenBack>[0] }) {
  const { colors } = useAppTheme();
  const { confirmation, confirm } = useConfirmThenBack(fallback);
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={styles.center} testID="password-centered">
          <Card style={styles.card}>
            <View style={styles.head}>
              <View style={[styles.tile, { backgroundColor: colors.brandSoft }]}>
                <Icon name="lock" size={30} color={colors.primary} />
              </View>
              <AppText variant="heading" center accessibilityRole="header">
                {ar.auth.changePasswordTitle}
              </AppText>
              <AppText variant="small" tone="muted" center>
                {ar.auth.changePasswordSubtitle}
              </AppText>
            </View>
            {confirmation ? (
              <SuccessToast message={confirmation} />
            ) : (
              <ChangePasswordForm submitLabel={ar.auth.saveChanges} submitIcon="success" onChanged={() => confirm(ar.auth.passwordChanged)} />
            )}
            <AppText variant="small" tone="muted" center>
              {ar.auth.changePasswordHint}
            </AppText>
          </Card>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flexGrow: 1, justifyContent: 'center' },
  card: { gap: spacing.lg, padding: spacing.xl },
  head: { alignItems: 'center', gap: spacing.sm },
  tile: { width: 64, height: 64, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center' },
});
