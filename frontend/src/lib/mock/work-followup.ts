/**
 * «متابعة العمل» — MOCK data for the client demonstration (no API, no
 * persistence: a page refresh resets it). Sessions are generated relative to
 * today so there are always past and upcoming sessions; every work program
 * references a session id and never stores its own date.
 */
import { addDays, eachDate, weekdayOf } from "@/lib/dates"
import type { ISODate, Weekday } from "@/types/domain"
import type { MockSession, WorkFollowupData, WorkItem, WorkProgram } from "@/types/work-followup"

const CLASSES = [
  { id: "wf-c1", groupName: "مجموعة الماهر", branchName: "الفرع الأول", days: ["MON", "THU"] as Weekday[], start: "16:00", end: "18:00" },
  { id: "wf-c2", groupName: "مجموعة الفرقان", branchName: "فرع النصر", days: ["TUE", "SAT"] as Weekday[], start: "09:00", end: "11:00" },
]

const STUDENTS = [
  { id: "wf-s1", firstName: "درة", lastName: "نصير", groupClassId: "wf-c1" },
  { id: "wf-s2", firstName: "مريم", lastName: "بن عمر", groupClassId: "wf-c1" },
  { id: "wf-s3", firstName: "يوسف", lastName: "العيادي", groupClassId: "wf-c1" },
  { id: "wf-s4", firstName: "أحمد", lastName: "محمد", groupClassId: "wf-c2" },
  { id: "wf-s5", firstName: "سلمى", lastName: "الطرابلسي", groupClassId: "wf-c2" },
  { id: "wf-s6", firstName: "آمنة", lastName: "الشابي", groupClassId: "wf-c2" },
]

/** The class's sessions from 4 weeks ago to 4 weeks ahead; one upcoming session is cancelled. */
function sessionsOf(today: ISODate): MockSession[] {
  const sessions: MockSession[] = []
  for (const c of CLASSES) {
    let upcoming = 0
    for (const date of eachDate(addDays(today, -28), addDays(today, 28))) {
      if (!c.days.includes(weekdayOf(date))) continue
      if (date > today) upcoming++
      sessions.push({
        id: `wf-ses-${c.id}-${date}`,
        groupClassId: c.id,
        date,
        start: c.start,
        end: c.end,
        // A cancelled lesson: never offered for new work
        status: c.id === "wf-c2" && upcoming === 2 ? "CANCELLED" : "SCHEDULED",
      })
    }
  }
  return sessions
}

