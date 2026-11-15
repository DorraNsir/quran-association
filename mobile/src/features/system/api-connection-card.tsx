import { StyleSheet, View } from 'react-native';

import { QueryState } from '@/components/feedback';
import { AppText, Card, Icon } from '@/components/ui';
import { env } from '@/config/env';
import { ar } from '@/i18n/ar';
import { spacing, useAppTheme } from '@/theme';

import { useApiHealth } from './use-api-health';

/**
 * Connection diagnostics against the real backend (GET /api/health). A 503
 * (database down) surfaces through the error state with the API's message.
 */
export function ApiConnectionCard() {
  const { colors } = useAppTheme();
  const health = useApiHealth();

  return (
    <Card>
      <AppText variant="heading">{ar.system.connection}</AppText>
      <QueryState query={health}>
        <View style={styles.row}>
          <Icon name="success" color={colors.primary} />
          <AppText variant="bodyStrong" tone="primary">
            {ar.system.connected}
          </AppText>
        </View>
      </QueryState>
      <View style={[styles.urlBox, { backgroundColor: colors.muted }]}>
        <AppText variant="caption" tone="muted">
          {ar.system.apiUrl}
        </AppText>
        {/* URLs are LTR content inside the RTL layout */}
        <AppText variant="caption" selectable style={styles.ltr}>
          {env.apiUrl}
        </AppText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  urlBox: { borderRadius: 8, padding: spacing.md, gap: spacing.xs },
  ltr: { writingDirection: 'ltr' },
});
