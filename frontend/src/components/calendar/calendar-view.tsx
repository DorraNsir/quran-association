"use client"

import { CalendarPlus, Info } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { ALL, FilterBar, FilterSelect } from "@/components/shared/filters"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import {
  countActiveStudentsByClass,
  fullName,
  classTeacherIds,
  describeClass,
  isRunning,
  indexLookups,
  weeklyMinutes,
  type Lookups,
} from "@/lib/domain"
import { addDays, dateOfWeekday, startOfWeek, weekDates, weekdayOf } from "@/lib/dates"
import { countLabels, formatDate, formatDayNumber, formatDuration, formatTimeRange } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { sessionIdFor } from "@/lib/sessions"
import { useOperations } from "@/lib/store/operations"
import type { ID, ISODate, Student, WeeklySchedule } from "@/types/domain"

import { toneOf, type CalendarEntry } from "./calendar-event"
import { CalendarToolbar, type CalendarView as View } from "./calendar-toolbar"
import { formatWeekRange, fromMinutes, toMinutes, visibleHours } from "./calendar-utils"
import { MobileAgenda } from "./mobile-agenda"
import { ScheduleDetailsSheet } from "./schedule-details-sheet"
import { ScheduleFormSheet, type SchedulePreset } from "./schedule-form-sheet"
import { TimeGrid, type GridColumn } from "./time-grid"

export interface CalendarFilters {
  branch: string
  room: string
  teacher: string
  group: string
}

const NO_FILTERS: CalendarFilters = { branch: ALL, room: ALL, teacher: ALL, group: ALL }
const DEFAULT_LENGTH = 90
const mockSaved = { description: labels.common.mockNotice }

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
  const [schedules, setSchedules] = useState(lookups.schedules)
  const [date, setDate] = useState(today)
  const [view, setView] = useState<View>("week")
  const [filters, setFilters] = useState<CalendarFilters>({ ...NO_FILTERS, ...initialFilters })
  const [details, setDetails] = useState<{ entry: CalendarEntry; date: ISODate; open: boolean } | null>(null)
  const [formState, setFormState] = useState<{
    key: number
    open: boolean
    schedule?: WeeklySchedule
    preset?: SchedulePreset
  } | null>(null)
  const [removing, setRemoving] = useState<{ entry: CalendarEntry; open: boolean } | null>(null)

  const live: Lookups = { ...lookups, schedules }
  const indexes = indexLookups(live)
  const { branchesById, classesById, groupsById } = indexes
  const studentCounts = countActiveStudentsByClass(students)
  const hours = visibleHours(lookups.schedules)

  // ── Entries: one per slot of a running class; place and team come from the class ──
  const entries: CalendarEntry[] = schedules.flatMap((schedule) => {
    const groupClass = classesById.get(schedule.groupClassId)
    if (!groupClass || !isRunning(groupClass, groupsById)) return []
    const view = describeClass(groupClass, indexes)
    if (!view.group) return []
    return [
      {
        ...view,
        group: view.group,
        schedule,
        studentCount: studentCounts.get(groupClass.id) ?? 0,
        tone: Math.max(0, lookups.branches.findIndex((b) => b.id === groupClass.branchId)),
      },
    ]
  })
  // Group filter keeps every class of the group; teacher filter keeps only that teacher's classes
  const visible = entries.filter(
    ({ groupClass, group }) =>
      (filters.branch === ALL || groupClass.branchId === filters.branch) &&
      (filters.room === ALL || groupClass.roomId === filters.room) &&
      (filters.group === ALL || group.id === filters.group) &&
      (filters.teacher === ALL || classTeacherIds(groupClass).includes(filters.teacher))
  )
  const { sessions } = useOperations()
  const sessionsById = new Map(sessions.map((s) => [s.id, s]))
  /** A day's entries, each linked to its dated session (attendance, cancellation). */
  const entriesOn = (d: ISODate) =>
    visible
      .filter((e) => e.schedule.day === weekdayOf(d))
      .map((e) => ({ ...e, occurrence: sessionsById.get(sessionIdFor(e.schedule.id, d)) }))
      .sort((a, b) => a.schedule.start.localeCompare(b.schedule.start))

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

  function saveSchedule(saved: WeeklySchedule) {
    const exists = schedules.some((s) => s.id === saved.id)
    setSchedules((prev) => (exists ? prev.map((s) => (s.id === saved.id ? saved : s)) : [...prev, saved]))
    const group = groupsById.get(classesById.get(saved.groupClassId)?.groupId ?? "")
    toast.success(
      `${exists ? "تم تعديل حصة" : "تمت برمجة حصة"} ${group?.name ?? ""} — ${labels.weekday[saved.day]} ${formatTimeRange(saved.start, saved.end)}`,
      mockSaved
    )
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
    emptyHint: "انقر لبرمجة حصة في هذا الوقت",
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
      entries: entriesOn(date).filter((e) => e.groupClass.roomId === room.id),
      emptyHint: `انقر لبرمجة حصة في ${room.name}`,
      onEmptyClick: (start) => openCreate(slotPreset(date, start, room.id)),
    }))

  const weekMinutes = weeklyMinutes(visible.map((e) => e.schedule))
  const roomOptions = lookups.rooms.filter((r) => r.branchId === filters.branch)

  return (
    <>
      <PageHeader
        title="الرزنامة"
        description="من يدرس، أين، متى، ومع أي معلم — كل الحصص الأسبوعية للمجموعات النشطة في مكان واحد."
        actions={
          <Button onClick={() => openCreate()}>
            <CalendarPlus />
            برمجة حصة
          </Button>
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
              ? "انقر على يوم لعرض قاعاته، أو على وقت فارغ لبرمجة حصة."
              : "الخانات الفارغة قاعات متاحة — انقر لبرمجة حصة فيها."}
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
          title="إلغاء هذه الحصة الأسبوعية؟"
          description={`ستُحذف حصة ${removing.entry.group.name} كل ${labels.weekday[removing.entry.schedule.day]} (${formatTimeRange(removing.entry.schedule.start, removing.entry.schedule.end)}) من البرنامج الأسبوعي، وتصبح ${removing.entry.room?.name ?? "القاعة"} متاحة في هذا الوقت.`}
          confirmLabel="إلغاء الحصة"
          onConfirm={() => {
            const { schedule, group } = removing.entry
            setSchedules((prev) => prev.filter((s) => s.id !== schedule.id))
            setDetails(null)
            toast.success(`تم إلغاء حصة ${group.name} — ${labels.weekday[schedule.day]}`, mockSaved)
          }}
        />
      )}
    </>
  )
}
