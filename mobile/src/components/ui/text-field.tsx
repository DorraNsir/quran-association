import { useState, type Ref } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputInstance,
  type TextInputProps,
} from 'react-native';

import { fontFamilies, radius, spacing, touchTarget, useAppTheme } from '@/theme';

import { AppText } from './app-text';
import { Icon, type IconName } from './icon';

export interface TextFieldProps extends Omit<TextInputProps, 'style' | 'secureTextEntry'> {
  label: string;
  icon?: IconName;
  error?: string;
  /** Password field with a show/hide toggle */
  secret?: boolean;
  ref?: Ref<TextInputInstance>;
}

/** Web FormField + Input: label above, leading icon, inline Arabic error. */
export function TextField({
  label,
  icon,
  error,
  secret = false,
  ref,
  ...input
}: TextFieldProps) {
  const { colors } = useAppTheme();
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.destructive : focused ? colors.ring : colors.input;

  return (
    <View style={styles.root}>
      <AppText variant="label">{label}</AppText>
      <View style={[styles.box, { borderColor, backgroundColor: colors.card }]}>
        {icon ? <Icon name={icon} size={18} color={colors.mutedForeground} /> : null}
        <TextInput
          {...input}
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={error}
          secureTextEntry={secret && !visible}
          placeholderTextColor={colors.mutedForeground}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          style={[styles.input, { color: colors.foreground }]}
        />
        {secret ? (
          <Pressable
            onPress={() => setVisible((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
            accessibilityState={{ selected: visible }}
            hitSlop={8}
            style={styles.toggle}>
            <Icon name={visible ? 'hide' : 'show'} size={18} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <AppText variant="caption" tone="destructive" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  box: {
    minHeight: touchTarget,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: touchTarget,
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    // RTL fields like the web (caret on the right); Latin usernames still type normally
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  toggle: { padding: spacing.xs },
});
