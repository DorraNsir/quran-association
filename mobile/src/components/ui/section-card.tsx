import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing, useAppTheme } from '@/theme';

import { AppText } from './app-text';
import { Card } from './card';
import { Icon, type IconName } from './icon';

/** Web SectionCard: a titled card with an icon and an optional aside / action. */
export function SectionCard({
  title,
  icon,
  aside,
  action,
  children,
}: {
  title: string;
  icon: IconName;
  aside?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const { colors } = useAppTheme();
  return (
    <Card>
      <View style={styles.header}>
        <Icon name={icon} size={20} color={colors.primary} />
        <AppText variant="heading" accessibilityRole="header" style={styles.flex}>
          {title}
        </AppText>
        {aside ? (
          <AppText variant="caption" tone="muted">
            {aside}
          </AppText>
        ) : null}
        {action}
      </View>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
