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
export const WORK_STATUSES: WorkStatus[] = ["NOT_EVALUATED", "COMPLETED", "NOT_COMPLETED", "PARTIAL", "POSTPONED"]

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
}

/** Unfinished results that can be continued in a later session. */
export const isUnfinished = (status: WorkStatus) => status === "NOT_COMPLETED" || status === "PARTIAL" || status === "POSTPONED"

/** «2 من 4 أعمال منجزة»: only COMPLETED counts (partial / postponed are not done). */
export function progressOf(program: Pick<WorkProgram, "items">) {
  const total = program.items.length
  const completed = program.items.filter((i) => i.status === "COMPLETED").length
  const pending = program.items.filter((i) => i.status === "NOT_EVALUATED").length
  const unfinished = program.items.filter((i) => isUnfinished(i.status)).length
  return { total, completed, pending, unfinished }
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