export function buildWorkFollowupMock(today: ISODate): WorkFollowupData {
  const sessions = sessionsOf(today)
  const of = (classId: string) => sessions.filter((s) => s.groupClassId === classId && s.status === "SCHEDULED")
  const past = (classId: string, n: number) => of(classId).filter((s) => s.date < today).at(-n)!.id
  const next = (classId: string, n: number) => of(classId).filter((s) => s.date > today)[n - 1].id

  let seq = 0
  const item = (fields: Omit<WorkItem, "id">): WorkItem => ({ id: `wf-item-${++seq}`, ...fields })

  // درة نصير — last session, evaluated (every result); its postponed حفظ was carried to the next one
  const postponed = item({ type: "MEMORIZATION", description: "حفظ صفحتين من سورة البقرة", status: "POSTPONED", evaluationComment: "أُجّل لضيق الوقت" })
  const doraPast: WorkProgram = {
    id: "wf-p1",
    studentId: "wf-s1",
    sessionId: past("wf-c1", 1),
    lastEditedBy: "المعلمة مريم",
    generalNotes: "تحتاج الطالبة إلى تحسين أحكام التجويد في سورة التوبة.",
    items: [
      item({ type: "REVISION", description: "مراجعة من سورة الزمر إلى سورة الناس", status: "COMPLETED" }),
      item({ type: "RECITATION", description: "العرضة الثانية من سورة التوبة", recitationNumber: 2, status: "NOT_COMPLETED", evaluationComment: "لم تُكمل العرضة: توقفت عند الآية 40" }),
      item({ type: "EXAM", description: "اختبار من سورة الروم إلى سورة الناس", status: "PARTIAL", evaluationComment: "الاختبار جزئي بسبب بعض الأخطاء في الحفظ." }),
      postponed,
    ],
  }
  // درة نصير — next session: the four planned items, not evaluated yet
  const doraNext: WorkProgram = {
    id: "wf-p2",
    studentId: "wf-s1",
    sessionId: next("wf-c1", 1),
    lastEditedBy: "المعلمة مريم",
    items: [
      item({ type: "REVISION", description: "مراجعة من سورة الزمر إلى سورة الناس", status: "NOT_EVALUATED" }),
      item({ type: "RECITATION", description: "إكمال العرضة الثانية من سورة التوبة", recitationNumber: 2, status: "NOT_EVALUATED" }),
      item({ type: "EXAM", description: "اختبار من سورة الروم إلى سورة الناس", status: "NOT_EVALUATED" }),
      item({ type: "MEMORIZATION", description: "حفظ صفحتين من سورة البقرة", status: "NOT_EVALUATED", carriedFromItemId: postponed.id }),
    ],
  }
  // يوسف العيادي — numbered recitations of سورة يس across sessions
  const yousef: WorkProgram[] = [
    {
      id: "wf-p3",
      studentId: "wf-s3",
      sessionId: past("wf-c1", 3),
      lastEditedBy: "المعلم سامي",
      items: [
        item({ type: "RECITATION", description: "العرضة الأولى من سورة يس", recitationNumber: 1, status: "COMPLETED" }),
        item({ type: "MEMORIZATION", description: "حفظ سورة الملك", status: "COMPLETED" }),
      ],
    },
    {
      id: "wf-p4",
      studentId: "wf-s3",
      sessionId: past("wf-c1", 2),
      lastEditedBy: "المعلم سامي",
      items: [
        item({ type: "RECITATION", description: "العرضة الثانية من سورة يس", recitationNumber: 2, status: "COMPLETED", evaluationComment: "أداء متقن" }),
        item({ type: "REVISION", description: "مراجعة جزء تبارك", status: "COMPLETED" }),
      ],
    },
    {
      id: "wf-p5",
      studentId: "wf-s3",
      sessionId: next("wf-c1", 2),
      lastEditedBy: "المعلمة مريم",
      items: [item({ type: "RECITATION", description: "العرضة الثالثة من سورة يس", recitationNumber: 3, status: "NOT_EVALUATED" })],
    },
  ]
  // مريم بن عمر — a past session the teacher forgot to evaluate
  const mariem: WorkProgram = {
    id: "wf-p6",
    studentId: "wf-s2",
    sessionId: past("wf-c1", 1),
    lastEditedBy: "المعلمة مريم",
    items: [
      item({
        type: "MEMORIZATION",
        description:
          "حفظ الربع الأول من سورة الكهف مع التركيز على مخارج الحروف وأحكام المدّ، ثم تسميعه مرتين أمام المعلمة قبل نهاية الحصة.\nالبدء بالآيات من 1 إلى 16 ثم الانتقال إلى بقية الربع إن سمح الوقت.",
        status: "NOT_EVALUATED",
      }),
      item({ type: "REVISION", description: "مراجعة سورة مريم", status: "NOT_EVALUATED" }),
    ],
  }
  // Second class
  const ahmed: WorkProgram[] = [
    {
      id: "wf-p7",
      studentId: "wf-s4",
      sessionId: past("wf-c2", 1),
      lastEditedBy: "المعلم سامي",
      items: [
        item({ type: "EXAM", description: "اختبار في جزء عمّ", status: "COMPLETED", evaluationComment: "ممتاز" }),
        item({ type: "MEMORIZATION", description: "حفظ سورة النبأ", status: "PARTIAL", evaluationComment: "حفظ نصف السورة" }),
        item({ type: "RECITATION", description: "العرضة الأولى من سورة الملك", recitationNumber: 1, status: "CANCELLED", evaluationComment: "أُلغيت لتخصيص الوقت للاختبار" }),
      ],
    },
    {
      id: "wf-p8",
      studentId: "wf-s4",
      sessionId: next("wf-c2", 1),
      lastEditedBy: "المعلم سامي",
      items: [item({ type: "REVISION", description: "مراجعة جزء عمّ كاملًا", status: "NOT_EVALUATED" })],
    },
  ]
  const salma: WorkProgram = {
    id: "wf-p9",
    studentId: "wf-s5",
    sessionId: next("wf-c2", 1),
    lastEditedBy: "المعلم سامي",
    items: [
      item({ type: "MEMORIZATION", description: "حفظ سورة الحجرات", status: "NOT_EVALUATED" }),
      item({ type: "RECITATION", description: "العرضة الأولى من سورة ق", recitationNumber: 1, status: "NOT_EVALUATED" }),
    ],
  }

  return {
    me: "أنت",
    classes: CLASSES.map(({ id, groupName, branchName }) => ({ id, groupName, branchName })),
    students: STUDENTS,
    sessions,
    programs: [doraPast, doraNext, ...yousef, mariem, ...ahmed, salma],
  }
}
