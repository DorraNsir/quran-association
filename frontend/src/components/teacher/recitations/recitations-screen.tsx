"use client"

import {
  BookOpen,
  CalendarClock,
  CircleCheck,
  CircleMinus,
  CircleSlash,
  CircleX,
  Clock,
  Layers,
  Mic,
  Plus,
  UserRoundSearch,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"

import { EmptyState } from "@/components/shared/empty-state"
import { ALL, FilterSelect, matchesText, SearchInput } from "@/components/shared/filters"
import { PageHeader } from "@/components/shared/page-header"
import { QueryState } from "@/components/shared/query-state"
import { UserAvatar } from "@/components/shared/user-avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { StudentCombobox } from "@/components/teacher/work-followup/student-combobox"
import { useWorkFollowup } from "@/components/teacher/work-followup/work-followup-provider"
import { programHref } from "@/components/teacher/work-followup/work-program-card"
import { useRecitationHistory } from "@/lib/api/work-followup"
import { formatDate } from "@/lib/format"
import {
  ayahCount,
  postponedTimes,
  RECITATION_RESULT_SHORT,
  RECITATION_RESULTS,
  recitationColumns,
  recitationsCount,
  recitationTitle,
  type RecitationColumn,
  type RecitationEntry,
} from "@/lib/quran-reference/work-assignment"
import { SURAHS } from "@/lib/quran/surahs"
import { cn } from "@/lib/utils"
import type { RecitationAttempt, RecitationSurahHistory } from "@/types/work-followup"

/** The module's own address: a student and, optionally, one surah (the «سجل العرضات» deep link). */
export const recitationsModuleHref = (studentId: string, surah?: number) =>
  `/teacher/recitations?student=${studentId}${surah ? `&surah=${surah}` : ""}`

/** Icon + tone per result: the words always say it too (never colour alone). */
export const RESULT_LOOK: Record<RecitationEntry, { icon: LucideIcon; tone: string }> = {
  COMPLETED: { icon: CircleCheck, tone: "bg-brand-soft text-brand-soft-foreground" },
  PARTIAL: { icon: CircleMinus, tone: "bg-warning-soft text-warning" },
  NOT_COMPLETED: { icon: CircleX, tone: "bg-destructive/10 text-destructive" },
  CANCELLED: { icon: CircleSlash, tone: "bg-muted text-muted-foreground" },
  POSTPONED: { icon: CalendarClock, tone: "bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300" },
  PENDING: { icon: Clock, tone: "border border-dashed text-muted-foreground" },
  SESSION_CANCELLED: { icon: CircleSlash, tone: "border border-dashed text-muted-foreground" },
}

type Scope = "history" | "all"

interface SurahRow {
  surah: number
  name: string
  ayahs: number
  history: RecitationSurahHistory | null
  columns: RecitationColumn<RecitationAttempt>[]
}

/**
 * «متابعة العرضات» — the module (teachers): choose one of MY students (by class, searchable, with
 * their photos), then one row per surah — the surahs with recitations, or all 114 — and one column
 * per numbered recitation (العرضة 1، 2، …), each cell its result and session date, opening the
 * program it belongs to. A postponed recitation and its rescheduled continuation share one column
 * (same number). Everything comes from GET /teacher/students/:id/recitations (one student at a
 * time, the API checks the teacher may see them); «إضافة عرضة» opens the usual Work Program form,
 * prefilled. No numbering, no counting here: the server's numbers and counts, grouped for display.
 */
export function RecitationsScreen({ initialStudentId, initialSurah }: { initialStudentId?: string; initialSurah?: number }) {
  const { students, classes, openCreate } = useWorkFollowup()
  const [classId, setClassId] = useState(ALL)
  const [studentId, setStudentId] = useState(initialStudentId ?? "")
  const [search, setSearch] = useState("")
  const [scope, setScope] = useState<Scope>("history")
  const [result, setResult] = useState(ALL)
  const [focus, setFocus] = useState<number | null>(initialSurah ?? null)

  const options = classId === ALL ? students : students.filter((s) => s.groupClassId === classId)
  const student = students.find((s) => s.id === studentId) ?? null
  const studentClass = student ? classes.find((c) => c.id === student.groupClassId) : undefined

  function chooseStudent(id: string) {
    setStudentId(id)
    setFocus(null)
    // keep the address shareable (and the back button sensible) without a navigation
    if (typeof window !== "undefined") window.history.replaceState(null, "", recitationsModuleHref(id))
  }

  return (
    <>
      <PageHeader
        title="متابعة العرضات"
        description="سجل عرضات الطلبة لكل سورة، مع نتائجها وتواريخها"
        actions={
          student && (
            <Button onClick={() => openCreate({ studentId: student.id })}>
              <Plus />
              إضافة عرضة
            </Button>
          )
        }
      />

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
        <div className="lg:w-72">
          <StudentCombobox id="rec-student" value={studentId} onChange={chooseStudent} students={options} classes={classes} />
        </div>
        <FilterSelect
          label="القسم"
          value={classId}
          onValueChange={setClassId}
          allLabel="كل الأقسام"
          options={classes.map((c) => ({ value: c.id, label: c.label }))}
        />
      </div>

      {!student ? (
        <EmptyState
          icon={UserRoundSearch}
          title="اختر طالبًا"
          description="اختر أحد طلبة أقسامك لعرض عرضاته لكل سورة."
          className="rounded-xl border bg-card py-12"
        />
      ) : (
        <StudentRecitationsTable
          key={student.id}
          studentId={student.id}
          name={`${student.firstName} ${student.lastName}`}
          photoUrl={student.photoUrl}
          classLabel={studentClass?.label}
          search={search}
          onSearch={setSearch}
          scope={focus ? "all" : scope}
          onScope={(s) => {
            setScope(s)
            setFocus(null)
          }}
          result={result}
          onResult={setResult}
          focus={focus}
          onAdd={(surah) => openCreate({ studentId: student.id, recitationSurah: surah })}
        />
      )}
    </>
  )
}

function StudentRecitationsTable({
  studentId,
  name,
  photoUrl,
  classLabel,
  search,
  onSearch,
  scope,
  onScope,
  result,
  onResult,
  focus,
  onAdd,
}: {
  studentId: string
  name: string
  photoUrl: string | null
  classLabel?: string
  search: string
  onSearch: (value: string) => void
  scope: Scope
  onScope: (scope: Scope) => void
  result: string
  onResult: (value: string) => void
  focus: number | null
  onAdd: (surah: number) => void
}) {
  const query = useRecitationHistory(studentId)
  const histories = useMemo(() => new Map((query.data?.surahs ?? []).map((h) => [h.surah, h])), [query.data])

  const rows: SurahRow[] = useMemo(
    () =>
      SURAHS.map((s) => {
        const history = histories.get(s.number) ?? null
        return { surah: s.number, name: `سورة ${s.nameAr}`, ayahs: ayahCount(s.number), history, columns: history ? recitationColumns(history.entries) : [] }
      }),
    [histories]
  )
  const visible = rows.filter(
    (r) =>
      (scope === "all" || r.history) &&
      (!search || matchesText(r.name, search) || String(r.surah) === search.trim()) &&
      (result === ALL || r.columns.some((c) => c.result.entry === result))
  )
  const width = Math.max(1, ...visible.map((r) => r.columns.length))

  // Totals of the student's recitations (server counts; one per displayed recitation)
  const all = rows.flatMap((r) => r.columns)
  const totals = RECITATION_RESULTS.map((entry) => ({ entry, count: all.filter((c) => c.result.entry === entry).length })).filter((t) => t.count > 0)
  const attempts = [...histories.values()].reduce((n, h) => n + h.attempts, 0)

  const focusRef = useRef<HTMLTableRowElement>(null)
  useEffect(() => {
    if (focus && query.data) focusRef.current?.scrollIntoView?.({ block: "center" })
  }, [focus, query.data])

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(16rem,22rem)_1fr]">
        <Card className="flex-row items-center gap-3 p-4">
          <UserAvatar name={name} photoUrl={photoUrl ?? undefined} size="lg" />
          <div className="min-w-0">
            <p className="truncate font-semibold">{name}</p>
            {classLabel && <p className="truncate text-xs text-muted-foreground">{classLabel}</p>}
          </div>
        </Card>
        <Card className="p-4" aria-label="ملخص العرضات">
          {query.data ? (
            <ul className="flex flex-wrap items-center gap-2" data-recitation-totals>
              <li className="inline-flex items-center gap-1.5 rounded-lg bg-muted/60 px-3 py-1.5 text-sm">
                <Layers className="size-4 text-primary" aria-hidden />
                <span className="font-semibold tabular-nums">{attempts}</span>
                <span className="text-muted-foreground">{attempts === 1 ? "عرضة" : "عرضات"}</span>
              </li>
              {totals.map(({ entry, count }) => {
                const { icon: Icon, tone } = RESULT_LOOK[entry]
                return (
                  <li key={entry} data-total={entry} className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm", tone)}>
                    <Icon className="size-4" aria-hidden />
                    <span className="font-semibold tabular-nums">{count}</span>
                    {RECITATION_RESULT_SHORT[entry]}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">…</p>
          )}
        </Card>
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <SearchInput value={search} onChange={onSearch} placeholder="ابحث عن سورة…" label="البحث عن سورة" className="lg:max-w-xs" />
        <div role="radiogroup" aria-label="السور المعروضة" className="inline-flex w-fit rounded-lg border bg-card p-1">
          {(
            [
              ["history", "السور ذات العرضات"],
              ["all", "كل السور"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={scope === value}
              onClick={() => onScope(value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                scope === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <FilterSelect
          label="النتيجة"
          value={result}
          onValueChange={onResult}
          allLabel="كل النتائج"
          options={RECITATION_RESULTS.map((r) => ({ value: r, label: RECITATION_RESULT_SHORT[r] }))}
        />
      </div>

      <QueryState
        query={query}
        empty={visible.length === 0}
        emptyIcon={Mic}
        emptyTitle={histories.size === 0 && scope === "history" ? "لا توجد عرضات بعد" : "لا توجد سور مطابقة"}
        emptyDescription={histories.size === 0 && scope === "history" ? "اعرض «كل السور» لإضافة أول عرضة." : undefined}
      >
        <Card className="gap-0 overflow-hidden p-0">
          <div className="overflow-x-auto" data-recitations-scroll>
            <table className="w-full min-w-max border-separate border-spacing-0 text-sm" aria-label={`عرضات ${name}`}>
              <thead>
                <tr className="bg-muted/50 text-xs text-muted-foreground">
                  <th scope="col" className="sticky start-0 z-10 border-b bg-muted px-4 py-3 text-start font-medium">
                    السورة
                  </th>
                  <th scope="col" className="border-b px-3 py-3 font-medium">
                    عدد العرضات
                  </th>
                  {Array.from({ length: width }, (_, i) => (
                    <th key={i} scope="col" className="border-b px-3 py-3 font-medium whitespace-nowrap">
                      {recitationTitle(i + 1)}
                    </th>
                  ))}
                  <th scope="col" className="border-b px-3 py-3 font-medium">
                    <span className="sr-only">إضافة</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr
                    key={row.surah}
                    ref={row.surah === focus ? focusRef : undefined}
                    data-surah={row.surah}
                    aria-current={row.surah === focus ? "true" : undefined}
                    className={cn("group", row.surah === focus && "[&>*]:bg-brand-soft/40")}
                  >
                    <th scope="row" className="sticky start-0 z-10 border-b bg-card px-4 py-2.5 text-start font-normal">
                      <span className="flex items-center gap-2">
                        <BookOpen className="size-4 shrink-0 text-primary" aria-hidden />
                        <span>
                          <span className="block font-medium whitespace-nowrap">{row.name}</span>
                          <span className="block text-xs text-muted-foreground">{row.ayahs} آية</span>
                        </span>
                      </span>
                    </th>
                    <td className="border-b px-3 py-2.5 text-center">
                      <span
                        className="inline-flex min-w-8 justify-center rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums"
                        title={recitationsCount(row.history?.attempts ?? 0)}
                        data-attempts
                      >
                        {row.history?.attempts ?? 0}
                      </span>
                    </td>
                    {Array.from({ length: width }, (_, i) => (
                      <td key={i} className="border-b px-2 py-2 text-center">
                        {row.columns[i] ? <RecitationCell column={row.columns[i]!} surah={row.name} /> : null}
                      </td>
                    ))}
                    <td className="border-b px-3 py-2 text-center">
                      <Button variant="outline" size="icon-sm" onClick={() => onAdd(row.surah)} aria-label={`إضافة عرضة — ${row.name}`} title="إضافة عرضة">
                        <Plus />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <p className="text-xs text-muted-foreground">
          {visible.length} {visible.length === 1 ? "سورة" : visible.length === 2 ? "سورتان" : "سور"} · العرضة المؤجلة تبقى برقمها حين تُعاد برمجتها
        </p>
      </QueryState>
    </div>
  )
}

/** One recitation: its result and session date; postponements noted; opens its program. */
function RecitationCell({ column, surah }: { column: RecitationColumn<RecitationAttempt>; surah: string }) {
  const e = column.result
  const { icon: Icon, tone } = RESULT_LOOK[e.entry]
  const postponed = postponedTimes(column.earlier.filter((x) => x.entry === "POSTPONED" || x.entry === "SESSION_CANCELLED").length)
  const label = [
    `${surah} — ${recitationTitle(column.number)}`,
    RECITATION_RESULT_SHORT[e.entry],
    `حصة ${formatDate(e.sessionDate)}`,
    postponed,
    e.evaluatedBy,
  ]
    .filter(Boolean)
    .join(" · ")
  return (
    <Link
      href={programHref(e.programId)}
      aria-label={label}
      title={e.evaluationComment ? `${label}\n${e.evaluationComment}` : label}
      data-cell={e.entry}
      className="inline-flex min-w-28 flex-col items-center gap-0.5 rounded-lg px-2 py-1 outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", tone)}>
        <Icon className="size-3.5" aria-hidden />
        {RECITATION_RESULT_SHORT[e.entry]}
        {e.entry === "POSTPONED" && <span className="opacity-80">· لا تحتسب</span>}
      </span>
      <span className="text-[0.7rem] text-muted-foreground tabular-nums">{formatDate(e.sessionDate)}</span>
      {postponed && <span className="text-[0.7rem] text-sky-700 dark:text-sky-300">{postponed}</span>}
    </Link>
  )
}
