import { render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { pillColors } from '@/components/ui';
import { ar } from '@/i18n/ar';
import { lightColors, darkColors } from '@/theme/colors';

import { ExtraSessionPill, SessionCard, SessionStatusPill } from './session-card';
import { EXTRA_SESSION_TONE, SESSION_STATUS_TONE } from './session-status';
import type { SessionItem } from './sessions-model';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const item = (over: Partial<SessionItem> = {}): SessionItem => ({
  id: 's1',
  date: '2026-11-16',
  start: '17:00',
  end: '19:00',
  status: 'SCHEDULED',
  isToday: false,
  isExtra: false,
  groupNames: ['مجموعة الفجر'],
  isShared: false,
  roomName: 'قاعة 1',
  branchName: 'الفرع الرئيسي',
  cancellationReason: null,
  progress: 'UPCOMING',
  expected: 0,
  recorded: 0,
  ...over,
});

/** Background of the pill holding a label. */
const pillOf = (label: string) => {
  let node = screen.getByText(label).parent;
  while (node && !String(node.props.testID ?? '').startsWith('pill-')) node = node.parent;
  if (!node) throw new Error(`no pill around «${label}»`);
  return node;
};
const bgOf = (label: string) => StyleSheet.flatten(pillOf(label).props.style).backgroundColor;
const fgOf = (label: string) => StyleSheet.flatten(screen.getByText(label).props.style).color;

describe('session status colours (one system)', () => {
  it('CANCELLED red, COMPLETED green, SCHEDULED neutral; extra amber, distinct from all', () => {
    expect(SESSION_STATUS_TONE).toEqual({ CANCELLED: 'danger', COMPLETED: 'success', SCHEDULED: 'muted' });
    expect(EXTRA_SESSION_TONE).toBe('warning');
    for (const colors of [lightColors, darkColors]) {
      const tones = (['danger', 'success', 'muted', 'warning'] as const).map((t) => pillColors(colors, t).bg);
      expect(new Set(tones).size).toBe(4);
    }
    expect(pillColors(lightColors, 'danger')).toEqual({ bg: lightColors.destructiveSoft, fg: lightColors.destructiveSoftForeground });
    expect(pillColors(lightColors, 'success')).toEqual({ bg: lightColors.brandSoft, fg: lightColors.brandSoftForeground });
    expect(pillColors(lightColors, 'warning')).toEqual({ bg: lightColors.warningSoft, fg: lightColors.warningSoftForeground });
  });

  it('the pills render those colours', async () => {
    await render(
      <>
        <SessionStatusPill status="CANCELLED" />
        <SessionStatusPill status="COMPLETED" />
        <SessionStatusPill status="SCHEDULED" />
        <ExtraSessionPill />
      </>,
    );
    expect(bgOf(ar.sessions.status.CANCELLED)).toBe(lightColors.destructiveSoft);
    expect(fgOf(ar.sessions.status.CANCELLED)).toBe(lightColors.destructiveSoftForeground);
    expect(bgOf(ar.sessions.status.COMPLETED)).toBe(lightColors.brandSoft);
    expect(bgOf(ar.sessions.status.SCHEDULED)).toBe(lightColors.muted);
    expect(bgOf(ar.teacher.extra)).toBe(lightColors.warningSoft);
    expect(fgOf(ar.teacher.extra)).toBe(lightColors.warningSoftForeground);
  });

  /** WCAG relative-luminance contrast, to keep the dark text readable on the soft backgrounds. */
  const contrast = (a: string, b: string) => {
    const lum = (hex: string) => {
      const [r, g, b2] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b2!;
    };
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  };
  it('text on every status background is readable (≥ 4.5:1, light and dark)', () => {
    for (const colors of [lightColors, darkColors])
      for (const tone of ['danger', 'success', 'warning'] as const) {
        const { bg, fg } = pillColors(colors, tone);
        expect(contrast(bg, fg)).toBeGreaterThanOrEqual(4.5);
      }
  });
});

describe('cancelled session card', () => {
  it('the group name is NOT struck through and stays readable; status and reason are shown', async () => {
    await render(<SessionCard session={item({ status: 'CANCELLED', cancellationReason: 'عطلة رسمية' })} today="2026-11-16" />);
    const name = screen.getByText('مجموعة الفجر');
    const style = StyleSheet.flatten(name.props.style);
    expect(style.textDecorationLine).not.toBe('line-through');
    expect(style.color).toBe(lightColors.foreground);
    expect(bgOf(ar.sessions.status.CANCELLED)).toBe(lightColors.destructiveSoft);
    expect(screen.getByText(`${ar.sessions.cancellationReason}: عطلة رسمية`)).toBeTruthy();
  });

  it('a cancelled EXTRA session keeps both badges, red and amber', async () => {
    await render(<SessionCard session={item({ status: 'CANCELLED', isExtra: true })} today="2026-11-16" />);
    expect(bgOf(ar.sessions.status.CANCELLED)).toBe(lightColors.destructiveSoft);
    expect(bgOf(ar.teacher.extra)).toBe(lightColors.warningSoft);
  });

  it('a completed session: green badge; the time range is in start → end order', async () => {
    await render(<SessionCard session={item({ status: 'COMPLETED' })} today="2026-11-16" />);
    expect(bgOf(ar.sessions.status.COMPLETED)).toBe(lightColors.brandSoft);
    const range = screen.getByLabelText('من 17:00 إلى 19:00');
    expect(within(range).getAllByText(/^\d\d:\d\d$/).map((n) => n.props.children)).toEqual(['17:00', '19:00']);
  });
});
