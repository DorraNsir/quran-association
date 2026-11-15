import { StyleSheet, View } from 'react-native';

import { ErrorState, LoadingState } from '@/components/feedback';
import { Button, LogoMark, Screen } from '@/components/ui';
import { ApiConnectionCard } from '@/features/system/api-connection-card';
import { ar } from '@/i18n/ar';
import { spacing } from '@/theme';

import { session, useSession } from './auth-provider';

/** Launch: the stored session is being checked with the server. */
export function RestoringGate() {
  return (
    <Screen scroll={false} edges={['top', 'bottom']}>
      <View style={styles.center}>
        <LogoMark size={96} />
        <LoadingState label={ar.auth.restoring} />
      </View>
    </Screen>
  );
}

/**
 * A session is stored but the server is unreachable: never sign out for
 * that. Retry (also automatic when the app returns to the foreground), or
 * sign out explicitly to use another account.
 */
export function OfflineGate() {
  const { restoreError } = useSession();
  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.center}>
        <LogoMark size={80} />
        <ErrorState
          error={restoreError}
          onRetry={() => void session.restore()}
        />
        <Button
          variant="ghost"
          icon="logout"
          label={ar.auth.logout}
          onPress={() => void session.logout()}
        />
      </View>
      <ApiConnectionCard />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
});
