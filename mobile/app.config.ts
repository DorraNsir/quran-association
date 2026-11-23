import type { ConfigContext, ExpoConfig } from 'expo/config';

/*
 * Release identity and build checks on top of app.json (Continuous Native Generation: there is
 * no android/ folder — `expo prebuild` / EAS generate it from this config).
 *
 * Profiles (eas.json → EAS_BUILD_PROFILE): development (dev client, any API URL),
 * preview (installable APK) and production (Play Store AAB) — their EXPO_PUBLIC_API_URL is in
 * eas.json (not a secret: it is built into the app). A preview / production build is REFUSED
 * unless it is an https URL of a real server with the /api prefix: never localhost, an emulator
 * alias, a LAN address or Metro.
 */

/** Permanent once on Google Play. */
const ANDROID_PACKAGE = 'com.omarelkhattab.app';

const RELEASE_PROFILES = ['preview', 'production'];

/** Why a URL cannot be built into a release app (null: fine). */
export function releaseApiUrlProblem(url: string | undefined): string | null {
  const value = (url ?? '').trim();
  if (!value) return 'EXPO_PUBLIC_API_URL is not set';
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return `EXPO_PUBLIC_API_URL is not a URL: ${value}`;
  }
  if (parsed.protocol !== 'https:') return `EXPO_PUBLIC_API_URL must use https (got ${parsed.protocol})`;
  const host = parsed.hostname;
  const local =
    host === 'localhost' ||
    host.endsWith('.local') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (local) return `EXPO_PUBLIC_API_URL points to a local / LAN address (${host})`;
  if (!parsed.pathname.replace(/\/+$/, '').endsWith('/api'))
    return `EXPO_PUBLIC_API_URL must include the "/api" prefix (e.g. https://api.example.com/api)`;
  return null;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const profile = process.env.EAS_BUILD_PROFILE;
  if (profile && RELEASE_PROFILES.includes(profile)) {
    const problem = releaseApiUrlProblem(process.env.EXPO_PUBLIC_API_URL);
    if (problem) throw new Error(`[${profile}] ${problem}. Set it in eas.json (build.${profile}.env.EXPO_PUBLIC_API_URL).`);
  }

  const plugins = (config.plugins ?? []).map((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    // The official logo (cropped from brand/logo.png): light on white, the dark-mode variant
    // with its black calligraphy lightened so it stays visible on the dark background
    if (name === 'expo-splash-screen')
      return [
        'expo-splash-screen',
        {
          backgroundColor: '#FFFFFF',
          image: './assets/images/brand/splash-logo.png',
          imageWidth: 160,
          resizeMode: 'contain',
          dark: { backgroundColor: '#0E0F12', image: './assets/images/brand/splash-logo-dark.png' },
        },
      ];
    // Images only (profile photo, feedback screenshot): no microphone permission
    if (name === 'expo-image-picker' && Array.isArray(plugin))
      return ['expo-image-picker', { ...(plugin[1] as object), microphonePermission: false }];
    return plugin;
  }) as NonNullable<ExpoConfig['plugins']>;
  // Requested by `expo install` for expo-web-browser ~58.1 (added once, never duplicated)
  const named = (p: (typeof plugins)[number]) => (Array.isArray(p) ? p[0] : p);
  if (!plugins.some((p) => named(p) === 'expo-web-browser')) plugins.push('expo-web-browser');

  return {
    ...config,
    name: config.name ?? 'عمر بن الخطاب',
    slug: 'omarelkhattab',
    // The version people see; the Play versionCode is managed by EAS (eas.json, remote)
    version: config.version ?? '1.0.0',
    plugins,
    android: {
      ...config.android,
      package: ANDROID_PACKAGE,
      adaptiveIcon: {
        backgroundColor: '#FFFFFF',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      // Not needed by the app: no microphone / audio recording; «display over other apps» is only
      // a development-template leftover (and a sensitive permission on Google Play)
      blockedPermissions: ['android.permission.RECORD_AUDIO', 'android.permission.SYSTEM_ALERT_WINDOW'],
    },
  } as ExpoConfig;
};
