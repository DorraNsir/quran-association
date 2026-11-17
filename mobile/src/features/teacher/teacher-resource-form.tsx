import { Stack, usePreventRemove, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { EmptyState, QueryState } from '@/components/feedback';
import { AlertBox, AppText, Button, Card, ChipRow, FilterChip, Icon, Screen, SuccessToast } from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { ar } from '@/i18n/ar';
import { errorMessage } from '@/services/api';
import { fontFamilies, radius, spacing, touchTarget, useAppTheme } from '@/theme';

import { teacherClasses } from './dashboard-model';
import {
  classifyResourceError,
  DESCRIPTION_MAX,
  draftOf,
  formatSize,
  isLinkType,
  RESOURCE_TYPES,
  TITLE_MAX,
  URL_MAX,
  validateResource,
  type ResourceDraft,
} from './resource-model';
import type { Resource } from './resource-types';
import { isResourceUnavailable } from './teacher-resource';
import type { TeacherWorkspace } from './types';
import { useConfirmThenBack } from './use-confirm-then-back';
import { pickResourceFile, useResource, useSaveResource } from './use-resources';
import { useTeacherWorkspace } from './use-teacher-dashboard';

const r = ar.resources;

/**
 * «إضافة مورد» (POST) / «تعديل المورد» (PATCH /teacher/resources/:id), the
 * web's TeacherResourceDto: title, description, type, a link (http/https) OR
 * a file, and target classes among MY CURRENT classes (always GROUP_CLASS).
 * A file is uploaded first (POST /api/files, field `file`), then the resource
 * is saved with its id. Editing is offered only for my own resources
 * (`canManage`); the server re-checks ownership and assignment.
 */
export function TeacherResourceFormScreen({ resourceId, initialClassId }: { resourceId?: string; initialClassId?: string }) {
  const { user } = useSession();
  const teacherId = user?.teacherId ?? '';
  const router = useRouter();
  const workspace = useTeacherWorkspace(teacherId);
  const query = useResource(teacherId, resourceId ?? '');
  const title = resourceId ? r.editTitle : r.newTitle;
  const unavailable = (
    <Screen>
      <Stack.Screen options={{ title }} />
      <EmptyState
        icon="forbidden"
        title={r.notFound}
        description={r.notFoundHint}
        action={<Button variant="outline" label={r.backToList} onPress={() => router.replace('/teacher/resources')} />}
      />
    </Screen>
  );

  if (resourceId && query.isError && isResourceUnavailable(query.error)) return unavailable;
  // Somebody else's resource: never an edit form (the server would refuse: RESOURCE_EDIT_FORBIDDEN)
  if (resourceId && query.data && !query.data.canManage) return unavailable;
  const ready = workspace.data && (!resourceId || query.data);
  if (ready)
    return (
      <ResourceForm
        key={query.data?.id ?? 'new'}
        teacherId={teacherId}
        workspace={workspace.data!}
        resource={query.data}
        initialClassId={initialClassId}
      />
    );
  return (
    <Screen>
      <Stack.Screen options={{ title }} />
      <QueryState query={resourceId ? [workspace, query] : workspace}>{null}</QueryState>
    </Screen>
  );
}

function ResourceForm({
  teacherId,
  workspace,
  resource,
  initialClassId,
}: {
  teacherId: string;
  workspace: TeacherWorkspace;
  resource?: Resource;
  initialClassId?: string;
}) {
  const { colors } = useAppTheme();
  // Targets: my current, ACTIVE classes (the server refuses an inactive one)
  const classes = teacherClasses(workspace).filter((c) => c.status === 'ACTIVE');
  const allowed = new Set(classes.map((c) => c.id));
  // The saved state the form started from (to know what is unsaved)
  const [initial] = useState(() => draftOf(resource, allowed, initialClassId));
  const [draft, setDraft] = useState<ResourceDraft>(initial);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const save = useSaveResource(teacherId, resource?.id);
  const { confirmation, confirm } = useConfirmThenBack(
    resource ? { pathname: '/teacher/resources/[id]', params: { id: resource.id } } : '/teacher/resources',
  );

  const saving = save.isPending;
  const locked = saving || Boolean(confirmation);
  const invalid = validateResource(draft, resource);
  const dirty = JSON.stringify({ ...draft, file: draft.file?.uri ?? null }) !== JSON.stringify({ ...initial, file: null });
  const isLink = isLinkType(draft.type);
  const keepsFile = !isLink && !draft.file && resource?.type === draft.type && resource.file;

  const disablePrevention = usePreventRemove(dirty && !saving && !confirmation, ({ repeat }) => {
    Alert.alert(r.leaveTitle, r.leaveMessage, [
      { text: r.stay, style: 'cancel' },
      { text: r.discard, style: 'destructive', onPress: repeat },
    ]);
  });

  const set = (patch: Partial<ResourceDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setError(null);
  };

  async function onPick() {
    if (locked || isLink) return;
    try {
      const picked = await pickResourceFile(draft.type as 'PDF' | 'IMAGE' | 'AUDIO' | 'FILE');
      if (picked) set({ file: picked }); // cancelled: nothing changes
    } catch {
      setError(r.pickFailed);
    }
  }

  async function onSave() {
    if (submitting.current || confirmation) return;
    setSubmitted(true);
    if (invalid || (resource && !dirty)) return;
    submitting.current = true;
    setError(null);
    try {
      await save.mutateAsync(draft);
      disablePrevention();
      confirm(resource ? r.updated : r.created);
      return; // stays locked until the screen goes back
    } catch (e) {
      // The form stays as it is (title, link, chosen file, classes)
      const kind = classifyResourceError(e);
      setError(kind === 'offline' ? r.offlineSave : kind === 'tooLarge' ? r.tooLarge : errorMessage(e));
    }
    submitting.current = false;
  }

  const footer = (
    <View style={[styles.bar, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {confirmation ? (
        <SuccessToast message={confirmation} />
      ) : (
        <>
          {error ? <AlertBox message={error} /> : null}
          {submitted && invalid ? <AlertBox message={r.errors[invalid]} /> : null}
          <AppText variant="small" tone={dirty ? 'warning' : 'muted'}>
            {dirty ? r.unsaved : r.formHint}
          </AppText>
          <Button
            label={saving ? r.saving : resource ? r.saveEdit : r.save}
            icon={resource ? 'success' : 'upload'}
            loading={saving}
            disabled={saving || (resource ? !dirty : false)}
            fullWidth
            onPress={() => void onSave()}
          />
        </>
      )}
    </View>
  );

  const input = [styles.input, { color: colors.foreground, borderColor: colors.input }];
  return (
    <Screen footer={footer}>
      <Stack.Screen options={{ title: resource ? r.editTitle : r.newTitle }} />
      <Card style={styles.section}>
        <AppText variant="label">{r.titleLabel} *</AppText>
        <TextInput
          value={draft.title}
          onChangeText={(title) => set({ title })}
          editable={!locked}
          maxLength={TITLE_MAX + 1}
          accessibilityLabel={r.titleLabel}
          style={input}
        />
        <AppText variant="label">{r.descriptionLabel}</AppText>
        <TextInput
          value={draft.description}
          onChangeText={(description) => set({ description })}
          editable={!locked}
          multiline
          textAlignVertical="top"
          maxLength={DESCRIPTION_MAX + 1}
          accessibilityLabel={r.descriptionLabel}
          style={[...input, styles.multiline]}
        />
      </Card>

      <Card style={styles.section}>
        <ChipRow
          label={r.typeLabel}
          value={draft.type}
          onChange={(type) => !locked && set({ type })}
          options={RESOURCE_TYPES.map((t) => ({ value: t, label: r.type[t] }))}
        />
        {isLink ? (
          <>
            <AppText variant="label">{draft.type === 'VIDEO_LINK' ? r.videoUrlLabel : r.urlLabel} *</AppText>
            <TextInput
              value={draft.url}
              onChangeText={(url) => set({ url })}
              editable={!locked}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={URL_MAX + 1}
              placeholder={r.urlPlaceholder}
              placeholderTextColor={colors.mutedForeground}
              accessibilityLabel={r.urlLabel}
              style={[...input, styles.ltr]}
            />
          </>
        ) : (
          <>
            <AppText variant="label">{r.fileLabel} *</AppText>
            <AppText variant="small" tone="muted">
              {r.fileHint[draft.type as keyof typeof r.fileHint]}
            </AppText>
            {draft.file ? (
              <View style={styles.inline}>
                <Icon name="file" size={16} color={colors.primary} />
                <AppText variant="small" numberOfLines={2} style={styles.flex}>
                  {draft.file.name}
                  {draft.file.size !== null ? ` · ${formatSize(draft.file.size)}` : ''}
                </AppText>
              </View>
            ) : keepsFile ? (
              <AppText variant="small" tone="muted">
                {r.keepsFile(resource!.file!.fileName)}
              </AppText>
            ) : null}
            <Button
              variant="outline"
              icon="upload"
              label={draft.file || keepsFile ? r.replaceFile : r.pickFile}
              disabled={locked}
              onPress={() => void onPick()}
            />
          </>
        )}
      </Card>

      <Card style={styles.section}>
        <AppText variant="label">{r.classesLabel} *</AppText>
        <View style={styles.chips} accessibilityLabel={r.classesLabel}>
          {classes.map((c) => {
            const selected = draft.classIds.includes(c.id);
            return (
              <FilterChip
                key={c.id}
                label={c.groupName}
                role="checkbox"
                selected={selected}
                onPress={() =>
                  !locked && set({ classIds: selected ? draft.classIds.filter((id) => id !== c.id) : [...draft.classIds, c.id] })
                }
              />
            );
          })}
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
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
  multiline: { minHeight: 96, paddingVertical: spacing.sm, lineHeight: 24 },
  ltr: { textAlign: 'left', writingDirection: 'ltr' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  bar: {
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  flex: { flex: 1 },
});
