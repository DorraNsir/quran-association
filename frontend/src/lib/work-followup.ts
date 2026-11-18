/**
 * «متابعة العمل» — display rules (pure functions). The API is the authority
 * (eligibility, transfers, numbering, progress); these only label and
 * pre-fill what the teacher sees.
 */
import { tunisTimeOf, weekdayOf } from "@/lib/dates"
import { formatDate, formatTimeRange } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { attendanceOpen } from "@/lib/session-actions"
import type { ISODate, SessionStatus } from "@/types/domain"
import type { WorkItem, WorkProgram, WorkProgress, WorkSession, WorkStatus, WorkType } from "@/types/work-followup"

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

/**
 * Results that may be continued in a later session («نقل إلى الحصة القادمة»)
 * — manually only. A CANCELLED session's work is never evaluated: its
 * unevaluated items may be carried as they are (the API's rule).
 */
export const isTransferable = (status: WorkStatus, sessionStatus?: SessionStatus) =>
  status === "NOT_COMPLETED" ||
  status === "PARTIAL" ||
  status === "POSTPONED" ||
  status === "CANCELLED" ||
  (status === "NOT_EVALUATED" && sessionStatus === "CANCELLED")

/** Why «تقييم الأعمال» is closed now (null: open). */
export type EvaluationBlock = "NOT_STARTED" | "CANCELLED"

export const evaluationBlockMessage: Record<EvaluationBlock, string> = {
  NOT_STARTED: "لا يمكن تقييم برنامج العمل قبل بداية الحصة",
  CANCELLED: "لا يمكن تقييم برنامج العمل لحصة ملغاة",
}

/** The API's refusals of an evaluation, mapped to the same reasons. */
export const EVALUATION_ERROR_CODES = ["WORK_SESSION_NOT_STARTED", "WORK_SESSION_CANCELLED"] as const

/**
 * Evaluation opens once the session has STARTED (its current date and start
 * time — Africa/Tunis), during and after it, completed included; never for a
 * cancelled session. The server's verdict (`program.evaluation`) decides;
 * the clock only OPENS a «not started yet» once the start minute has come
 * while the page stays open (the attendance rule) — a wrong device clock
 * never opens what the server closed for another reason, and the API
 * refuses (409) anything early anyway.
 */
export function evaluationBlockOf(program: Pick<WorkProgram, "session" | "evaluation">, at: Date | number = Date.now()): EvaluationBlock | null {
  const { session, evaluation } = program
  if (session.status === "CANCELLED" || evaluation?.blockedReason === "SESSION_CANCELLED") return "CANCELLED"
  const started = attendanceOpen({ status: session.status, date: session.date, start: session.startTime }, at)
  // Without the server's verdict (an older API): the clock alone
  if (!evaluation) return started ? null : "NOT_STARTED"
  return evaluation.blockedReason === "SESSION_NOT_STARTED" && !started ? "NOT_STARTED" : null
}

/** «منقول من حصة سابقة: … — مؤجل»; from a cancelled session, unevaluated: «منقول من حصة ملغاة: …». */
export function carriedFromLabel(from: { sessionDate: ISODate; status: WorkStatus }) {
  return from.status === "NOT_EVALUATED"
    ? `منقول من حصة ملغاة: ${formatDate(from.sessionDate)}`
    : `منقول من حصة سابقة: ${formatDate(from.sessionDate)} — ${workStatusLabel[from.status]}`
}

/**
 * The approved rule, for a draft (the evaluation sheet) — the API returns
 * the same numbers as `progress`: only COMPLETED is done, CANCELLED is left
 * out of the active total.
 */
export function progressOf(items: Pick<WorkItem, "status">[]): WorkProgress {
  const count = (test: (s: WorkStatus) => boolean) => items.filter((i) => test(i.status)).length
  const total = items.length
  const cancelled = count((s) => s === "CANCELLED")
  const active = total - cancelled
  const completed = count((s) => s === "COMPLETED")
  return {
    total,
    active,
    completed,
    pending: count((s) => s === "NOT_EVALUATED"),
    unfinished: count((s) => s === "NOT_COMPLETED" || s === "PARTIAL" || s === "POSTPONED"),
    cancelled,
    rate: active > 0 ? Math.round((completed / active) * 1000) / 10 : null,
  }
}

export function progressLabel(p: WorkProgress): string {
  if (p.total === 0) {
    return "لا توجد أعمال"
  }

  if (p.active === 0) {
    return "لا توجد أعمال نشطة"
  }

  if (p.completed === 0) {
    return `${p.active} أعمال بانتظار الإنجاز`
  }

  if (p.completed === p.active) {
    return `تم إنجاز جميع الأعمال (${p.completed}/${p.active})`
  }

  return `تم إنجاز ${p.completed} من أصل ${p.active} ${
    p.cancelled ? "أعمال نشطة" : "أعمال"
  }`
}

/** «عمل ملغى واحد» / «عملان ملغيان» / «3 أعمال ملغاة» */
export function cancelledLabel(n: number) {
  return n === 1 ? "عمل ملغى واحد" : n === 2 ? "عملان ملغيان" : `${n} أعمال ملغاة`
}

export type SessionPhase = "UPCOMING" | "ONGOING" | "PAST"

export const sessionPhaseLabel: Record<SessionPhase, string> = { UPCOMING: "قادمة", ONGOING: "جارية", PAST: "سابقة" }

/** Where a session stands now (Africa/Tunis date and time). */
export function phaseOf(
  session: Pick<WorkSession, "date" | "startTime" | "endTime">,
  today: ISODate,
  now = tunisTimeOf(Date.now())
): SessionPhase {
  if (session.date > today) return "UPCOMING"
  if (session.date < today) return "PAST"
  if (now < session.startTime) return "UPCOMING"
  return now < session.endTime ? "ONGOING" : "PAST"
}

/**
 * «الإثنين 19 أكتوبر 2026 — 16:00–18:00». The time range is wrapped in a
 * left-to-right isolate so the RTL text never displays it as «18:00 – 16:00».
 */
export function sessionLabel(session: Pick<WorkSession, "date" | "startTime" | "endTime">) {
  return `${labels.weekday[weekdayOf(session.date)]} ${formatDate(session.date)} — ${formatTimeRange(session.startTime, session.endTime)}`
}

const ORDINALS = ["الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة", "الثامنة", "التاسعة", "العاشرة"]

/** «الثالثة», or «رقم 12» beyond the tenth. */
export const recitationOrdinal = (n: number) => ORDINALS[n - 1] ?? `رقم ${n}`

/**
 * The proposed text of the next recitation (the teacher may edit it; the API
 * sets the number): «العرضة الثانية من سورة التوبة» → «العرضة الثالثة من
 * سورة التوبة» (a leading «إكمال» is dropped).
 */
export function nextRecitation(item: Pick<WorkItem, "description" | "recitationNumber">) {
  const number = (item.recitationNumber ?? 1) + 1
  const base = item.description.replace(/^إكمال\s+/, "")
  const pattern = new RegExp(`العرضة\\s+(${ORDINALS.join("|")}|رقم\\s+\\d+)`)
  const description = pattern.test(base)
    ? base.replace(pattern, `العرضة ${recitationOrdinal(number)}`)
    : `العرضة ${recitationOrdinal(number)} — ${base}`
  return { number, description }
}
