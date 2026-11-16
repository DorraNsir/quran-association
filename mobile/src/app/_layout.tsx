import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
  useFonts,
} from '@expo-google-fonts/ibm-plex-sans-arabic';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AuthProvider, useSession } from '@/features/auth/auth-provider';
import { OfflineGate, RestoringGate } from '@/features/auth/session-gates';
import { canUseWorkspace } from '@/features/auth/workspaces';
import { ar } from '@/i18n/ar';
import { ensureRTL } from '@/i18n/rtl';
import { AppProviders } from '@/providers/app-providers';
import { useAppTheme, type AppTheme } from '@/theme';
import { useStackScreenOptions } from '@/theme/navigation';

ensureRTL();
void SplashScreen.preventAutoHideAsync();

function navigationTheme({ dark, colors }: AppTheme): Theme {
  const base = dark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.card,
      text: colors.foreground,
      border: colors.border,
      notification: colors.destructive,
    },
  };
}

/**
 * Route access follows the session (Stack.Protected): signed out → login
 * only; temporary password → change-password only; otherwise the
 * workspaces the account may open (same rules as the web). The backend
 * authorizes every request regardless — this is navigation, not security.
 */
function RootNavigator() {
  const screenOptions = useStackScreenOptions();
  const { status, user } = useSession();

  if (status === 'restoring') return <RestoringGate />;
  if (status === 'offline') return <OfflineGate />;

  const signedIn = status === 'signedIn' && user !== null;
  const mustChange = signedIn && user.mustChangePassword;
  const ready = signedIn && !user.mustChangePassword;

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={mustChange}>
        <Stack.Screen
          name="change-password"
          options={{ title: ar.auth.changePasswordTitle, headerBackVisible: false, gestureEnabled: false }}
        />
      </Stack.Protected>
      <Stack.Protected guard={ready}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Protected guard={ready && canUseWorkspace(user, 'admin')}>
          <Stack.Screen name="admin" options={{ title: ar.workspace.admin, headerBackVisible: false }} />
        </Stack.Protected>
        <Stack.Protected guard={ready && canUseWorkspace(user, 'teacher')}>
          {/* Nested stack (app/teacher/_layout.tsx) draws its own headers */}
          <Stack.Screen name="teacher" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={ready && canUseWorkspace(user, 'student')}>
          <Stack.Screen name="student" options={{ title: ar.workspace.student, headerBackVisible: false }} />
        </Stack.Protected>
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const theme = useAppTheme();
  const [fontsLoaded, fontError] = useFonts({
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_500Medium,
    IBMPlexSansArabic_600SemiBold,
    IBMPlexSansArabic_700Bold,
  });
  // A font failure must not block the app: fall back to the system font
  const ready = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <AppProviders>
      <AuthProvider>
        <ThemeProvider value={navigationTheme(theme)}>
          <StatusBar style={theme.dark ? 'light' : 'dark'} />
          <RootNavigator />
        </ThemeProvider>
      </AuthProvider>
    </AppProviders>
  );
}
