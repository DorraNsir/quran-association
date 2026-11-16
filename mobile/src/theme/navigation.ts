import { fontFamilies } from './typography';
import { useAppTheme } from './index';

/** Header style shared by every Stack (root and nested workspace stacks). */
export function useStackScreenOptions() {
  const theme = useAppTheme();
  return {
    headerTitleAlign: 'center' as const,
    headerShadowVisible: false,
    headerStyle: { backgroundColor: theme.colors.card },
    headerTintColor: theme.colors.foreground,
    headerTitleStyle: { fontFamily: fontFamilies.semibold },
    contentStyle: { backgroundColor: theme.colors.background },
  };
}
