"use client"

import { CalendarRange, Info } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { ALL, FilterBar, FilterSelect } from "@/components/shared/filters"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  countActiveStudentsByClass,
  fullName,
  classTeacherIds,
  describeClass,
  isRunning,
  indexLookups,
  weeklyMinutes,
  type ClassView,
  type Lookups,
} from "@/lib/domain"
import { addDays, dateOfWeekday, startOfWeek, weekDates, weekdayOf } from "@/lib/dates"
import { countLabels, formatDate, formatDayNumber, formatDuration, formatTimeRange } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { keys, useApiMutation } from "@/lib/api/academic"
import { api } from "@/lib/api/client"
import { toSession, useSessionRange } from "@/lib/api/sessions"
import type { Group, ID, ISODate, Student, WeeklySchedule } from "@/types/domain"

import { toneOf, type CalendarEntry } from "./calendar-event"
import { CalendarToolbar, type CalendarView as View } from "./calendar-toolbar"
import { formatWeekRange, fromMinutes, toMinutes, visibleHours } from "./calendar-utils"
import { MobileAgenda } from "./mobile-agenda"
import { ScheduleDetailsSheet } from "./schedule-details-sheet"
import { ScheduleFormSheet, type SchedulePreset } from "./schedule-form-sheet"
import { ExtraSessionButton, useSaveWeeklySlot } from "./scheduling-actions"
import { TimeGrid, type GridColumn } from "./time-grid"
import { usePlatformSettings } from "@/lib/store/settings"

export interface CalendarFilters {
  branch: string
  room: string
  teacher: string
  group: string
}

const NO_FILTERS: CalendarFilters = { branch: ALL, room: ALL, teacher: ALL, group: ALL }
const DEFAULT_LENGTH = 90

