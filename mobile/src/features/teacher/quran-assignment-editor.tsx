import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { EmptyState } from '@/components/feedback';
import { AppText, BottomSheet, ChipRow, Icon, OptionRow } from '@/components/ui';
import { ar } from '@/i18n/ar';
import { fontFamilies, radius, spacing, touchTarget, useAppTheme } from '@/theme';

import {
  ayahCount,
  FIRST_PAGE,
  LAST_PAGE,
  modesForItem,
  pageEnd,
  pageStart,
  withSurah,
  type AssignmentDraft,
  type AssignmentError,
  type AssignmentMode,
  type WorkType,
} from '../quran-reference/work-assignment';
import { searchSurahs, surahByNumber } from '../quran/surahs';

const w = ar.work;
const nameOf = (n: number) => surahByNumber(n)?.nameAr ?? String(n);

/**
 * حفظ: «سورة كاملة» (the surah only) · «بالآيات» (ending verse optional) · «بالصفحات» (ending page
 * optional); only the current format's fields are shown and sent.
 * The structured part of a work item (the web's QuranAssignmentFields): a format, surahs from a
 * searchable bottom sheet (all 114, scrollable to the last), verses limited to the surah's count,
 * or printed pages of the Qalun Mushaf. Every limit comes from the generated Quran reference.
 */
