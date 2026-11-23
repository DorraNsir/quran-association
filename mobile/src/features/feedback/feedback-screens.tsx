import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { EmptyState, QueryState } from '@/components/feedback';
import { AlertBox, AppText, Button, Card, ChipRow, Icon, Pill, resolvePhoto, Screen, SuccessToast } from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { usePreferences } from '@/features/preferences/preferences';
import { platformClock } from '@/features/teacher/dashboard-model';
import { useConfirmThenBack } from '@/features/teacher/use-confirm-then-back';
import { usePullToRefresh } from '@/features/teacher/use-refresh';
import { ar } from '@/i18n/ar';
import { formatDate } from '@/i18n/format';
import { classifyWorkError } from '@/features/teacher/work-model';
import { errorMessage, getAuthBridge } from '@/services/api';
import { fontFamilies, radius, spacing, touchTarget, useAppTheme } from '@/theme';

import {
  CATEGORY_LOOK,
  FEEDBACK_CATEGORIES,
  FEEDBACK_TEXT_MAX,
  FEEDBACK_TITLE_MAX,
  pickScreenshot,
  ScreenshotPickFailure,
  STATUS_LOOK,
  validateFeedback,
  type Feedback,
  type FeedbackCategory,
  type FeedbackSpace,
  type FeedbackStatus,
  type PickedScreenshot,
} from './feedback-model';
import { feedbackKey, useMyFeedback, useMyFeedbackItem, useSendFeedback } from './use-feedback';

const f = ar.feedback;

/** A day in the platform timezone: «20 نوفمبر 2026». */
function useDay() {
  const tz = usePreferences().data?.timezone;
  return (iso: string) => formatDate(platformClock(tz, new Date(iso)).today);
}

export function CategoryPill({ category }: { category: FeedbackCategory }) {
  const look = CATEGORY_LOOK[category];
  return <Pill label={f.category[category]} tone={look.tone} icon={look.icon} />;
}

export function StatusPill({ status }: { status: FeedbackStatus }) {
  const look = STATUS_LOOK[status];
  return <Pill label={f.status[status]} tone={look.tone} icon={look.icon} />;
}

/* ------------------------------- «ملاحظاتي» ------------------------------- */

/** «الملاحظات والاقتراحات»: the green «إرسال ملاحظة» and MY submissions (compact cards). */
export function FeedbackListScreen({ space }: { space: FeedbackSpace }) {
  const { user } = useSession();
  const userId = user?.id ?? '';
  const router = useRouter();
  const { colors } = useAppTheme();
  const day = useDay();
  const list = useMyFeedback(userId, space);
  const { refreshing, onRefresh } = usePullToRefresh([[...feedbackKey(userId, space), 'list']]);
  const rows = list.data?.data ?? [];

  const footer = (
    <View style={[styles.footer, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Button icon="add" label={f.send} fullWidth onPress={() => router.push({ pathname: '/feedback/new', params: { space } })} />
    </View>
  );

  return (
    <Screen footer={footer} refreshing={refreshing} onRefresh={onRefresh}>
      <Stack.Screen options={{ title: f.title }} />
      <AppText variant="heading" accessibilityRole="header">
        {f.mine}
      </AppText>
      <QueryState query={list} empty={rows.length === 0} emptyIcon="notes" emptyTitle={f.empty} emptyDescription={f.emptyHint}>
        <View style={styles.list}>
          {rows.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => router.push({ pathname: '/feedback/[id]', params: { id: item.id, space } })}
              accessibilityRole="link"
              accessibilityLabel={[item.title, f.category[item.category], f.status[item.status], day(item.createdAt), item.response ? f.responded : null]
                .filter(Boolean)
                .join(' · ')}
              testID={`feedback-${item.id}`}
              style={({ pressed }) => [styles.item, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}>
              <View style={styles.flex}>
                <AppText variant="bodyStrong" numberOfLines={2}>
                  {item.title}
                </AppText>
                <View style={styles.meta}>
                  <CategoryPill category={item.category} />
                  <AppText variant="small" tone="muted">
                    {day(item.createdAt)}
                  </AppText>
                  {item.response ? (
                    <View style={styles.inline} testID="has-response">
                      <Icon name="announcements" size={14} color={colors.primary} />
                      <AppText variant="small" style={{ color: colors.primary }}>
                        {f.responded}
                      </AppText>
                    </View>
                  ) : null}
                </View>
              </View>
              <StatusPill status={item.status} />
            </Pressable>
          ))}
        </View>
      </QueryState>
    </Screen>
  );
}

