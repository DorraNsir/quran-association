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
  PressableRow,
  Screen,
  type ActiveFilter,
} from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { usePreferences } from '@/features/preferences/preferences';
import { ar } from '@/i18n/ar';
import { auto, formatDate, ltr } from '@/i18n/format';
import { fontFamilies, radius, spacing, touchTarget, useAppTheme } from '@/theme';

import { teacherClasses } from './dashboard-model';
import { platformDateOf } from './memorization-model';
import { formatSize, isLinkType, publisherName, RESOURCE_ICON, RESOURCE_TYPES, targetLabels } from './resource-model';
import type { Resource, ResourceFilters, ResourceType } from './resource-types';
import { useResourcePages, resourcesKey } from './use-resources';
import { useTeacherWorkspace } from './use-teacher-dashboard';
import { usePullToRefresh } from './use-refresh';

const r = ar.resources;
const ALL = 'ALL';
export const SEARCH_DELAY_MS = 400;

/** The host of a link («youtube.com»), for the card; null when not a URL. */
export function linkHost(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * «الموارد التعليمية»: what GET /teacher/resources returns for me — the
 * resources reaching my CURRENT classes, the all-students ones, and my own —
 * filtered and paginated ON THE SERVER (type, class, search, «منشوراتي»).
 * Edit / delete are only offered where the server says `canManage`.
 */
export function TeacherResourcesScreen({ initialClassId }: { initialClassId?: string }) {
  const { user } = useSession();
  const teacherId = user?.teacherId ?? '';
  const router = useRouter();
  const { colors } = useAppTheme();
  const timeZone = usePreferences().data?.timezone;
  const workspace = useTeacherWorkspace(teacherId);
  const classes = workspace.data ? teacherClasses(workspace.data) : [];

  const [mine, setMine] = useState<'all' | 'mine'>('all');
  const [type, setType] = useState<ResourceType | typeof ALL>(ALL);
  const [classId, setClassId] = useState<string>(initialClassId ?? ALL);
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    // Nothing typed since the last search: no timer (no needless update)
    if (text.trim() === search) return;
    const t = setTimeout(() => setSearch(text.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(t);
  }, [text, search]);

  const filters: ResourceFilters = {
    ...(search ? { search } : {}),
    ...(type !== ALL ? { type } : {}),
    ...(classId !== ALL ? { groupClassId: classId } : {}),
    ...(mine === 'mine' ? { mine: true } : {}),
  };
  const filtered = Object.keys(filters).length > 0;
  const pages = useResourcePages(teacherId, filters);
  const { refreshing, onRefresh } = usePullToRefresh([resourcesKey(teacherId)]);
  const items = pages.data?.pages.flatMap((p) => p.data) ?? [];
  const total = pages.data?.pages[0]?.meta.total ?? 0;
  // Publishing needs a current, active class (the server refuses otherwise)
  const canPublish = classes.some((c) => c.status === 'ACTIVE');
  const [sheetOpen, setSheetOpen] = useState(false);

  const reset = () => {
    setMine('all');
    setType(ALL);
    setClassId(ALL);
    setText('');
    setSearch('');
  };
  // The secondary filters (type, class): a sheet, shown as removable chips when on
  const active: ActiveFilter[] = [
    ...(type !== ALL ? [{ key: 'type', label: r.type[type], clear: () => setType(ALL) }] : []),
    ...(classId !== ALL
      ? [{ key: 'class', label: classes.find((c) => c.id === classId)?.groupName ?? '—', clear: () => setClassId(ALL) }]
      : []),
  ];

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      {workspace.data ? (
        canPublish ? (
          <Button
            label={r.add}
            icon="add"
            fullWidth
            onPress={() => router.push({ pathname: '/teacher/resources/new', params: classId !== ALL ? { classId } : {} })}
          />
        ) : (
          <AppText variant="small" tone="muted">
            {r.noClasses}
          </AppText>
        )
      ) : null}

      <View style={styles.filters}>
        <ChipRow
          label={r.pickScope}
          value={mine}
          onChange={setMine}
          options={[
            { value: 'all', label: r.scope.all },
            { value: 'mine', label: r.scope.mine },
          ]}
        />
        <View style={[styles.search, { borderColor: colors.input, backgroundColor: colors.card }]}>
          <Icon name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={r.search}
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel={r.searchLabel}
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => setSearch(text.trim())}
            style={[styles.searchInput, { color: colors.foreground }]}
          />
          {text ? (
            <Pressable onPress={() => setText('')} accessibilityRole="button" accessibilityLabel={r.clearSearch} hitSlop={8}>
              <Icon name="close" size={16} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
        <FilterBar
          label={r.filters}
          activeLabel={r.activeFilters}
          removeLabel={r.removeFilter}
          resetLabel={r.clearFilters}
          total={pages.data ? r.total(total) : null}
          active={active}
          onOpen={() => setSheetOpen(true)}
          onReset={() => {
            setType(ALL);
            setClassId(ALL);
          }}
        />
      </View>

      <QueryState query={pages}>
        {items.length === 0 ? (
          <Card>
            {filtered ? (
              <EmptyState icon="search" title={r.noMatch} action={<Button variant="outline" label={r.resetFilters} onPress={reset} />} />
            ) : (
              <EmptyState icon="resources" title={r.empty} description={canPublish ? r.emptyHint : undefined} />
            )}
          </Card>
        ) : (
          <Card style={styles.list}>
            {items.map((item, i) => (
              <ResourceRow
                key={item.id}
                resource={item}
                timeZone={timeZone}
                bordered={i > 0}
                onPress={() => router.push({ pathname: '/teacher/resources/[id]', params: { id: item.id } })}
              />
            ))}
          </Card>
        )}
        {pages.hasNextPage ? (
          <Button variant="outline" label={r.loadMore} loading={pages.isFetchingNextPage} onPress={() => void pages.fetchNextPage()} />
        ) : null}
      </QueryState>

      <BottomSheet
        visible={sheetOpen}
        title={r.filtersTitle}
        closeLabel={r.closeFilters}
        onClose={() => setSheetOpen(false)}
        footer={
          <>
            <View style={styles.flex}>
              <Button
                variant="outline"
                label={r.clearFilters}
                fullWidth
                disabled={active.length === 0}
                onPress={() => {
                  setType(ALL);
                  setClassId(ALL);
                }}
              />
            </View>
            <View style={styles.flex}>
              <Button label={r.done} fullWidth onPress={() => setSheetOpen(false)} />
            </View>
          </>
        }>
        <View style={styles.sheetGroup} accessibilityRole="radiogroup" accessibilityLabel={r.pickType}>
          <AppText variant="label">{r.pickType}</AppText>
          {([ALL, ...RESOURCE_TYPES] as const).map((t) => (
            <OptionRow key={t} label={t === ALL ? r.allTypes : r.type[t]} selected={type === t} onPress={() => setType(t)} />
          ))}
        </View>
        {classes.length > 1 ? (
          <View style={styles.sheetGroup} accessibilityRole="radiogroup" accessibilityLabel={r.pickClass}>
            <AppText variant="label">{r.pickClass}</AppText>
            {[{ id: ALL, groupName: r.allClasses }, ...classes].map((c) => (
              <OptionRow key={c.id} label={c.groupName} selected={classId === c.id} onPress={() => setClassId(c.id)} />
            ))}
          </View>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

const MAX_TARGETS = 2;

/** Who it reaches, as compact one-line chips (wrapping); the rest summed up as «+n» (full list in the details). */
export function TargetChips({ targets }: { targets: string[] }) {
  const { colors } = useAppTheme();
  const shown = targets.slice(0, MAX_TARGETS);
  const rest = targets.slice(MAX_TARGETS);
  return (
    <>
      {shown.map((t) => (
        <View key={t} style={[styles.chip, { backgroundColor: colors.brandSoft }]}>
          <AppText variant="caption" numberOfLines={1} style={[styles.chipText, { color: colors.brandSoftForeground }]}>
            {auto(t)}
          </AppText>
        </View>
      ))}
      {rest.length ? (
        <View
          style={[styles.chip, { backgroundColor: colors.muted }]}
          accessible
          accessibilityLabel={r.moreTargetsLabel(rest.join('، '))}>
          <AppText variant="caption" tone="muted">
            {ltr(r.moreTargets(rest.length))}
          </AppText>
        </View>
      ) : null}
    </>
  );
}

/**
 * A compact row: icon + title; the file (name · size) or the link's site;
 * type and targets; publisher · date. User-entered values keep their own
 * direction (an English title or a Latin file name in the RTL layout).
 */
export function ResourceRow({
  resource: res,
  timeZone,
  bordered,
  onPress,
}: {
  resource: Resource;
  timeZone: string | undefined;
  bordered: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const host = isLinkType(res.type) ? linkHost(res.externalUrl) : null;
  const date = formatDate(platformDateOf(res.createdAt, timeZone));
  return (
    <PressableRow bordered={bordered} onPress={onPress} accessibilityLabel={`${res.title}، ${r.type[res.type]}، ${date}`}>
      <View style={styles.head}>
        <View style={[styles.tile, { backgroundColor: colors.brandSoft }]}>
          <Icon name={RESOURCE_ICON[res.type]} size={18} color={colors.primary} />
        </View>
        <AppText variant="bodyStrong" numberOfLines={2} style={styles.flex}>
          {auto(res.title)}
        </AppText>
      </View>
      <View style={styles.meta}>
        {isLinkType(res.type) ? (
          <AppText variant="small" tone="muted" numberOfLines={1} style={styles.shrink}>
            {host ? ltr(host) : r.link}
          </AppText>
        ) : res.file ? (
          <>
            <AppText variant="small" tone="muted" numberOfLines={1} style={styles.shrink}>
              {ltr(res.file.fileName)}
            </AppText>
            <AppText variant="small" tone="muted">
              · {formatSize(res.file.size)}
            </AppText>
          </>
        ) : (
          <AppText variant="small" tone="muted">
            {r.file}
          </AppText>
        )}
      </View>
      <View style={styles.chips}>
        <View style={[styles.chip, { backgroundColor: colors.muted }]}>
          <AppText variant="caption" tone="muted">
            {r.type[res.type]}
          </AppText>
        </View>
        <TargetChips targets={targetLabels(res, r.allStudents)} />
      </View>
      <AppText variant="caption" tone="muted" numberOfLines={1}>
        {r.publishedBy(auto(publisherName(res)), date)}
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
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  chip: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 1, maxWidth: '100%' },
  chipText: { maxWidth: 180 },
  sheetGroup: { gap: spacing.sm },
  shrink: { flexShrink: 1 },
  flex: { flex: 1 },
});
