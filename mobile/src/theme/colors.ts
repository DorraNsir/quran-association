/**
 * Colour tokens of the web app (frontend/src/app/globals.css), converted from
 * OKLCH to sRGB hex because React Native does not parse oklch(). Keep the
 * names identical to the CSS variables so both clients stay in sync.
 */
export interface ColorTokens {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  /** Brand — the logo green (darkened for AA text contrast) */
  primary: string;
  primaryForeground: string;
  brandSoft: string;
  brandSoftForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  destructiveSoft: string;
  /** Dark red text on destructiveSoft (AA) — cancelled sessions */
  destructiveSoftForeground: string;
  warning: string;
  warningSoft: string;
  /** Dark amber text on warningSoft (AA) — extra sessions, warnings */
  warningSoftForeground: string;
  border: string;
  input: string;
  ring: string;
  /** Branded workspace header (deep logo green) and its text */
  heroBackground: string;
  heroForeground: string;
  heroMuted: string;
  /** Gold accent of the web login page (hadith, header edge) */
  gold: string;
}

export const lightColors: ColorTokens = {
  background: '#f9fafa',
  foreground: '#232020',
  card: '#ffffff',
  cardForeground: '#232020',
  primary: '#087a3a',
  primaryForeground: '#fafdfb',
  brandSoft: '#e6fae9',
  brandSoftForeground: '#165c2f',
  secondary: '#f2f3f5',
  secondaryForeground: '#202225',
  muted: '#f2f3f5',
  mutedForeground: '#606369',
  accent: '#f0f2f4',
  accentForeground: '#232020',
  destructive: '#dc2626',
  destructiveForeground: '#ffffff',
  destructiveSoft: '#fdecec',
  destructiveSoftForeground: '#991b1b',
  warning: '#b86b00',
  warningSoft: '#fff4d7',
  warningSoftForeground: '#7c4300',
  border: '#e3e5e7',
  input: '#d9dbde',
  ring: '#49935d',
  heroBackground: '#065f2f',
  heroForeground: '#ffffff',
  heroMuted: 'rgba(255,255,255,0.78)',
  gold: '#e8cf98',
};

export const darkColors: ColorTokens = {
  background: '#0e0f12',
  foreground: '#f5f5f5',
  card: '#17181b',
  cardForeground: '#f5f5f5',
  primary: '#5ab574',
  primaryForeground: '#0b1a0f',
  brandSoft: '#193521',
  brandSoftForeground: '#a2dfb0',
  secondary: '#252729',
  secondaryForeground: '#f5f5f5',
  muted: '#252729',
  mutedForeground: '#9ea2a8',
  accent: '#252729',
  accentForeground: '#f5f5f5',
  destructive: '#ff6467',
  destructiveForeground: '#0e0f12',
  destructiveSoft: '#3a1718',
  destructiveSoftForeground: '#ffb4b4',
  warning: '#f2af48',
  warningSoft: '#3c2a0e',
  warningSoftForeground: '#f7c674',
  // Web: oklch(1 0 0 / 10%) and / 15%
  border: 'rgba(255,255,255,0.10)',
  input: 'rgba(255,255,255,0.15)',
  ring: '#49935d',
  heroBackground: '#12321f',
  heroForeground: '#f5f5f5',
  heroMuted: 'rgba(245,245,245,0.72)',
  gold: '#c9ad6f',
};