export function QuranAssignmentEditor({
  itemLabel,
  type,
  draft,
  onChange,
  error,
  disabled,
  allowFree = false,
}: {
  /** An item saved as free text (legacy): «نص حر» stays offered so it can be kept as written */
  allowFree?: boolean;
  /** «العمل 2» — prefixes the accessibility labels */
  itemLabel: string;
  type: WorkType;
  draft: AssignmentDraft;
  onChange: (draft: AssignmentDraft) => void;
  /** Shown only after a save attempt */
  error?: AssignmentError | null;
  disabled?: boolean;
}) {
  const { colors } = useAppTheme();
  const modes: AssignmentMode[] = modesForItem(type, allowFree);
  const set = (p: Partial<AssignmentDraft>) => !disabled && onChange({ ...draft, ...p });
  const number = (key: 'fromAyah' | 'toAyah' | 'fromPage' | 'toPage', label: string, clearLabel?: string) => (
    <View style={styles.numberField}>
      <AppText variant="small" tone="muted">
        {label}
      </AppText>
      <View style={styles.inline}>
        <TextInput
          value={draft[key]}
          onChangeText={(v) => set({ [key]: v.replace(/[^\d]/g, '') })}
          editable={!disabled}
          keyboardType="number-pad"
          accessibilityLabel={`${label} — ${itemLabel}`}
          style={[
            styles.input,
            styles.number,
            { color: colors.foreground, borderColor: error?.field === key ? colors.destructive : colors.input },
          ]}
        />
        {/* An optional end: one tap to clear it (back to a single verse / page) */}
        {clearLabel && draft[key] !== '' ? (
          <Pressable
            onPress={() => set({ [key]: '' })}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`${clearLabel} — ${itemLabel}`}
            hitSlop={8}
            style={styles.clearIcon}>
            <Icon name="close" size={16} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  const a = pageStart(Number(draft.fromPage));
  // Without an ending page: the starting page alone
  const z = pageEnd(Number(draft.toPage.trim() || draft.fromPage));
  const toPageNumber = Number(draft.toPage.trim() || draft.fromPage);

  return (
    <View style={styles.gap}>
      <ChipRow
        label={`${w.assignmentMode} — ${itemLabel}`}
        value={draft.mode}
        onChange={(mode) => set({ mode })}
        options={modes.map((m) => ({ value: m, label: w.mode[m] }))}
      />

      {draft.mode === 'ayahs' || draft.mode === 'surah' || draft.mode === 'wholeSurah' ? (
        <>
          <SurahSelect
            label={w.surah}
            itemLabel={itemLabel}
            value={draft.fromSurah}
            invalid={error?.field === 'fromSurah'}
            disabled={disabled}
            onPick={(s) => onChange(withSurah(draft, s))}
          />
          {draft.fromSurah ? (
            <AppText variant="small" tone="muted">
              {draft.mode === 'wholeSurah' ? `${w.wholeSurahOf(nameOf(draft.fromSurah))} — ` : ''}
              {w.ayahCountOf(ayahCount(draft.fromSurah))}
            </AppText>
          ) : null}
        </>
      ) : null}

      {draft.mode === 'ayahs' && draft.fromSurah ? (
        <View style={styles.row}>
          {number('fromAyah', w.fromAyah)}
          {number('toAyah', w.toAyahOptional, w.clearToAyah)}
        </View>
      ) : null}

      {draft.mode === 'surahs' ? (
        <>
          <SurahSelect
            label={w.fromSurah}
            itemLabel={itemLabel}
            value={draft.fromSurah}
            invalid={error?.field === 'fromSurah'}
            disabled={disabled}
            onPick={(s) => set({ fromSurah: s, fromAyah: '' })}
          />
          <SurahSelect
            label={w.toSurah}
            itemLabel={itemLabel}
            value={draft.toSurah}
            invalid={error?.field === 'toSurah'}
            disabled={disabled}
            onPick={(s) => set({ toSurah: s, toAyah: '' })}
            // Optional: without it, the starting surah alone
            onClear={() => set({ toSurah: null, toAyah: '' })}
          />
          <Pressable
            onPress={() => set({ precise: !draft.precise, fromAyah: '', toAyah: '' })}
            disabled={disabled}
            accessibilityRole="checkbox"
            accessibilityLabel={`${w.preciseAyahs} — ${itemLabel}`}
            accessibilityState={{ checked: draft.precise, disabled }}
            style={styles.check}>
            <Icon name={draft.precise ? 'success' : 'pending'} size={18} color={draft.precise ? colors.primary : colors.mutedForeground} />
            <AppText variant="body">{w.preciseAyahs}</AppText>
          </Pressable>
          {/* Without an ending surah the verses belong to the starting surah */}
          {draft.precise && draft.fromSurah ? (
            <View style={styles.row}>
              {number('fromAyah', `${w.fromAyah} (${nameOf(draft.fromSurah)})`)}
              {number('toAyah', `${w.toAyah} (${nameOf(draft.toSurah ?? draft.fromSurah)})`)}
            </View>
          ) : null}
        </>
      ) : null}

      {draft.mode === 'pages' ? (
        <>
          <View style={styles.row}>
            {number('fromPage', w.fromPage)}
            {number('toPage', w.toPageOptional, w.clearToPage)}
          </View>
          <AppText variant="small" tone="muted">
            {w.pagesHint(FIRST_PAGE, LAST_PAGE)}
            {a && z && Number(draft.fromPage) <= toPageNumber
              ? ` ${w.pagesCover(`${nameOf(a.surah)} ${a.ayah}`, `${nameOf(z.surah)} ${z.ayah}`)}`
              : ''}
          </AppText>
        </>
      ) : null}

      {error ? (
        <AppText variant="small" tone="destructive" accessibilityRole="alert">
          {error.message}
        </AppText>
      ) : null}
    </View>
  );
}

/** A surah field: opens a bottom sheet with search over the 114 surahs (Quran order). */
function SurahSelect({
  label,
  itemLabel,
  value,
  invalid,
  disabled,
  onPick,
  onClear,
}: {
  label: string;
  itemLabel: string;
  value: number | null;
  invalid?: boolean;
  disabled?: boolean;
  onPick: (surah: number) => void;
  /** An optional field: a control to empty it once chosen */
  onClear?: () => void;
}) {
  const { colors } = useAppTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const list = searchSurahs(query);
  const shown = value ? `سورة ${nameOf(value)}` : w.pickSurah;
  return (
    <View style={styles.gap}>
      <AppText variant="small" tone="muted">
        {label}
      </AppText>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label} — ${itemLabel}: ${shown}`}
        style={[styles.picker, { borderColor: invalid ? colors.destructive : colors.input }]}>
        <AppText variant="body" tone={value ? 'default' : 'muted'} style={styles.flex} numberOfLines={1}>
          {shown}
        </AppText>
        <Icon name="forward" size={16} color={colors.mutedForeground} />
      </Pressable>
      {onClear && value ? (
        <Pressable
          onPress={onClear}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`${w.clearToSurah} — ${itemLabel}`}
          hitSlop={8}
          style={styles.clear}>
          <Icon name="close" size={14} color={colors.mutedForeground} />
          <AppText variant="small" tone="muted">
            {w.clearToSurah}
          </AppText>
        </Pressable>
      ) : null}
      <BottomSheet
        visible={open}
        title={label}
        closeLabel={w.closePicker}
        onClose={() => {
          setOpen(false);
          setQuery('');
        }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={w.searchSurah}
          placeholderTextColor={colors.mutedForeground}
          accessibilityLabel={w.searchSurahLabel}
          autoCorrect={false}
          style={[styles.input, { color: colors.foreground, borderColor: colors.input }]}
        />
        <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.options}>
          {list.length === 0 ? (
            <EmptyState icon="classes" title={w.noSurah} />
          ) : (
            list.map((s) => (
              <OptionRow
                key={s.number}
                label={`${s.number}. سورة ${s.nameAr}`}
                selected={s.number === value}
                onPress={() => {
                  onPick(s.number);
                  setOpen(false);
                  setQuery('');
                }}
              />
            ))
          )}
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  options: { gap: spacing.xs },
  flex: { flex: 1 },
  numberField: { gap: 2 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  clearIcon: { minHeight: touchTarget, minWidth: 32, alignItems: 'center', justifyContent: 'center' },
  clear: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start' },
  check: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  picker: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
  },
  input: {
    minHeight: touchTarget,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  number: { width: 96, textAlign: 'center', writingDirection: 'ltr' },
});