/* --------------------------------- the form --------------------------------- */

/**
 * «إرسال ملاحظة»: the category, a title, a description and an optional screenshot (gallery only).
 * Success only once the server confirmed; one request however many taps; a failure keeps the text.
 */
export function FeedbackFormScreen({ space }: { space: FeedbackSpace }) {
  const { user } = useSession();
  const { colors } = useAppTheme();
  const send = useSendFeedback(user?.id ?? '', space);
  const { confirmation, confirm } = useConfirmThenBack({ pathname: '/feedback', params: { space } });
  const [category, setCategory] = useState<FeedbackCategory>('BUG');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<PickedScreenshot | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  const errors = validateFeedback({ category, title, description });
  const shown = submitted ? errors : {};
  const message = (field: string, max: number, e?: 'required' | 'tooLong') =>
    e === 'required' ? f.required(field) : e === 'tooLong' ? f.tooLong(max) : undefined;

  async function onPick() {
    setPickError(null);
    try {
      const picked = await pickScreenshot();
      if (picked) setScreenshot(picked);
    } catch (e) {
      setPickError(e instanceof ScreenshotPickFailure && e.kind === 'size' ? f.screenshotSize : f.screenshotType);
    }
  }

  async function onSubmit() {
    if (submitting.current || confirmation) return;
    setSubmitted(true);
    if (errors.title || errors.description) return;
    submitting.current = true;
    setError(null);
    try {
      await send.mutateAsync({ draft: { category, title, description }, screenshot, screenPath: `/${space}/feedback/new` });
      confirm(f.sent);
      return; // locked until the screen goes back
    } catch (e) {
      setError(classifyWorkError(e) === 'offline' ? f.offline : errorMessage(e));
    }
    submitting.current = false;
  }

  const footer = (
    <View style={[styles.footer, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {confirmation ? (
        <SuccessToast message={confirmation} />
      ) : (
        <>
          {error ? <AlertBox message={error} /> : null}
          <Button
            icon="success"
            label={send.isPending ? f.sending : f.submit}
            loading={send.isPending}
            disabled={send.isPending}
            fullWidth
            onPress={() => void onSubmit()}
          />
        </>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.flexFill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen footer={footer}>
        <Stack.Screen options={{ title: f.sendTitle }} />
        <AppText variant="small" tone="muted">
          {f.privacy}
        </AppText>
        <Card style={styles.card}>
          <AppText variant="label">{f.categoryLabel}</AppText>
          <ChipRow
            label={f.categoryLabel}
            value={category}
            onChange={setCategory}
            size="lg"
            options={FEEDBACK_CATEGORIES.map((c) => ({ value: c, label: f.category[c] }))}
          />
          <Field label={f.titleLabel} error={message(f.titleLabel, FEEDBACK_TITLE_MAX, shown.title)}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              maxLength={FEEDBACK_TITLE_MAX}
              placeholder={f.titlePlaceholder}
              placeholderTextColor={colors.mutedForeground}
              accessibilityLabel={f.titleLabel}
              returnKeyType="next"
              style={[styles.input, { color: colors.foreground, borderColor: shown.title ? colors.destructive : colors.input }]}
            />
          </Field>
          <Field label={f.descriptionLabel} error={message(f.descriptionLabel, FEEDBACK_TEXT_MAX, shown.description)}>
            <TextInput
              value={description}
              onChangeText={setDescription}
              maxLength={FEEDBACK_TEXT_MAX}
              placeholder={f.descriptionPlaceholder}
              placeholderTextColor={colors.mutedForeground}
              accessibilityLabel={f.descriptionLabel}
              multiline
              textAlignVertical="top"
              style={[styles.input, styles.multiline, { color: colors.foreground, borderColor: shown.description ? colors.destructive : colors.input }]}
            />
          </Field>
        </Card>
        <Card style={styles.card}>
          <AppText variant="label">{f.screenshot}</AppText>
          {screenshot ? (
            <View style={styles.preview}>
              <Image source={{ uri: screenshot.uri }} accessibilityLabel={f.screenshotPreview} style={styles.thumb} contentFit="cover" testID="screenshot-preview" />
              <Button variant="ghost" icon="delete" label={f.removeScreenshot} onPress={() => setScreenshot(null)} />
            </View>
          ) : (
            <Button variant="outline" icon="image" label={f.addScreenshot} onPress={() => void onPick()} />
          )}
          {pickError ? <AlertBox message={pickError} /> : (
            <AppText variant="small" tone="muted">
              {f.screenshotHint}
            </AppText>
          )}
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <AppText variant="label">
        {label}
        <AppText variant="label" tone="destructive">
          {' *'}
        </AppText>
      </AppText>
      {children}
      {error ? (
        <AppText variant="small" tone="destructive" accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

/* -------------------------------- the details -------------------------------- */

/** One of MY submissions: what I sent, its status, the screenshot and the admins' response. */
export function FeedbackDetailScreen({ space, id }: { space: FeedbackSpace; id: string }) {
  const { user } = useSession();
  const query = useMyFeedbackItem(user?.id ?? '', space, id);
  return (
    <Screen>
      <Stack.Screen options={{ title: f.detailTitle }} />
      <QueryState query={query}>{query.data ? <FeedbackDetail item={query.data} /> : <EmptyState icon="notes" title={f.notFound} />}</QueryState>
    </Screen>
  );
}

function FeedbackDetail({ item }: { item: Feedback }) {
  const { colors } = useAppTheme();
  const day = useDay();
  const shot = item.screenshot ? resolvePhoto(item.screenshot.url, getAuthBridge()?.getAccessToken() ?? null) : null;
  return (
    <>
      <Card style={styles.card}>
        <View style={styles.meta}>
          <StatusPill status={item.status} />
          <CategoryPill category={item.category} />
        </View>
        <AppText variant="heading" accessibilityRole="header">
          {item.title}
        </AppText>
        <AppText variant="small" tone="muted">
          {f.sentOn(day(item.createdAt))}
        </AppText>
        <AppText variant="body">{item.description}</AppText>
        {shot ? (
          <Image
            source={{ uri: shot.uri, headers: shot.headers, cacheKey: shot.uri }}
            cachePolicy="memory"
            contentFit="contain"
            accessibilityLabel={f.screenshotPreview}
            style={[styles.shot, { borderColor: colors.border }]}
            testID="feedback-screenshot"
          />
        ) : null}
      </Card>
      <Card style={styles.card}>
        <View style={styles.inline}>
          <Icon name="announcements" size={18} color={colors.primary} />
          <AppText variant="label">{f.response}</AppText>
        </View>
        {item.response ? (
          <View testID="feedback-response" style={styles.field}>
            <AppText variant="body">{item.response}</AppText>
            {item.respondedAt ? (
              <AppText variant="small" tone="muted">
                {day(item.respondedAt)}
              </AppText>
            ) : null}
          </View>
        ) : (
          <AppText variant="small" tone="muted">
            {f.noResponse}
          </AppText>
        )}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  flexFill: { flex: 1 },
  flex: { flex: 1, minWidth: 0, gap: spacing.xs },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  list: { gap: spacing.sm },
  item: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.md,
  },
  pressed: { opacity: 0.85 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  card: { gap: spacing.md },
  field: { gap: spacing.xs },
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
  multiline: { minHeight: 120, paddingVertical: spacing.sm },
  preview: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  thumb: { width: 96, height: 96, borderRadius: radius.lg },
  shot: { width: '100%', height: 260, borderRadius: radius.lg, borderWidth: 1 },
});
