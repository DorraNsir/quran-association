import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { EmptyState } from '@/components/feedback';
import { AppText, BottomSheet, Icon } from '@/components/ui';
import { ar } from '@/i18n/ar';
import { fontFamilies, radius, spacing, touchTarget, useAppTheme } from '@/theme';

import { teacherClasses } from './dashboard-model';
import { StudentOptionRow } from './student-option-row';
import type { TeacherWorkspace } from './types';
import { filterStudentGroups, type StudentGroup } from './work-model';

const w = ar.work;

/** Students of my classes: current, active students, by class (the web's options; the server re-checks). */
export function studentOptions(ws: TeacherWorkspace): StudentGroup[] {
  const classes = teacherClasses(ws);
  return classes.map((c) => ({
    id: c.id,
    label: c.groupName,
    students: ws.students
      .filter((s) => s.groupClassId === c.id && s.status === 'ACTIVE')
      // the workspace's own photo URL (private file, shown with the token by InitialsAvatar)
      .map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, photoUrl: s.photoUrl }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar')),
  }));
}

/**
 * «اختر الطالب»: a bottom sheet of my students by class, searchable (Arabic hamza / tashkeel
 * tolerant, Latin case-insensitive), each row with the photo or the first letter. The search starts
 * fresh at each opening. Used by the Work Program form and «متابعة العرضات».
 */
export function StudentPickerSheet({
  visible,
  groups,
  selectedId,
  onPick,
  onClose,
}: {
  visible: boolean;
  groups: readonly StudentGroup[];
  selectedId: string;
  onPick: (studentId: string) => void;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const [query, setQuery] = useState('');
  const close = () => {
    setQuery('');
    onClose();
  };
  const shown = filterStudentGroups(groups, query);
  return (
    <BottomSheet
      visible={visible}
      title={w.pickStudent}
      closeLabel={w.closePicker}
      onClose={close}
      header={
        // stays above the scrolling list
        <View style={[styles.search, { borderColor: colors.input, backgroundColor: colors.background }]}>
          <Icon name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={w.searchStudent}
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel={w.searchStudentLabel}
            autoCorrect={false}
            returnKeyType="search"
            style={[styles.searchInput, { color: colors.foreground }]}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel={w.clearStudentSearch} hitSlop={8}>
              <Icon name="close" size={16} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
      }>
      {shown.length === 0 ? (
        <EmptyState icon="search" title={w.noStudentMatch} description={query ? w.noStudentMatchHint : undefined} />
      ) : (
        shown.map((g) => (
          <View key={g.id} accessibilityRole="radiogroup" accessibilityLabel={g.label} style={styles.group}>
            <AppText variant="small" tone="muted" accessibilityRole="header">
              {g.label}
            </AppText>
            {g.students.map((s, i) => (
              <StudentOptionRow
                key={s.id}
                name={s.name}
                photoUrl={s.photoUrl}
                selected={s.id === selectedId}
                divider={i > 0}
                onPress={() => {
                  setQuery('');
                  onPick(s.id);
                }}
              />
            ))}
          </View>
        ))
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  group: { gap: 2 },
  search: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, minHeight: touchTarget, fontFamily: fontFamilies.regular, fontSize: 15, textAlign: 'right', writingDirection: 'rtl' },
});
