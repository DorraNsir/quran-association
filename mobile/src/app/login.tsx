import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type TextInputInstance,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HERO_BASE, HeroBackground } from '@/components/hero-background';
import { AlertBox, AppText, Button, Card, LogoMark, TextField } from '@/components/ui';
import { session, useSession } from '@/features/auth/auth-provider';
import { useHeroTheme } from '@/features/auth/hero-theme';
import { ar } from '@/i18n/ar';
import { errorMessage } from '@/services/api';
import { radius, spacing } from '@/theme';

/** The web login page's gold accent (frontend login-form.tsx). */
const GOLD = '#e8cf98';

/**
 * تسجيل الدخول — accounts are created by the administration (no sign-up).
 * POST /api/auth/mobile/login; on success the root navigator switches to the
 * forced password change or the user's workspace.
 */
export default function LoginScreen() {
  const { endedReason } = useSession();
  // «مظهر واجهة الصفحة الرئيسية»: the website's chosen background (public setting), as on the web login
  const heroTheme = useHeroTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInputInstance>(null);

  const errors = {
    username: !username.trim() ? ar.auth.usernameRequired : undefined,
    password: !password ? ar.auth.passwordRequired : undefined,
  };
  const shown = (key: keyof typeof errors) => (submitted ? errors[key] : undefined);

  async function onSubmit() {
    setSubmitted(true);
    setError(null);
    if (errors.username || errors.password || pending) return;
    setPending(true);
    try {
      await session.login(username.trim(), password);
      // The root navigator takes over once the session is signed in
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      // Never keep the password in memory after an attempt
      setPassword('');
      setSubmitted(false);
      setPending(false);
    }
  }

  const notice =
    endedReason === 'inactive'
      ? ar.auth.inactiveNotice
      : endedReason === 'expired'
        ? ar.auth.expiredNotice
        : null;

  return (
    <View style={[styles.root, { backgroundColor: HERO_BASE }]}>
      <HeroBackground theme={heroTheme} />
      {/* a subtle shade: the texts and the form stay readable whatever the theme */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.shade]} testID="login-shade" />
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.root}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <View style={styles.logoBox}>
                <LogoMark size={72} />
              </View>
              <AppText variant="title" center style={styles.white}>
                {ar.auth.loginTitle}
              </AppText>
              <AppText variant="caption" center style={styles.whiteMuted}>
                {ar.appFullName}
              </AppText>
              <AppText variant="body" center style={{ color: GOLD }}>
                {ar.auth.hadith}
              </AppText>
            </View>

            <Card style={styles.card}>
              {notice ? <AlertBox tone="info" message={notice} /> : null}
              <TextField
                label={ar.auth.username}
                icon="user"
                value={username}
                onChangeText={setUsername}
                error={shown('username')}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                textContentType="username"
                importantForAutofill="yes"
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => passwordRef.current?.focus()}
                editable={!pending}
              />
              <TextField
                ref={passwordRef}
                label={ar.auth.password}
                icon="lock"
                secret
                value={password}
                onChangeText={setPassword}
                error={shown('password')}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={() => void onSubmit()}
                editable={!pending}
              />
              {error ? <AlertBox message={error} /> : null}
              <Button
                label={ar.auth.submit}
                icon="login"
                loading={pending}
                fullWidth
                onPress={() => void onSubmit()}
              />
            </Card>

            <AppText variant="caption" center style={styles.whiteMuted}>
              {ar.auth.accountsNote}
            </AppText>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  shade: { backgroundImage: 'linear-gradient(to bottom, rgba(8,11,10,0.25), rgba(8,11,10,0.55))' },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.xl,
  },
  header: { alignItems: 'center', gap: spacing.sm },
  logoBox: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: radius.xl * 1.4,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  card: { gap: spacing.lg, padding: spacing.xl },
  white: { color: '#ffffff' },
  whiteMuted: { color: 'rgba(255,255,255,0.75)' },
});
