import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { EmptyState, QueryState } from "@/components/feedback";
import {
  AlertBox,
  AppText,
  Button,
  Card,
  ChipRow,
  FilterChip,
  InitialsAvatar,
  PressableRow,
  Screen,
} from "@/components/ui";
import { useSession } from "@/features/auth/auth-provider";
import { usePreferences } from "@/features/preferences/preferences";
import { ar } from "@/i18n/ar";
import { formatDate, ltr } from "@/i18n/format";
import { radius, spacing, useAppTheme } from "@/theme";

import {
  currentSemester,
  memorizationProgress,
  platformClock,
  teacherClasses,
} from "./dashboard-model";
import {
  memorizationRoster,
  platformDateOf,
  SEMESTERS,
  semesterNotStarted,
} from "./memorization-model";
import type { Semester } from "./types";
import { useClassMemorization } from "./use-memorization";
import { useTeacherWorkspace } from "./use-teacher-dashboard";
import { usePullToRefresh } from "./use-refresh";

const m = ar.memorization;

/**
 * «متابعة الحفظ» (read-only): for one of MY classes and one semester of the
 * current academic year, each active student's LAST MEMORIZED SURAH as
 * recorded by the class's teachers (GET /teacher/group-classes/:id/memorization).
 * Teachers only see the current academic year (as on the web: the list of
 * years is an admin endpoint).
 */
export function TeacherMemorizationScreen({
  initialClassId,
}: {
  initialClassId?: string;
}) {
  const { user } = useSession();
  const teacherId = user?.teacherId ?? "";
  const router = useRouter();
  const { colors } = useAppTheme();
  const preferences = usePreferences();
  const workspace = useTeacherWorkspace(teacherId);
  const timeZone = preferences.data?.timezone;
  const clock = platformClock(timeZone);
  const year = preferences.data?.currentAcademicYear ?? null;
  const classes = workspace.data ? teacherClasses(workspace.data) : [];

  const [pickedSemester, setSemester] = useState<Semester>();
  const [pickedClassId, setClassId] = useState<string | undefined>(
    initialClassId,
  );
  const [onlyMissing, setOnlyMissing] = useState(false);
  const thisSemester = year ? currentSemester(year, clock.today) : "FIRST";
  const semester = pickedSemester ?? thisSemester;
  // A class of mine only (a crafted id falls back to the first one)
  const classId = classes.some((c) => c.id === pickedClassId)
    ? pickedClassId!
    : (classes[0]?.id ?? null);

  const memo = useClassMemorization(teacherId, classId, year, semester);
  const { refreshing, onRefresh } = usePullToRefresh([
    ["teacher", teacherId, "memorization", classId, year?.id, semester],
  ]);

  const rows = memo.data ? memorizationRoster(memo.data) : [];
  const progress = memo.data ? memorizationProgress(memo.data) : null;
  const missing = rows.filter((r) => r.surahNumber === null);
  const shown = onlyMissing ? missing : rows;

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <QueryState query={[preferences, workspace]}>
        {!year ? (
          <EmptyState icon="classes" title={m.noYear} />
        ) : classes.length === 0 ? (
          <EmptyState icon="classes" title={m.noClasses} />
        ) : (
          <>
            <View style={styles.filters}>
              <AppText variant="small" tone="muted">
                {ltr(year.label)}
              </AppText>
              <ChipRow
                label={m.pickSemester}
                value={semester}
                onChange={setSemester}
                options={SEMESTERS.map((value) => ({
                  value,
                  label:
                    value === thisSemester
                      ? `${ar.labels.semester[value]} · ${m.currentSemester}`
                      : ar.labels.semester[value],
                }))}
              />
              {classes.length > 1 ? (
                <ChipRow
                  label={m.pickClass}
                  value={classId ?? ""}
                  onChange={setClassId}
                  options={classes.map((c) => ({
                    value: c.id,
                    label: c.groupName,
                  }))}
                />
              ) : null}
            </View>

            {semesterNotStarted(year, semester, clock.today) ? (
              <AlertBox tone="info" message={m.notStarted} />
            ) : null}

            <Card>
              <QueryState query={memo}>
                {progress ? (
                  <View style={styles.summary}>
                    <View style={styles.inline}>
                      <AppText variant="bodyStrong" style={styles.flex}>
                        {memo.data?.groupClass.group.name}
                      </AppText>
                      <AppText variant="small" tone="muted">
                        {m.recorded(progress.recorded, progress.total)}
                      </AppText>
                    </View>
                    <View
                      style={[styles.bar, { backgroundColor: colors.muted }]}
                      accessibilityElementsHidden
                    >
                      <View
                        style={[
                          styles.barFill,
                          {
                            backgroundColor: colors.primary,
                            width: `${progress.total ? Math.round((progress.recorded / progress.total) * 100) : 0}%`,
                          },
                        ]}
                      />
                    </View>
                    {missing.length > 0 ? (
                      <View style={styles.inline}>
                        <FilterChip
                          label={m.onlyMissing(missing.length)}
                          selected={onlyMissing}
                          onPress={() => setOnlyMissing(!onlyMissing)}
                        />
                      </View>
                    ) : null}
                  </View>
                ) : null}
                {rows.length === 0 ? (
                  <EmptyState icon="students" title={m.noStudents} />
                ) : shown.length === 0 ? (
                  <EmptyState icon="success" title={m.allDone} />
                ) : (
                  shown.map((r, i) => (
                    <View
                      key={r.studentId}
                      style={[
                        styles.memoRow,
                        i > 0 && {
                          borderTopWidth: StyleSheet.hairlineWidth,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <View style={styles.flex}>
                        <PressableRow
                          bordered={false}
                          accessibilityLabel={`${r.name}، ${m.lastSurah}: ${r.surahName ?? m.notSet}`}
                          onPress={() =>
                            router.push({
                              pathname: "/teacher/students/[id]/memorization",
                              params: { id: r.studentId },
                            })
                          }
                        >
                          <View style={styles.row}>
                            <InitialsAvatar name={r.name} size={36} />
                            <View style={styles.flex}>
                              <AppText variant="body" numberOfLines={1}>
                                {r.name}
                              </AppText>
                              {r.surahName ? (
                                <AppText variant="small" tone="primary">
                                  {m.lastSurah}: {r.surahName}
                                </AppText>
                              ) : (
                                <AppText variant="small" tone="warning">
                                  {m.notSet}
                                </AppText>
                              )}
                            </View>
                            {r.updatedAt ? (
                              <AppText variant="small" tone="muted">
                                {formatDate(
                                  platformDateOf(r.updatedAt, timeZone),
                                )}
                              </AppText>
                            ) : null}
                          </View>
                        </PressableRow>
                      </View>
                      <Button
                        variant={r.surahNumber === null ? "primary" : "outline"}
                        label={m.update}
                        accessibilityLabel={`${m.formTitle}: ${r.name}`}
                        onPress={() =>
                          router.push({
                            pathname:
                              "/teacher/students/[id]/memorization/record",
                            params: { id: r.studentId, semester },
                          })
                        }
                      />
                    </View>
                  ))
                )}
              </QueryState>
            </Card>
            <AppText variant="small" tone="muted">
              {m.rule} {m.sharedRecord}
            </AppText>
          </>
        )}
      </QueryState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { gap: spacing.sm },
  memoRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  summary: { gap: spacing.sm, paddingBottom: spacing.xs },
  inline: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  bar: { height: 8, borderRadius: radius.full, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: radius.full },
  flex: { flex: 1 },
});
