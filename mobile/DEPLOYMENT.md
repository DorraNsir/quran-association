# Android deployment — step by step (Ubuntu)

App: **عمر بن الخطاب** · package `com.omarelkhattab.app` · API `https://api.omarelkhattab.com/api`

All commands run from the `mobile/` folder:

```bash
cd ~/Desktop/quran-association/mobile
```

## The three kinds of build

| | What it is | Needs Metro / your computer? | Used for |
|---|---|---|---|
| **Development build** | Your own "Expo Go" with this app's native code; loads JavaScript from Metro | **Yes** | Daily development on a phone |
| **Preview APK** | A standalone, installable `.apk` | **No** | Testing the real app on phones, sharing with testers |
| **Production AAB** | An Android App Bundle (`.aab`) | **No** | Uploading to Google Play |

**EAS Update** (optional, later) sends JavaScript/asset changes to already-installed apps without a new build.

## 1. Accounts and tools (once)

- An **Expo account** (free): <https://expo.dev/signup>
- **Node.js** (already installed for this project).
- **EAS CLI**, run through `npx`, so nothing is installed globally:
  ```bash
  npx eas-cli@latest --version
  ```
- To read crash logs (optional but recommended):
  ```bash
  sudo apt install android-tools-adb
  ```
- Later, for the Play Store: a **Google Play Console** developer account (one-time fee).

## 2. Log in and link the project (once)

```bash
npx eas-cli@latest login        # your Expo username + password
npx eas-cli@latest whoami       # check
npx eas-cli@latest init         # creates the project on expo.dev
```

`eas init` adds `"owner"` and `"extra": { "eas": { "projectId": "…" } }` to the config.
This project uses `app.config.ts` on top of `app.json`. If `eas init` says it cannot edit the config, copy the two values it prints into `app.json`, under `"expo"`.

## 3. The API URL

The release URL is set in `eas.json`, for both `preview` and `production`:

```json
"env": { "EXPO_PUBLIC_API_URL": "https://api.omarelkhattab.com/api" }
```

- It is **not** a secret: it is built into the app. Never put passwords or keys in `EXPO_PUBLIC_*` variables.
- A preview/production build **stops** if this URL is not `https`, lacks `/api`, or is `localhost` / an emulator or LAN address (check in `app.config.ts`).
- `.env.local` (your LAN URL for development) is **not** uploaded to EAS.

Check the server before building:

```bash
curl https://api.omarelkhattab.com/api/health
```

## 4. Build the preview APK

```bash
npx eas-cli@latest build --profile preview --platform android
```

- The first time it asks **"Generate a new Android Keystore?"** → answer **Yes**. EAS stores the signing key safely; keep using the same one, because Android only accepts updates signed with it.
- The build runs on Expo's servers (about 10–25 min). At the end you get a link and a QR code. Builds are also listed at <https://expo.dev> → your project → Builds.

## 5. Install it on an Android phone

**Easiest:** open the build link (or scan the QR code) **on the phone** → download the `.apk` → open it → allow **"Install unknown apps"** for the browser when asked → **Install**.

**With a USB cable:**

```bash
adb devices                       # the phone must show as "device" (enable USB debugging)
adb install path/to/app.apk       # add -r to reinstall over an older preview
```

## 6. Test without Metro

1. Stop Metro on your computer (no `npx expo start` running).
2. Put the phone on **mobile data** (not your Wi-Fi), so it cannot reach your computer at all.
3. Open the app and check:
   - Login, logout, closing and reopening the app (still signed in).
   - Home, groups and classes, sessions, attendance, memorization.
   - Work programs, recitations, overall evaluation.
   - Student photos, «الملاحظات والاقتراحات».
   - Airplane mode, then back online.
   - The login background follows «مظهر واجهة الصفحة الرئيسية» on the website. Change it there, then reopen the login screen.

⚠️ The preview APK talks to the **real server and its real data**. Use real accounts carefully.

## 7. Crashes and network problems

With the phone connected by USB:

```bash
adb logcat -c                                   # clear old logs
adb logcat *:E ReactNativeJS:V ReactNative:V    # errors + the app's JavaScript messages
```

- Reproduce the problem and read the lines around it.
- **"Network request failed"** or the offline screen: check the server with the `curl` command above, check the phone's internet, and check the URL shown on the app's connection card.
- An HTTP-only URL can never work in a release build: Android blocks it.

## 8. Production AAB (Google Play) — later

```bash
npx eas-cli@latest build --profile production --platform android
```

- It produces an `.aab` with the same signing key.
- The `versionCode` goes up automatically: EAS manages it (`appVersionSource: remote`).
- The **first** upload to Google Play is manual: Play Console → your app → **Testing → Internal testing** → create a release → upload the `.aab`.
- Later you can upload with `npx eas-cli@latest submit --platform android`. This needs a Google service-account key, configured in Play Console.

Before each store release, raise the visible version in `app.json` (`"version": "1.0.1"`).

## 9. Updating the app after the first release

| Change | What to do |
|---|---|
| JavaScript / screens / texts / images used by screens | **New build** — or **EAS Update**, once it is set up (below) |
| App icon, splash, name, package, permissions, plugins (`app.json`, `app.config.ts`) | **New build** |
| Adding / upgrading a package with native code, Expo SDK upgrade | **New build** |
| The API URL in `eas.json` | **New build** |
| Backend only (NestJS) | Nothing on the phone |

**Setting up EAS Update** (optional, once — then a new build is required):

```bash
npx expo install expo-updates
npx eas-cli@latest update:configure
npx eas-cli@latest build --profile preview --platform android   # builds that can receive updates
```

Then, for JavaScript/asset-only changes:

```bash
npx eas-cli@latest update --channel preview --message "وصف التغيير"
```

## 10. Development build (optional)

For developing on a real phone with the app's native code, install the dev client once:

```bash
npx expo install expo-dev-client
npx eas-cli@latest build --profile development --platform android
```

Install that APK, then run `npx expo start --dev-client` on your computer. The phone loads JavaScript from Metro over your Wi-Fi, using `.env.local`.
