import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { EmptyState, QueryState } from '@/components/feedback';
import {
  AppText,
  BottomSheet,
  Button,
  Card,
  ChipRow,
  FilterBar,
  Icon,
  OptionRow,
  Pill,
  PressableRow,
  Screen,
  type ActiveFilter,
} from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { usePreferences } from '@/features/preferences/preferences';
import { ar } from '@/i18n/ar';
import { auto, formatDate } from '@/i18n/format';
import { fontFamilies, radius, spacing, touchTarget, useAppTheme } from '@/theme';

import { audienceTargets, authorName, dayOf, STATE_TONE } from './announcement-model';
import type { Announcement, AnnouncementFilters } from './announcement-types';
import { teacherClasses } from './dashboard-model';
import { TargetChips } from './teacher-resources';
import { announcementsKey, useAnnouncementPages } from './use-announcements';
import { useTeacherWorkspace } from './use-teacher-dashboard';
import { usePullToRefresh } from './use-refresh';

const t = ar.announcements;
const ALL = 'ALL';
export const SEARCH_DELAY_MS = 400;
type Tab = 'feed' | 'mine';

/**
 * «الإعلانات»: GET /teacher/announcements — what reaches me today
 * (EVERYONE, TEACHERS, my current classes / branches, as the server decides)
 * plus what I wrote. Two views, as on the web: the FEED (live announcements:
 * PUBLISHED and still ACTIVE) and «إعلاناتي» (mine, any state, with its
 * badge). Search and class are filtered by the server.
 */
export function TeacherAnnouncementsScreen() {
  const { user } = useSession();
  const teacherId = user?.teacherId ?? '';
  const router = useRouter();
  const { colors } = useAppTheme();
  const timeZone = usePreferences().data?.timezone;
  const workspace = useTeacherWorkspace(teacherId);
  const classes = workspace.data ? teacherClasses(workspace.data) : [];
  // Writing needs a current, active class of mine (the server refuses otherwise)
  const canPublish = classes.some((c) => c.status === 'ACTIVE');

  const [tab, setTab] = useState<Tab>('feed');
  const [classId, setClassId] = useState<string>(ALL);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    if (text.trim() === search) return;
    const timer = setTimeout(() => setSearch(text.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, search]);

  const filters: AnnouncementFilters = {
    ...(tab === 'feed' ? { status: 'PUBLISHED' } : { mine: true }),
    ...(search ? { search } : {}),
    ...(classId !== ALL ? { groupClassId: classId } : {}),
  };
  const pages = useAnnouncementPages(teacherId, filters);
  const { refreshing, onRefresh } = usePullToRefresh([announcementsKey(teacherId)]);
  const all = pages.data?.pages.flatMap((p) => p.data) ?? [];
  // The feed shows only what is live today (my own expired ones stay in «إعلاناتي»), as the web
  const items = tab === 'feed' ? all.filter((a) => a.state === 'ACTIVE') : all;
  const total = pages.data?.pages[0]?.meta.total ?? 0;
  const filtered = Boolean(search) || classId !== ALL;

  const active: ActiveFilter[] =
    classId !== ALL
      ? [{ key: 'class', label: classes.find((c) => c.id === classId)?.groupName ?? '—', clear: () => setClassId(ALL) }]
      : [];
  const reset = () => {
    setClassId(ALL);
    setText('');
    setSearch('');
  };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      {workspace.data ? (
        canPublish ? (
          <Button label={t.add} icon="add" fullWidth onPress={() => router.push('/teacher/announcements/new')} />
        ) : (
          <AppText variant="small" tone="muted">
            {t.noClasses}
          </AppText>
        )
      ) : null}

      <View style={styles.filters}>
        <ChipRow
          label={t.pickTab}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'feed', label: t.tabs.feed },
            { value: 'mine', label: t.tabs.mine },
          ]}
        />
        <View style={[styles.search, { borderColor: colors.input, backgroundColor: colors.card }]}>
          <Icon name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t.search}
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel={t.searchLabel}
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => setSearch(text.trim())}
            style={[styles.searchInput, { color: colors.foreground }]}
          />
          {text ? (
            <Pressable onPress={() => setText('')} accessibilityRole="button" accessibilityLabel={t.clearSearch} hitSlop={8}>
              <Icon name="close" size={16} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
        {classes.length > 1 ? (
          <FilterBar
            label={t.filters}
            activeLabel={t.activeFilters}
            removeLabel={t.removeFilter}
            resetLabel={t.clearFilters}
            total={pages.data && tab === 'mine' ? t.total(total) : null}
            active={active}
            onOpen={() => setSheetOpen(true)}
            onReset={() => setClassId(ALL)}
          />
        ) : null}
      </View>

      <QueryState query={pages}>
        {items.length === 0 ? (
          <Card>
            {filtered ? (
              <EmptyState icon="search" title={t.noMatch} action={<Button variant="outline" label={t.resetFilters} onPress={reset} />} />
            ) : (
              <EmptyState icon="announcements" title={tab === 'mine' ? t.emptyMine : t.empty} />
            )}
          </Card>
        ) : (
          <Card style={styles.list}>
            {items.map((a, i) => (
              <AnnouncementRow
                key={a.id}
                announcement={a}
                timeZone={timeZone}
                showState={tab === 'mine'}
                bordered={i > 0}
                onPress={() => router.push({ pathname: '/teacher/announcements/[id]', params: { id: a.id } })}
              />
            ))}
          </Card>
        )}
        {pages.hasNextPage ? (
          <Button variant="outline" label={t.loadMore} loading={pages.isFetchingNextPage} onPress={() => void pages.fetchNextPage()} />
        ) : null}
      </QueryState>

      <BottomSheet
        visible={sheetOpen}
        title={t.filtersTitle}
        closeLabel={t.closeFilters}
        onClose={() => setSheetOpen(false)}
        footer={
          <>
            <View style={styles.flex}>
              <Button variant="outline" label={t.clearFilters} fullWidth disabled={classId === ALL} onPress={() => setClassId(ALL)} />
            </View>
            <View style={styles.flex}>
              <Button label={t.done} fullWidth onPress={() => setSheetOpen(false)} />
            </View>
          </>
        }>
        <View style={styles.sheetGroup} accessibilityRole="radiogroup" accessibilityLabel={t.pickClass}>
          <AppText variant="label">{t.pickClass}</AppText>
          {[{ id: ALL, groupName: t.allClasses }, ...classes].map((c) => (
            <OptionRow key={c.id} label={c.groupName} selected={classId === c.id} onPress={() => setClassId(c.id)} />
          ))}
        </View>
      </BottomSheet>
    </Screen>
  );
}

