import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { apiUrl, getAuthBridge } from '@/services/api';

import { radius, useAppTheme } from '@/theme';

import { AppText } from './app-text';

/** Arabic harakat, Quranic marks, superscript alef and tatweel: never the "first letter". */
const NOT_A_LETTER = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/;
/** Letters: Arabic (incl. hamza forms and Persian/Urdu letters), Latin, digits as a last resort. */
const LETTER = /[ء-غف-يٱ-ۓۺ-ۿA-Za-zÀ-ɏ]/;

/**
 * The one letter shown in an avatar: the first meaningful letter of the
 * name, skipping spaces, diacritics, tatweel and punctuation
 * («  حمادي الشوك» → «ح», «أَحمد» → «أ»). Latin letters are upper-cased.
 * Empty or letter-less names give "" (the avatar then shows no letter).
 */
export function avatarLetter(name: string | null | undefined): string {
  for (const char of name ?? '') {
    if (NOT_A_LETTER.test(char)) continue;
    if (LETTER.test(char)) return char.toLocaleUpperCase();
  }
  return '';
}

export interface PhotoSource {
  uri: string;
  /** Private photos: the access token in the HEADER (never in the URL) */
  headers?: Record<string, string>;
  /** Private photos stay in memory only (the API sends Cache-Control: private, no-store) */
  private: boolean;
}

/**
 * How to load a person's photo (backend photoUrl):
 *  - "/api/files/:id" — a PRIVATE file: the API's absolute URL, with the
 *    Bearer token as a request header (the API answers 404 to anyone not
 *    allowed to see it); no token when signed out → no photo;
 *  - an absolute http(s) URL — loaded as is (public);
 *  - anything else (empty, another relative path) — no photo (initials).
 */
export function resolvePhoto(photoUrl: string | null | undefined, token: string | null): PhotoSource | null {
  const url = photoUrl?.trim();
  if (!url) return null;
  if (url.startsWith('/api/files/')) {
    if (!token) return null;
    return { uri: apiUrl(url), headers: { Authorization: `Bearer ${token}` }, private: true };
  }
  if (/^https?:\/\//i.test(url)) return { uri: url, private: false };
  return null;
}

/**
 * Round avatar: the person's PHOTO when there is one and it loads, else ONE
 * letter of the name. The letter is drawn underneath, so it shows while the
 * photo loads and stays if it fails (missing file, no access, offline).
 */
export function InitialsAvatar({ name, size = 40, photoUrl }: { name: string; size?: number; photoUrl?: string | null }) {
  const { colors } = useAppTheme();
  const [failed, setFailed] = useState<string | null>(null);
  const photo = resolvePhoto(photoUrl, getAuthBridge()?.getAccessToken() ?? null);
  const showPhoto = photo !== null && failed !== photo.uri;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.root, { width: size, height: size, backgroundColor: colors.brandSoft }]}>
      <AppText
        variant={size >= 48 ? 'heading' : 'bodyStrong'}
        style={{ color: colors.brandSoftForeground, fontSize: Math.round(size * 0.42), lineHeight: Math.round(size * 0.6) }}>
        {avatarLetter(name)}
      </AppText>
      {showPhoto ? (
        <Image
          testID="avatar-photo"
          // cacheKey = the URL: a refreshed token does not re-download the same photo
          source={{ uri: photo.uri, headers: photo.headers, cacheKey: photo.uri }}
          cachePolicy={photo.private ? 'memory' : 'memory-disk'}
          contentFit="cover"
          transition={120}
          onError={() => setFailed(photo.uri)}
          style={[styles.photo, { borderRadius: size / 2 }]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photo: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
});
