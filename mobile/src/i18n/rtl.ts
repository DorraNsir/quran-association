import { DevSettings, I18nManager, Platform } from 'react-native';

/**
 * Arabic is the platform's only active locale (frontend/src/lib/i18n.ts), so
 * the layout is always right-to-left.
 *
 * - Native builds: the expo-localization config plugin (supportsRTL +
 *   forcesRTL in app.json) makes the app start in RTL.
 * - Expo Go (where config plugins do not apply): forceRTL is persisted by
 *   React Native but only takes effect after a reload, done once here.
 * - Web: <html dir="rtl"> in src/app/+html.tsx.
 *
 * Styles must use logical properties (marginStart/End, paddingStart/End,
 * start/end) so they flip automatically.
 */
export function ensureRTL(): void {
  if (Platform.OS === 'web') return;
  I18nManager.allowRTL(true);
  if (!I18nManager.isRTL) {
    I18nManager.forceRTL(true);
    if (__DEV__) DevSettings.reload();
  }
}
