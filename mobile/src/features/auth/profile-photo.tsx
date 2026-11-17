import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { AppText, BottomSheet, Button, Icon, InitialsAvatar, type IconName } from '@/components/ui';
import { ar } from '@/i18n/ar';
import { ApiError, errorMessage } from '@/services/api';
import { radius, spacing, touchTarget, useAppTheme } from '@/theme';

import { session } from './auth-provider';
import { pickPhoto, PhotoPickFailure, removeMyPhoto, saveMyPhoto, type PhotoRole } from './my-photo';

const p = ar.photo;

/**
 * The signed-in person's avatar with a camera badge: tapping it offers
 * «التقاط صورة بالكاميرا / اختيار من المعرض / حذف الصورة» (delete only when
 * there is a photo). Permissions are asked only when an option is chosen.
 * Nothing changes on screen before the server confirms; then the session's
 * photo is updated (every avatar of this person follows) and that role's
 * cached data is refreshed. Reusable for any role with an own-photo endpoint.
 */
export function ProfilePhotoEditor({
  role,
  name,
  photoUrl,
  size = 80,
}: {
  role: PhotoRole;
  name: string;
  photoUrl: string | null;
  size?: number;
}) {
  const { colors } = useAppTheme();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  // Synchronous guard: one change at a time
  const running = useRef(false);
  // Which permission a refusal is about (camera or photo library)
  const lastSource = useRef<'camera' | 'library'>('library');

  async function run(action: () => Promise<{ photoUrl: string | null } | null>, success: string) {
    if (running.current) return;
    running.current = true;
    setMessage(null);
    try {
      const saved = await action();
      if (!saved) return; // picker cancelled: nothing changes
      session.setOwnPhoto(saved.photoUrl);
      void queryClient.invalidateQueries({ queryKey: [role] });
      setMessage({ tone: 'ok', text: success });
    } catch (e) {
      setMessage({ tone: 'error', text: failureText(e) });
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  function choose(source: 'camera' | 'library') {
    setOpen(false);
    lastSource.current = source;
    void run(async () => {
      const photo = await pickPhoto(source);
      if (!photo) return null;
      setBusy(true);
      return saveMyPhoto(role, photo);
    }, p.updated);
  }

  function failureText(e: unknown): string {
    if (e instanceof PhotoPickFailure)
      return e.kind === 'permission' ? (lastSource.current === 'camera' ? p.permissionCamera : p.permissionLibrary) : e.kind === 'type' ? p.badType : p.tooLarge;
    if (e instanceof ApiError && e.isNetwork) return p.offline;
    return errorMessage(e);
  }

  function askRemove() {
    setOpen(false);
    Alert.alert(p.removeTitle, p.removeMessage, [
      { text: p.cancel, style: 'cancel' },
      {
        text: p.remove,
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          void run(() => removeMyPhoto(role), p.removed);
        },
      },
    ]);
  }

  return (
    <View style={styles.root}>
      <Pressable
        onPress={() => !busy && setOpen(true)}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={p.change}
        accessibilityState={{ busy }}
        hitSlop={6}>
        <InitialsAvatar name={name} size={size} photoUrl={photoUrl} />
        <View style={[styles.badge, { backgroundColor: colors.primary, borderColor: colors.card }]}>
          <Icon name="camera" size={14} color={colors.primaryForeground} />
        </View>
        {busy ? (
          <View style={[styles.busy, { width: size, height: size, borderRadius: size / 2 }]}>
            <ActivityIndicator color="#ffffff" accessibilityLabel={p.saving} />
          </View>
        ) : null}
      </Pressable>
      {message ? (
        <AppText
          variant="caption"
          accessibilityLiveRegion="polite"
          style={{ color: message.tone === 'ok' ? colors.brandSoftForeground : colors.destructive }}>
          {message.text}
        </AppText>
      ) : null}

      <BottomSheet
        visible={open}
        title={p.change}
        closeLabel={p.cancel}
        onClose={() => setOpen(false)}
        footer={
          <View style={styles.flex}>
            <Button variant="outline" label={p.cancel} fullWidth onPress={() => setOpen(false)} />
          </View>
        }>
        <PhotoOption icon="camera" label={p.camera} onPress={() => choose('camera')} />
        <PhotoOption icon="image" label={p.library} onPress={() => choose('library')} />
        {photoUrl ? <PhotoOption icon="delete" label={p.remove} danger onPress={askRemove} /> : null}
      </BottomSheet>
    </View>
  );
}

function PhotoOption({ icon, label, danger, onPress }: { icon: IconName; label: string; danger?: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  const fg = danger ? colors.destructiveSoftForeground : colors.foreground;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.option,
        { borderColor: danger ? colors.destructive : colors.border, backgroundColor: danger ? colors.destructiveSoft : colors.card },
        pressed && { opacity: 0.8 },
      ]}>
      <Icon name={icon} size={20} color={fg} />
      <AppText variant="bodyStrong" style={[styles.flex, { color: fg }]}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: spacing.xs },
  badge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 28,
    height: 28,
    borderRadius: radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  busy: { position: 'absolute', top: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  option: {
    minHeight: touchTarget + 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
  },
  flex: { flex: 1 },
});
