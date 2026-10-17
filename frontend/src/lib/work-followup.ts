/**
 * «متابعة العمل» — PROTOTYPE rules (pure functions, no UI, no API).
 * The single place for labels, progress, session eligibility and the
 * «العرضة التالية» numbering, so a real backend can later take them over.
 */
import { tunisTimeOf, weekdayOf } from "@/lib/dates"
import { formatDate, formatTimeRange } from "@/lib/format"
import { labels } from "@/lib/i18n"
import type { ID, ISODate } from "@/types/domain"
import type { MockSession, WorkFollowupData, WorkItem, WorkProgram, WorkStatus, WorkType } from "@/types/work-followup"

export const WORK_TYPES: WorkType[] = ["MEMORIZATION", "REVISION", "RECITATION", "EXAM"]
export const WORK_STATUSES: WorkStatus[] = ["NOT_EVALUATED", "COMPLETED", "NOT_COMPLETED", "PARTIAL", "POSTPONED", "CANCELLED"]

export const workTypeLabel: Record<WorkType, string> = {
  MEMORIZATION: "حفظ",
  REVISION: "مراجعة",
  RECITATION: "عرضة",
  EXAM: "اختبار",
}

export const workStatusLabel: Record<WorkStatus, string> = {
  NOT_EVALUATED: "لم يُقيّم بعد",
  COMPLETED: "منجز",
  NOT_COMPLETED: "غير منجز",
  PARTIAL: "جزئي",
  POSTPONED: "مؤجل",
  CANCELLED: "ملغى",
}

/** Results that may be continued in a later session («نقل إلى الحصة القادمة») — manually only. */
export const isTransferable = (status: WorkStatus) =>
  status === "NOT_COMPLETED" || status === "PARTIAL" || status === "POSTPONED" || status === "CANCELLED"

/** Evaluated but not done (a cancelled item is counted apart). */
export const isUnfinished = (status: WorkStatus) => status === "NOT_COMPLETED" || status === "PARTIAL" || status === "POSTPONED"

/**
 * «2 من 3 أعمال نشطة منجزة»: only COMPLETED counts as done (partial /
 * postponed are not); CANCELLED items are left out of the active total and
 * counted apart.
 */
export function progressOf(program: Pick<WorkProgram, "items">) {
  const count = (test: (s: WorkStatus) => boolean) => program.items.filter((i) => test(i.status)).length
  const total = program.items.length
  const cancelled = count((s) => s === "CANCELLED")
  return {
    total,
    active: total - cancelled,
    completed: count((s) => s === "COMPLETED"),
    pending: count((s) => s === "NOT_EVALUATED"),
    unfinished: count(isUnfinished),
    cancelled,
  }
}

/** «1 من 3 أعمال منجزة» — «نشطة» is added only when some work was cancelled. */
export function progressLabel(p: ReturnType<typeof progressOf>) {
  if (p.active === 0) return p.total ? "لا توجد أعمال نشطة" : "لا توجد أعمال"
  return `${p.completed} من ${p.active} ${p.cancelled ? "أعمال نشطة منجزة" : "أعمال منجزة"}`
}

/** «عمل ملغى واحد» / «عملان ملغيان» / «3 أعمال ملغاة» */
export function cancelledLabel(n: number) {
  return n === 1 ? "عمل ملغى واحد" : n === 2 ? "عملان ملغيان" : `${n} أعمال ملغاة`
}

export type SessionPhase = "UPCOMING" | "ONGOING" | "PAST"

export const sessionPhaseLabel: Record<SessionPhase, string> = { UPCOMING: "قادمة", ONGOING: "جارية", PAST: "سابقة" }

/** Where a session stands now (Africa/Tunis date and time). */
export function phaseOf(session: Pick<MockSession, "date" | "start" | "end">, today: ISODate, now = tunisTimeOf(Date.now())): SessionPhase {
  if (session.date > today) return "UPCOMING"
  if (session.date < today) return "PAST"
  if (now < session.start) return "UPCOMING"
  return now < session.end ? "ONGOING" : "PAST"
}

/**
 * «الإثنين 19 أكتوبر 2026 — 16:00–18:00». The time range is wrapped in a
 * left-to-right isolate so the RTL text never displays it as «18:00 – 16:00».
 */
export function sessionLabel(session: Pick<MockSession, "date" | "start" | "end">) {
  return `${labels.weekday[weekdayOf(session.date)]} ${formatDate(session.date)} — \u2066${formatTimeRange(session.start, session.end)}\u2069`
}

/**
 * Sessions a NEW program (or a carried / next item) may target: the
 * student's class, not cancelled, not started yet — picked from existing
 * session records, never an arbitrary date.
 */
export function eligibleSessions(data: Pick<WorkFollowupData, "students" | "sessions">, studentId: ID, today: ISODate, now?: string) {
  const student = data.students.find((s) => s.id === studentId)
  if (!student) return []
  return data.sessions
    .filter((s) => s.groupClassId === student.groupClassId && s.status === "SCHEDULED" && phaseOf(s, today, now) === "UPCOMING")
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
}

export const programOf = (programs: WorkProgram[], studentId: ID, sessionId: ID) =>
  programs.find((p) => p.studentId === studentId && p.sessionId === sessionId)

const ORDINALS = ["الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة", "الثامنة", "التاسعة", "العاشرة"]

/** «الثالثة», or «رقم 12» beyond the tenth. */
export const recitationOrdinal = (n: number) => ORDINALS[n - 1] ?? `رقم ${n}`

/**
 * The next numbered recitation of the same Surah: «العرضة الثانية من سورة
 * التوبة» → «العرضة الثالثة من سورة التوبة» (a leading «إكمال» is dropped —
 * the next recitation is a new one, not a continuation).
 */
export function nextRecitation(item: Pick<WorkItem, "description" | "recitationNumber">) {
  const current = item.recitationNumber ?? 1
  const number = current + 1
  const base = item.description.replace(/^إكمال\s+/, "")
  const pattern = new RegExp(`العرضة\\s+(${ORDINALS.join("|")}|رقم\\s+\\d+)`)
  const description = pattern.test(base)
    ? base.replace(pattern, `العرضة ${recitationOrdinal(number)}`)
    : `العرضة ${recitationOrdinal(number)} — ${base}`
  return { number, description }
}

/** Items of later programs that continue `itemId` (carried forward). */
export function carriedCopiesOf(programs: WorkProgram[], itemId: ID) {
  return programs.flatMap((p) => p.items.filter((i) => i.carriedFromItemId === itemId).map((i) => ({ program: p, item: i })))
}

/** The program and item an item was carried from. */
export function originOf(programs: WorkProgram[], itemId?: ID) {
  if (!itemId) return undefined
  for (const program of programs) {
    const item = program.items.find((i) => i.id === itemId)
    if (item) return { program, item }
  }
  return undefined
}

let idSeq = 0
/** Ids for prototype records created in the browser (no persistence). */
export const newWorkId = (prefix: "wf-p" | "wf-item") => `${prefix}-new-${++idSeq}`
