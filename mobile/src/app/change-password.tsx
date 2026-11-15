import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';

import { AlertBox, AppText, Button, Card, Screen, TextField } from '@/components/ui';
import { session } from '@/features/auth/auth-provider';
import { passwordPolicyError } from '@/features/auth/password-policy';
import { ar } from '@/i18n/ar';
import { errorMessage } from '@/services/api';
import { spacing } from '@/theme';

/**
 * Forced password change (mustChangePassword): the only screen reachable
 * until it succeeds — the backend enforces the same rule (403
 * PASSWORD_CHANGE_REQUIRED). POST /api/auth/mobile/change-password returns a
 * new session; every other session of the account is ended.
 */
export default function ChangePasswordScreen() {
  const [values, setValues] = useState({ current: '', next: '', confirm: '' });
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errors = {
    current: !values.current ? ar.auth.currentRequired : undefined,
    next:
      passwordPolicyError(values.next) ??
      (values.next === values.current ? ar.auth.passwordSame : undefined),
    confirm: values.confirm !== values.next ? ar.auth.confirmMismatch : undefined,
  };
  const shown = (key: keyof typeof errors) => (submitted ? errors[key] : undefined);
  const set = (key: keyof typeof values) => (text: string) =>
    setValues((v) => ({ ...v, [key]: text }));

  async function onSubmit() {
    setSubmitted(true);
    setError(null);
    if (errors.current || errors.next || errors.confirm || pending) return;
    setPending(true);
    try {
      await session.changePassword(values.current, values.next);
      // mustChangePassword is now false: the navigator opens the workspace
    } catch (e) {
      setError(errorMessage(e));
      setValues((v) => ({ ...v, current: '' }));
      setSubmitted(false);
    } finally {
      setPending(false);
    }
  }

  const field = (key: keyof typeof values, label: string, current = false) => (
    <TextField
      label={label}
      icon="key"
      secret
      value={values[key]}
      onChangeText={set(key)}
      error={shown(key)}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete={current ? 'current-password' : 'new-password'}
      textContentType={current ? 'password' : 'newPassword'}
      editable={!pending}
    />
  );

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Card style={styles.card}>
          <AlertBox tone="info" message={ar.auth.changePasswordForced} />
          {field('current', ar.auth.currentPassword, true)}
          {field('next', ar.auth.newPassword)}
          {field('confirm', ar.auth.confirmPassword)}
          {error ? <AlertBox message={error} /> : null}
          <Button
            label={ar.auth.savePassword}
            loading={pending}
            fullWidth
            onPress={() => void onSubmit()}
          />
        </Card>
        <Button
          variant="ghost"
          icon="logout"
          label={ar.auth.logout}
          onPress={() => void session.logout()}
        />
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
