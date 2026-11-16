import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { spacing, useAppTheme } from '@/theme';

export interface ScreenProps {
  children: ReactNode;
  /** Wrap content in a ScrollView (default true) */
  scroll?: boolean;
  /** Pull-to-refresh, for screens backed by server data */
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Safe-area edges to pad; screens under a Stack header skip "top" */
  edges?: Edge[];
  /** Full-bleed block above the padded content (e.g. HeroHeader); scrolls with it */
  hero?: ReactNode;
  /** Fixed block under the scrolling content (e.g. a save bar) — always visible */
  footer?: ReactNode;
}

export function Screen({
  children,
  scroll = true,
  refreshing = false,
  onRefresh,
  edges = ['bottom'],
  hero,
  footer,
}: ScreenProps) {
  const { colors } = useAppTheme();
  return (
    <SafeAreaView edges={edges} style={[styles.root, { backgroundColor: colors.background }]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={hero ? styles.fillGrow : styles.content}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
                progressViewOffset={hero ? 48 : 0}
              />
            ) : undefined
          }>
          {hero ? (
            <>
              {hero}
              <View style={styles.content}>{children}</View>
            </>
          ) : (
            children
          )}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.fill]}>{children}</View>
      )}
      {footer}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  fillGrow: { flexGrow: 1 },
  content: { padding: spacing.lg, gap: spacing.lg, flexGrow: 1 },
});
