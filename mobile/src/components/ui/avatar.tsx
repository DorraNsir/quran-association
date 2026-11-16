import { StyleSheet, View } from 'react-native';

import { radius, useAppTheme } from '@/theme';

import { AppText } from './app-text';

/**
 * Initials avatar. Person photos are private files (Bearer-only download),
 * not loaded in this phase.
 */
export function InitialsAvatar({ initials, size = 40 }: { initials: string; size?: number }) {
  const { colors } = useAppTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.root, { width: size, height: size, backgroundColor: colors.brandSoft }]}>
      <AppText variant="label" style={{ color: colors.brandSoftForeground }}>
        {initials}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
});
