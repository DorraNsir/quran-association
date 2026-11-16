import { renderHook } from '@testing-library/react-native';

import { HEADER_TITLE_MAX, headerTitle, useHeaderOptions, useStackScreenOptions } from './navigation';

describe('header titles', () => {
  it('short titles unchanged; whitespace collapsed', () => {
    expect(headerTitle('  مجموعة   الفجر ')).toBe('مجموعة الفجر');
  });

  it('long titles (e.g. a shared lesson of several groups) are cut at a word with an ellipsis', () => {
    const long = 'مجموعة الفجر · مجموعة الأمل · مجموعة الماهر · مجموعة الأرقم';
    const title = headerTitle(long);
    expect(title.length).toBeLessThanOrEqual(HEADER_TITLE_MAX + 1);
    expect(title.endsWith('…')).toBe(true);
    expect(long.startsWith(title.slice(0, -1))).toBe(true);
  });

  it('a single very long word is cut too', () => {
    expect(headerTitle('ا'.repeat(80))).toHaveLength(HEADER_TITLE_MAX + 1);
  });
});

describe('header options (consistent on every screen)', () => {
  it('compact, start-aligned (right in RTL), no shadow; stack back control without a long label', async () => {
    const tabs = (await renderHook(() => useHeaderOptions())).result.current;
    expect(tabs).toMatchObject({ headerTitleAlign: 'left', headerShadowVisible: false });
    expect(tabs.headerTitleStyle.fontSize).toBe(17);
    const stack = (await renderHook(() => useStackScreenOptions())).result.current;
    expect(stack).toMatchObject({ headerTitleAlign: 'left', headerBackButtonDisplayMode: 'minimal' });
  });
});