/** A compact row: title, a two-line preview, author · day, audience (and, in «إعلاناتي», its state). */
export function AnnouncementRow({
  announcement: a,
  timeZone,
  showState,
  bordered,
  onPress,
}: {
  announcement: Announcement;
  timeZone: string | undefined;
  showState: boolean;
  bordered: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const date = formatDate(dayOf(a, timeZone));
  const targets = audienceTargets(a);
  return (
    <PressableRow bordered={bordered} onPress={onPress} accessibilityLabel={`${a.title}، ${date}`}>
      <View style={styles.head}>
        <View style={[styles.tile, { backgroundColor: colors.brandSoft }]}>
          <Icon name="announcements" size={18} color={colors.primary} />
        </View>
        <AppText variant="bodyStrong" numberOfLines={2} style={styles.flex}>
          {auto(a.title)}
        </AppText>
      </View>
      <AppText variant="small" tone="muted" numberOfLines={2}>
        {auto(a.content)}
      </AppText>
      <View style={styles.chips}>
        {showState ? <Pill label={t.state[a.state]} tone={STATE_TONE[a.state]} /> : null}
        {targets.length ? (
          <TargetChips targets={targets} />
        ) : (
          <View style={[styles.chip, { backgroundColor: colors.muted }]}>
            <AppText variant="caption" tone="muted">
              {t.audience[a.audience]}
            </AppText>
          </View>
        )}
      </View>
      <AppText variant="caption" tone="muted" numberOfLines={1}>
        {t.byLine(auto(authorName(a)), date)}
      </AppText>
    </PressableRow>
  );
}

const styles = StyleSheet.create({
  filters: { gap: spacing.sm },
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
  list: { paddingVertical: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tile: { width: 32, height: 32, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  chip: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 1 },
  sheetGroup: { gap: spacing.sm },
  flex: { flex: 1 },
});
