import type { ColorValue } from 'react-native';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';

/**
 * Icons through expo-symbols (bundled with the SDK): SF Symbols on iOS,
 * Material Symbols on Android/web. Every icon is declared here once, with a
 * name for each platform, so screens use semantic names only.
 */
const ICONS = {
  error: { ios: 'exclamationmark.triangle', android: 'error' },
  empty: { ios: 'tray', android: 'inbox' },
  offline: { ios: 'wifi.slash', android: 'wifi_off' },
  retry: { ios: 'arrow.clockwise', android: 'refresh' },
  forbidden: { ios: 'lock.shield', android: 'lock' },
  success: { ios: 'checkmark.circle', android: 'check_circle' },
  serverDown: { ios: 'exclamationmark.icloud', android: 'cloud_off' },
  user: { ios: 'person', android: 'person' },
  lock: { ios: 'lock', android: 'lock' },
  show: { ios: 'eye', android: 'visibility' },
  hide: { ios: 'eye.slash', android: 'visibility_off' },
  login: { ios: 'rectangle.portrait.and.arrow.forward', android: 'login' },
  logout: { ios: 'rectangle.portrait.and.arrow.right', android: 'logout' },
  switch: { ios: 'arrow.left.arrow.right', android: 'swap_horiz' },
  admin: { ios: 'checkmark.shield', android: 'shield' },
  teacher: { ios: 'person.text.rectangle', android: 'badge' },
  student: { ios: 'graduationcap', android: 'school' },
  key: { ios: 'key', android: 'key' },
  calendar: { ios: 'calendar', android: 'calendar_month' },
  classes: { ios: 'book', android: 'menu_book' },
  students: { ios: 'person.2', android: 'groups' },
  clock: { ios: 'clock', android: 'schedule' },
  completed: { ios: 'calendar.badge.checkmark', android: 'event_available' },
  attendance: { ios: 'checkmark.seal', android: 'fact_check' },
  workFollowup: { ios: 'checklist', android: 'checklist' },
  notes: { ios: 'note.text', android: 'edit_note' },
  resources: { ios: 'folder', android: 'folder' },
  announcements: { ios: 'megaphone', android: 'campaign' },
  location: { ios: 'mappin.and.ellipse', android: 'location_on' },
  forward: { ios: 'chevron.left', android: 'chevron_left' },
  room: { ios: 'door.left.hand.open', android: 'meeting_room' },
  phone: { ios: 'phone', android: 'call' },
  age: { ios: 'birthday.cake', android: 'cake' },
  registered: { ios: 'person.badge.plus', android: 'person_add' },
  info: { ios: 'info.circle', android: 'info' },
  home: { ios: 'house', android: 'home' },
  partial: { ios: 'circle.lefthalf.filled', android: 'pending' },
  notRecorded: { ios: 'circle.dashed', android: 'radio_button_unchecked' },
  cancelledSession: { ios: 'calendar.badge.exclamationmark', android: 'event_busy' },
} as const satisfies Record<string, { ios: SFSymbol; android: AndroidSymbol }>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 22,
  color,
}: {
  name: IconName;
  size?: number;
  color: ColorValue;
}) {
  const symbol = ICONS[name];
  return (
    <SymbolView
      name={{ ios: symbol.ios, android: symbol.android, web: symbol.android }}
      size={size}
      tintColor={color}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
