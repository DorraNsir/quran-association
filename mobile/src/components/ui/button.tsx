import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
} from 'react-native';

import { radius, spacing, touchTarget, useAppTheme } from '@/theme';

import { AppText } from './app-text';
import { Icon, type IconName } from './icon';

type Variant = 'primary' | 'outline' | 'ghost' | 'destructive';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
  fullWidth?: boolean;
}

/** The web's shadcn Button variants the app uses (destructive: soft red, for deletions). */
export function Button({
  label,
  variant = 'primary',
  icon,
  loading = false,
  fullWidth = false,
  disabled,
  ...rest
}: ButtonProps) {
  const { colors } = useAppTheme();
  const isDisabled = disabled || loading;
  const fg =
    variant === 'primary'
      ? colors.primaryForeground
      : variant === 'destructive'
        ? colors.destructiveSoftForeground
        : colors.foreground;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        fullWidth && styles.fullWidth,
        variant === 'primary' && { backgroundColor: colors.primary },
        variant === 'outline' && {
          backgroundColor: colors.card,
          borderColor: colors.input,
          borderWidth: StyleSheet.hairlineWidth * 2,
        },
        variant === 'destructive' && {
          backgroundColor: colors.destructiveSoft,
          borderColor: colors.destructive,
          borderWidth: StyleSheet.hairlineWidth * 2,
        },
        pressed && { opacity: 0.85 },
        isDisabled && { opacity: 0.5 },
      ]}
      {...rest}>
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={fg} />
        ) : icon ? (
          <Icon name={icon} size={18} color={fg} />
        ) : null}
        <AppText variant="label" style={{ color: fg }}>
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
