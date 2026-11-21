import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, spacing, touchTarget, useAppTheme } from '@/theme';

import { AppText } from './app-text';
import { Icon } from './icon';

/**
 * A bottom sheet on React Native's own Modal (no extra dependency): slides
 * up over a dimmed backdrop, closes on backdrop tap, the close button or the
 * Android back button, scrolls when taller than ~80% of the screen, and pads
 * the bottom safe area. `header` (e.g. a search field) stays visible above
 * the scrolling content, `footer` under it.
 */
export function BottomSheet({
  visible,
  title,
  closeLabel,
  onClose,
  header,
  footer,
  children,
}: {
  visible: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        />
        <View
          accessibilityViewIsModal
          style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + spacing.md }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.header}>
            <AppText variant="heading" accessibilityRole="header" style={styles.flex}>
              {title}
            </AppText>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={closeLabel}
              hitSlop={8}
              style={styles.close}>
              <Icon name="close" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>
          {header ? <View style={styles.top}>{header}</View> : null}
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? <View style={[styles.footer, { borderColor: colors.border }]}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

/** One single-choice option of a sheet: full-width row, radio semantics, check mark when selected. */
export function OptionRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, checked: selected }}
      style={({ pressed }) => [
        styles.option,
        { borderColor: selected ? colors.primary : colors.border },
        selected && { backgroundColor: colors.brandSoft },
        pressed && !selected && { backgroundColor: colors.accent },
      ]}>
      <AppText variant="body" numberOfLines={2} style={[styles.flex, selected && { color: colors.brandSoftForeground }]}>
        {label}
      </AppText>
      {selected ? <Icon name="success" size={18} color={colors.primary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    maxHeight: '82%',
    borderTopLeftRadius: radius.xl * 1.4,
    borderTopRightRadius: radius.xl * 1.4,
    paddingTop: spacing.sm,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: radius.full, marginBottom: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  close: { padding: spacing.xs },
  content: { padding: spacing.lg, gap: spacing.md },
  top: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  option: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
  },
  flex: { flex: 1 },
});
