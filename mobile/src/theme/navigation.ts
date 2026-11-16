import { fontFamilies } from './typography';
import { useAppTheme } from './index';

/** Longest header title shown before an ellipsis (a joined list of groups can be very long). */
export const HEADER_TITLE_MAX = 34;

/**
 * A header title that never pushes the back control off screen: whitespace
 * collapsed, cut at a word when possible, ellipsis — the native header also
 * truncates, this keeps it predictable on both platforms.
 */
export function headerTitle(text: string, max = HEADER_TITLE_MAX): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Header look shared by every Stack and the tab bar's headers: compact, start-aligned (right in RTL). */
export function useHeaderOptions() {
  const theme = useAppTheme();
  return {
    // Start-aligned = on the right in RTL (Android and JS headers); iOS native stacks always centre
    headerTitleAlign: 'left' as const,
    headerShadowVisible: false,
    headerStyle: { backgroundColor: theme.colors.card },
    headerTintColor: theme.colors.foreground,
    headerTitleStyle: { fontFamily: fontFamilies.semibold, fontSize: 17 },
  };
}

/** Stack screens: the shared header + an icon-only back control (no long back label on iOS). */
export function useStackScreenOptions() {
  const theme = useAppTheme();
  return {
    ...useHeaderOptions(),
    headerBackButtonDisplayMode: 'minimal' as const,
    contentStyle: { backgroundColor: theme.colors.background },
  };
}
