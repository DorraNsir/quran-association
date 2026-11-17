import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AlertBox, Button, TextField, type IconName } from '@/components/ui';
import { ar } from '@/i18n/ar';
import { errorMessage } from '@/services/api';
import { spacing } from '@/theme';

import { session } from './auth-provider';
import { passwordPolicyError } from './password-policy';

/**
 * «تغيير كلمة المرور» for ANY role — the forced first change and the
 * voluntary one share it. POST /api/auth/mobile/change-password
 * (currentPassword, newPassword; backend policy 8–128 characters) through
 * session.changePassword(): the answer is a NEW session (adopted at once,
 * this device stays signed in) and every other session of the account ends.
 * The passwords live only in this form's state: never logged, never stored.
 */
export function ChangePasswordForm({
  submitLabel,
  submitIcon,
  onChanged,
}: {
  submitLabel: string;
  submitIcon?: IconName;
  /** Called once the server confirmed the change (the new session is already in place) */
  onChanged?: () => void;
}) {
  const [values, setValues] = useState({ current: '', next: '', confirm: '' });
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Synchronous guard: a double tap never sends two requests
  const sending = useRef(false);

  const errors = {
    current: !values.current ? ar.auth.currentRequired : undefined,
    next: passwordPolicyError(values.next) ?? (values.next === values.current ? ar.auth.passwordSame : undefined),
    confirm: values.confirm !== values.next ? ar.auth.confirmMismatch : undefined,
  };
  const shown = (key: keyof typeof errors) => (submitted ? errors[key] : undefined);
  const set = (key: keyof typeof values) => (text: string) => setValues((v) => ({ ...v, [key]: text }));

  async function onSubmit() {
    setSubmitted(true);
    setError(null);
    if (errors.current || errors.next || errors.confirm || sending.current) return;
    sending.current = true;
    setPending(true);
    try {
      await session.changePassword(values.current, values.next);
      setValues({ current: '', next: '', confirm: '' });
      setSubmitted(false);
      onChanged?.();
    } catch (e) {
      // e.g. WRONG_CURRENT_PASSWORD, too many attempts, offline: the server's Arabic message
      setError(errorMessage(e));
      // The current password is asked again; the new one stays typed
      setValues((v) => ({ ...v, current: '' }));
      setSubmitted(false);
    } finally {
      sending.current = false;
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
    <View style={styles.form}>
      {field('current', ar.auth.currentPassword, true)}
      {field('next', ar.auth.newPassword)}
      {field('confirm', ar.auth.confirmPassword)}
      {error ? <AlertBox message={error} /> : null}
      <Button label={submitLabel} icon={submitIcon} loading={pending} fullWidth onPress={() => void onSubmit()} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg },
});
