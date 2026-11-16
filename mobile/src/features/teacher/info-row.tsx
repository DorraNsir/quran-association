import type { ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Icon, type IconName } from '@/components/ui';
import { ar } from '@/i18n/ar';
import { spacing, touchTarget, useAppTheme } from '@/theme';

import { formatPhone, phoneHref } from './classes-model';

/** Web InfoList item: icon, label, value. */
export function InfoRow({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.row}>
      <Icon name={icon} size={18} color={colors.mutedForeground} />
      <View style={styles.flex}>
        <AppText variant="caption" tone="muted">
          {label}
        </AppText>
        {typeof children === 'string' ? <AppText variant="body">{children}</AppText> : children}
      </View>
    </View>
  );
}

/** A phone number that opens the dialer (web PhoneLink); "—" when missing. */
export function PhoneValue({ phone, label }: { phone: string | null; label: string }) {
  const { colors } = useAppTheme();
  if (!phone)
    return (
      <AppText variant="body" tone="muted">
        —
      </AppText>
    );
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={ar.student.call(label)}
      onPress={() => void Linking.openURL(phoneHref(phone)).catch(() => undefined)}
      hitSlop={8}
      style={styles.phone}>
      <AppText variant="bodyStrong" tone="primary" style={styles.ltr}>
        {formatPhone(phone)}
      </AppText>
      <Icon name="phone" size={16} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  flex: { flex: 1, gap: 2 },
  ltr: { writingDirection: 'ltr' },
  phone: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: touchTarget / 1.5 },
});