export function CalendarView({
  lookups,
  students,
  today,
  initialFilters,
}: {
  lookups: Lookups
  students: Student[]
  today: ISODate
  initialFilters: Partial<CalendarFilters>
}) {
  const schedules = lookups.schedules
  const [date, setDate] = useState(today)
  // Initial view = platform preference; the toolbar still switches freely
  const { defaultCalendarView } = usePlatformSettings()
  const [view, setView] = useState<View>(defaultCalendarView)
  const [filters, setFilters] = useState<CalendarFilters>({ ...NO_FILTERS, ...initialFilters })
  const [details, setDetails] = useState<{ entry: CalendarEntry; date: ISODate; open: boolean } | null>(null)
  const [formState, setFormState] = useState<{
    key: number
    open: boolean
    schedule?: WeeklySchedule
    preset?: SchedulePreset
  } | null>(null)
  const [removing, setRemoving] = useState<{ entry: CalendarEntry; open: boolean } | null>(null)
  const [cancelling, setCancelling] = useState<{ entry: CalendarEntry; open: boolean } | null>(null)
  const [cancelReason, setCancelReason] = useState("")

  const live: Lookups = { ...lookups, schedules }
  const indexes = indexLookups(live)
  const { branchesById, classesById, groupsById, roomsById } = indexes
  const studentCounts = countActiveStudentsByClass(students)

  /**
   * «حصة مشتركة»: ONE entry for the lesson of several classes — every
   * participating group (its name reads «أركان + الماهر»), the students of
   * all of them, and the team of all of them (one supervisor).
   */
  const sharedPart = (view: ClassView & { group: Group }, groupClassId: ID, extraIds: ID[]) => {
    const extras = extraIds.flatMap((id) => {
      const c = classesById.get(id)
      return c ? [describeClass(c, indexes)] : []
    })
    if (extras.length === 0) return { studentCount: studentCounts.get(groupClassId) ?? 0 }
    const groups = [view.group, ...extras.flatMap((e) => (e.group ? [e.group] : []))]
    return {
      group: { ...view.group, name: groups.map((g) => g.name).join(" + ") },
      sharedGroups: groups,
      assistants: [...view.assistants, ...extras.flatMap((e) => e.assistants)].filter(
        (t, i, all) => all.findIndex((x) => x.id === t.id) === i
      ),
      studentCount: [groupClassId, ...extraIds].reduce((n, id) => n + (studentCounts.get(id) ?? 0), 0),
      teamIds: [...new Set([view.groupClass, ...extras.map((e) => e.groupClass)].flatMap(classTeacherIds))],
    }
  }

  // ── Entries: one per slot of a running class; place and team come from the class ──
  const entries: CalendarEntry[] = schedules.flatMap((schedule) => {
    const groupClass = classesById.get(schedule.groupClassId)
    if (!groupClass || !isRunning(groupClass, groupsById)) return []
    const view = describeClass(groupClass, indexes)
    if (!view.group) return []
    const withGroup = { ...view, group: view.group }
    return [
      {
        ...withGroup,
        schedule,
        room: roomsById.get(schedule.roomId),
        tone: Math.max(0, lookups.branches.findIndex((b) => b.id === groupClass.branchId)),
        ...sharedPart(withGroup, groupClass.id, schedule.additionalGroupClassIds ?? []),
      },
    ]
  })
  /** Filters match ANY participating class of a shared lesson (group, teacher). */
  const matches = (e: CalendarEntry & { teamIds?: ID[] }) =>
    (filters.branch === ALL || e.groupClass.branchId === filters.branch) &&
    (filters.group === ALL || (e.sharedGroups ?? [e.group]).some((g) => g.id === filters.group)) &&
    (filters.teacher === ALL || (e.teamIds ?? classTeacherIds(e.groupClass)).includes(filters.teacher))
  // Group filter keeps every class of the group; teacher filter keeps only that teacher's classes
  const visible = entries.filter((e) => matches(e) && (filters.room === ALL || e.schedule.roomId === filters.room))
  // Dated sessions of the displayed week (cancellations, attendance) — from the API
  const week = weekDates(date)
  const sessionsQuery = useSessionRange("admin", { from: week[0].date, to: week[week.length - 1].date })
  const occurrences = new Map((sessionsQuery.data ?? []).map((s) => [`${s.weeklyScheduleId}|${s.date}`, toSession(s)]))
  // Sessions without a weekly slot, each an entry of its own date: extra
  // sessions, and the kept (not cancelled) lessons of a deleted slot
  const extras: CalendarEntry[] = (sessionsQuery.data ?? []).flatMap((s) => {
    if (s.weeklyScheduleId || (!s.isExtra && s.status === "CANCELLED")) return []
    const groupClass = classesById.get(s.groupClass.id)
    if (!groupClass) return []
    const view = describeClass(groupClass, indexes)
    if (!view.group) return []
    const session = toSession(s)
    const withGroup = { ...view, group: view.group }
    const extraIds = (s.additionalClasses ?? []).map((c) => c.id)
    return [
      {
        ...withGroup,
        schedule: {
          id: `extra-${s.id}`,
          groupClassId: groupClass.id,
          additionalGroupClassIds: extraIds,
          day: weekdayOf(s.date),
          start: s.startTime,
          end: s.endTime,
          roomId: s.room.id,
        },
        room: roomsById.get(s.room.id),
        tone: Math.max(0, lookups.branches.findIndex((b) => b.id === groupClass.branchId)),
        occurrence: session,
        detached: true,
        extra: s.isExtra,
        ...sharedPart(withGroup, groupClass.id, extraIds),
      },
    ]
  })
  const visibleExtras = extras.filter(matches)
  /** A day's entries, each linked to its dated session (attendance, cancellation). */
  const entriesOn = (d: ISODate) =>
    visible
      .filter((e) => e.schedule.day === weekdayOf(d))
      .map((e): CalendarEntry => {
        const occurrence = occurrences.get(`${e.schedule.id}|${d}`)
        // A session keeps its own room (moved for one date, or planned before a slot's room change)
        const room = occurrence ? (roomsById.get(occurrence.roomId) ?? e.room) : e.room
        return { ...e, occurrence, room }
      })
      .concat(visibleExtras.filter((e) => e.occurrence?.date === d))
      .filter((e) => filters.room === ALL || e.room?.id === filters.room)
      .sort((a, b) => a.schedule.start.localeCompare(b.schedule.start))

  const hours = visibleHours([...lookups.schedules, ...extras.map((e) => e.schedule)])

  const setFilter = (key: keyof CalendarFilters) => (value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value, ...(key === "branch" ? { room: ALL } : {}) }))
  const hasActiveFilters = Object.values(filters).some((v) => v !== ALL)

  // ── Actions ──
  /** Filtering on a group that has a single running class pre-selects that class */
  const presetFromFilters = (): SchedulePreset => {
    const running = live.groupClasses.filter((c) => c.groupId === filters.group && isRunning(c, groupsById))
    return {
      ...(filters.group !== ALL && running.length === 1 ? { groupClassId: running[0].id } : {}),
      ...(filters.room !== ALL ? { roomId: filters.room } : {}),
    }
  }
  const openCreate = (preset?: SchedulePreset) =>
    setFormState((prev) => ({ key: (prev?.key ?? 0) + 1, open: true, preset: { ...presetFromFilters(), ...preset } }))
  const slotPreset = (day: ISODate, start: string, roomId?: ID): SchedulePreset => ({
    day: weekdayOf(day),
    start,
    end: fromMinutes(toMinutes(start) + DEFAULT_LENGTH),
    ...(roomId ? { roomId } : {}),
  })

  const saveWeeklySlot = useSaveWeeklySlot(live)
  /** Cancels one dated session only (PATCH status → CANCELLED); the weekly slot is untouched */
  const cancelSessionMutation = useApiMutation(
    ({ id, reason }: { id: ID; reason?: string }) =>
      api(`/admin/sessions/${id}/status`, { method: "PATCH", body: { status: "CANCELLED", cancellationReason: reason } }),
    [keys.sessions]
  )
  const removeMutation = useApiMutation(
    (schedule: WeeklySchedule) => api(`/admin/group-classes/${schedule.groupClassId}/schedules/${schedule.id}`, { method: "DELETE" }),
    [keys.schedules, keys.sessions]
  )

  async function saveSchedule(saved: WeeklySchedule) {
    await saveWeeklySlot(saved)
    setFormState((s) => (s ? { ...s, open: false } : s))
    setDetails(null)
    setDate(dateOfWeekday(date, saved.day))
  }

  // ── Period navigation ──
  const step = view === "week" ? 7 : 1
  const isCurrentPeriod = view === "week" ? startOfWeek(date) === startOfWeek(today) : date === today
  const periodLabel =
    view === "week" ? formatWeekRange(date) : `${labels.weekday[weekdayOf(date)]} ${formatDate(date)}`

  // ── Columns ──
  const weekColumns: GridColumn[] = weekDates(date).map(({ weekday, date: d }) => ({
    key: d,
    isToday: d === today,
    header: (
      <button type="button" className="w-full rounded-md hover:text-primary" onClick={() => { setDate(d); setView("rooms") }}>
        <span className="block text-xs text-muted-foreground">{labels.weekday[weekday]}</span>
        <span className="text-lg font-semibold tabular-nums">{formatDayNumber(d)}</span>
      </button>
    ),
    entries: entriesOn(d),
    emptyHint: "انقر لبرمجة موعد أسبوعي في هذا الوقت",
    onEmptyClick: (start) => openCreate(slotPreset(d, start)),
  }))

  const roomColumns: GridColumn[] = lookups.rooms
    .filter((room) => {
      const branch = branchesById.get(room.branchId)
      return (
        room.status === "ACTIVE" &&
        branch?.status === "ACTIVE" &&
        (filters.branch === ALL || room.branchId === filters.branch) &&
        (filters.room === ALL || room.id === filters.room)
      )
    })
    .map((room) => ({
      key: room.id,
      isToday: date === today,
      header: (
        <>
          <span className="block font-medium">{room.name}</span>
          <span className="flex items-center justify-center gap-1 truncate text-[0.7rem] text-muted-foreground">
            <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${toneOf(lookups.branches.findIndex((b) => b.id === room.branchId)).dot}`} />
            <span className="truncate">{branchesById.get(room.branchId)?.name}</span>
          </span>
        </>
      ),
      entries: entriesOn(date).filter((e) => e.room?.id === room.id),
      emptyHint: `انقر لبرمجة موعد أسبوعي في ${room.name}`,
      onEmptyClick: (start) => openCreate(slotPreset(date, start, room.id)),
    }))

  const weekMinutes = weeklyMinutes(visible.map((e) => e.schedule))
  const roomOptions = lookups.rooms.filter((r) => r.branchId === filters.branch)

  return (
    <>
      <PageHeader
        title="الرزنامة"
        description="من يدرس، أين، متى، ومع أي معلم — المواعيد الأسبوعية للمجموعات النشطة والحصص الإضافية في مكان واحد."
        actions={
          <>
            <Button onClick={() => openCreate()}>
              <CalendarRange />
              برمجة موعد أسبوعي
            </Button>
            <ExtraSessionButton
              lookups={live}
              students={students}
              preset={() => {
                const p = presetFromFilters()
                return { groupClassId: p.groupClassId, roomId: p.roomId, date: view === "week" ? undefined : date }
              }}
            />
          </>
        }
      />

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onReset={() => setFilters(NO_FILTERS)}
        resultLabel={`${countLabels.sessions(visible.length)} أسبوعيًا · ${formatDuration(weekMinutes)}`}
      >
        <FilterSelect
          label="الفرع"
          allLabel="كل الفروع"
          value={filters.branch}
          onValueChange={setFilter("branch")}
          options={lookups.branches.filter((b) => b.status === "ACTIVE").map((b) => ({ value: b.id, label: b.name }))}
        />
        <FilterSelect
          label="القاعة"
          allLabel={filters.branch === ALL ? "كل القاعات (اختر فرعًا)" : "كل القاعات"}
          value={filters.room}
          onValueChange={setFilter("room")}
          disabled={filters.branch === ALL}
          options={roomOptions.map((r) => ({ value: r.id, label: r.name }))}
        />
        <FilterSelect
          label="المعلم"
          allLabel="كل المعلمين"
          value={filters.teacher}
          onValueChange={setFilter("teacher")}
          options={lookups.teachers.filter((t) => t.status === "ACTIVE").map((t) => ({ value: t.id, label: fullName(t) }))}
        />
        <FilterSelect
          label="المجموعة"
          allLabel="كل المجموعات"
          value={filters.group}
          onValueChange={setFilter("group")}
          options={lookups.groups.filter((g) => g.status === "ACTIVE").map((g) => ({ value: g.id, label: g.name }))}
        />
      </FilterBar>

      <div className="mb-4 space-y-3">
        <CalendarToolbar
          label={periodLabel}
          isCurrentPeriod={isCurrentPeriod}
          view={view}
          onViewChange={setView}
          onToday={() => setDate(today)}
          onPrevious={() => setDate(addDays(date, -step))}
          onNext={() => setDate(addDays(date, step))}
          periodName={view === "week" ? "الأسبوع" : "اليوم"}
        />
        <div className="hidden flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground md:flex">
          {lookups.branches
            .filter((b) => b.status === "ACTIVE")
            .map((b) => (
              <span key={b.id} className="inline-flex items-center gap-1.5">
                <span aria-hidden className={`size-2 rounded-full ${toneOf(lookups.branches.indexOf(b)).dot}`} />
                {b.name}
              </span>
            ))}
          <span className="inline-flex items-center gap-1.5 ms-auto">
            <Info className="size-3.5" aria-hidden />
            {view === "week"
              ? "انقر على يوم لعرض قاعاته، أو على وقت فارغ لبرمجة موعد أسبوعي."
              : "الخانات الفارغة قاعات متاحة — انقر لبرمجة موعد أسبوعي فيها."}
          </span>
        </div>
      </div>

      <div className="hidden md:block">
        {view === "week" ? (
          <TimeGrid columns={weekColumns} hours={hours} onOpen={(entry) => setDetails({ entry, date: dateOfWeekday(date, entry.schedule.day), open: true })} />
        ) : roomColumns.length === 0 ? (
          <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">لا توجد قاعات نشطة مطابقة لعوامل التصفية.</p>
        ) : (
          <TimeGrid
            columns={roomColumns}
            hours={hours}
            showBranch={false}
            minColumnWidth={8.5}
            onOpen={(entry) => setDetails({ entry, date, open: true })}
          />
        )}
      </div>

      <div className="md:hidden">
        <MobileAgenda
          date={date}
          today={today}
          entriesByDay={entriesOn}
          onSelectDate={setDate}
          onOpen={(entry) => setDetails({ entry, date, open: true })}
          onCreate={() => openCreate({ day: weekdayOf(date) })}
        />
      </div>

      <ScheduleDetailsSheet
        entry={details?.entry ?? null}
        date={details?.date}
        open={Boolean(details?.open)}
        onOpenChange={(open) => !open && setDetails((d) => (d ? { ...d, open: false } : d))}
        onEdit={(entry) =>
          setFormState((prev) => ({ key: (prev?.key ?? 0) + 1, open: true, schedule: entry.schedule }))
        }
        onRemove={(entry) => setRemoving({ entry, open: true })}
        onCancelSession={(entry) => {
          setCancelReason("")
          setCancelling({ entry, open: true })
        }}
      />

      {formState && (
        <ScheduleFormSheet
          key={formState.key}
          open={formState.open}
          onOpenChange={(open) => !open && setFormState((s) => (s ? { ...s, open: false } : s))}
          schedule={formState.schedule}
          preset={formState.preset}
          lookups={live}
          students={students}
          onSave={saveSchedule}
        />
      )}

      {removing && (
        <ConfirmDialog
          open={removing.open}
          onOpenChange={(open) => !open && setRemoving((r) => (r ? { ...r, open: false } : r))}
          destructive
          title="حذف هذا الموعد الأسبوعي؟"
          description={`سيُحذف موعد ${removing.entry.group.name} كل ${labels.weekday[removing.entry.schedule.day]} (${formatTimeRange(removing.entry.schedule.start, removing.entry.schedule.end)}) من البرنامج الأسبوعي، وتصبح ${removing.entry.room?.name ?? "القاعة"} متاحة في هذا الوقت. تُلغى حصصه القادمة التي لم يُسجَّل حضورها، وتبقى الحصص السابقة وسجلات الحضور كما هي.`}
          confirmLabel="حذف الموعد الأسبوعي"
          onConfirm={async () => {
            const { schedule, group } = removing.entry
            await removeMutation.mutateAsync(schedule)
            setRemoving((r) => (r ? { ...r, open: false } : r))
            setDetails(null)
            toast.success(`تم حذف موعد ${group.name} — ${labels.weekday[schedule.day]}`, {
              description: "أُلغيت حصصه القادمة غير المسجّلة.",
            })
          }}
        />
      )}

      {cancelling?.entry.occurrence && (
        <ConfirmDialog
          open={cancelling.open}
          onOpenChange={(open) => !open && setCancelling((c) => (c ? { ...c, open: false } : c))}
          destructive
          title="إلغاء حصة هذا اليوم؟"
          description={`تُلغى حصة ${cancelling.entry.group.name} يوم ${formatDate(cancelling.entry.occurrence.date)} (${formatTimeRange(cancelling.entry.occurrence.start, cancelling.entry.occurrence.end)}) فقط: تبقى ظاهرة كـ«ملغاة» ولا يُنتظر تسجيل حضورها، ويبقى الموعد الأسبوعي كما هو. يمكن استعادتها من صفحة الحصة.`}
          confirmLabel="إلغاء الحصة"
          onConfirm={async () => {
            const { occurrence, group } = cancelling.entry
            await cancelSessionMutation.mutateAsync({ id: occurrence!.id, reason: cancelReason.trim() || undefined })
            setCancelling((c) => (c ? { ...c, open: false } : c))
            setDetails(null)
            toast.success(`أُلغيت حصة ${group.name} — ${formatDate(occurrence!.date)}`)
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="cancel-session-reason">سبب الإلغاء (اختياري)</Label>
            <Textarea id="cancel-session-reason" rows={2} maxLength={300} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
          </div>
        </ConfirmDialog>
      )}
    </>
  )
}
