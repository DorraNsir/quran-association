import { indexById } from "@/lib/domain"
import type { MemorizationProgress, Semester, Student, SurahNumber } from "@/types/domain"

import { academicYears } from "./academic-years"
import { groupClasses } from "./groups"
import { MOCK_TODAY } from "./reference-date"
import { students } from "./students"

/** Deterministic 0–1 value from a string (same seed on server and client). */
function noise(key: string) {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  return ((h >>> 0) % 10000) / 10000
}

const descending = (from: number, to: number) => Array.from({ length: from - to + 1 }, (_, i) => from - i)

/**
 * Memorization advances in reverse mushaf order (from الناس toward البقرة),
 * starting where each kind of group usually is.
 */
const TRACKS = {
  beginners: descending(114, 67), // جزء عمّ ثم تبارك
  teens: descending(77, 46),
  advanced: descending(46, 2),
}
const TRACK_OF_GROUP: Record<string, keyof typeof TRACKS> = { g1: "teens", g7: "teens", g8: "advanced", g3: "teens" }

const [PREVIOUS, CURRENT] = academicYears
const classesById = indexById(groupClasses)

/** Values stated in the specification — same group "مجموعة ماهر", two classes. */
const FIXED: Record<string, Partial<Record<string, SurahNumber>>> = {
  // مريم بوزيد → حلقة المقر الرئيسي → حمدي بن عثمان
  s53: { [`${CURRENT.id}:SEMESTER_1`]: 67 },
  // أحمد الصيد → same class as مريم
  s54: { [`${CURRENT.id}:SEMESTER_1`]: 87 },
  // مرام العياشي → حلقة فرع حي الرياض → درة بن سالم
  s56: { [`${CURRENT.id}:SEMESTER_1`]: 78 },
  // A student with two past semesters and the current one
  s1: { [`${PREVIOUS.id}:SEMESTER_1`]: 87, [`${PREVIOUS.id}:SEMESTER_2`]: 67, [`${CURRENT.id}:SEMESTER_1`]: 57 },
}
/** No value yet this semester — shows the "not set yet" state (e.g. يوسف النجار, Hamdi's class). */
const NOT_SET = new Set(["s55", "s9", "s24", "s47"])

const CURRENT_UPDATE_DATES = ["2026-09-20", "2026-09-24", "2026-09-27", "2026-09-29", "2026-10-01", "2026-10-02"]

function record(student: Student, yearId: string, semester: Semester, surah: SurahNumber, updatedAt: string): MemorizationProgress[] {
  // The supervisor of the student's class is recorded as the updater
  const teacherId = classesById.get(student.groupClassId)?.supervisorId
  if (!teacherId) return []
  return [{
    id: `mp-${student.id}-${yearId}-${semester === "SEMESTER_1" ? "s1" : "s2"}`,
    studentId: student.id,
    academicYearId: yearId,
    semester,
    lastMemorizedSurah: surah,
    updatedByTeacherId: teacherId,
    updatedAt,
  }]
}

export const memorizationProgress: MemorizationProgress[] = students
  .filter((s) => s.status !== "ARCHIVED")
  .flatMap((student) => {
    const groupId = classesById.get(student.groupClassId)?.groupId ?? ""
    const track = TRACKS[TRACK_OF_GROUP[groupId] ?? "beginners"]
    const at = (i: number) => track[Math.min(i, track.length - 1)]
    const base = Math.floor(noise(`base:${student.id}`) * 4)
    const fixed = FIXED[student.id] ?? {}
    const value = (yearId: string, semester: Semester, fallback: SurahNumber) => fixed[`${yearId}:${semester}`] ?? fallback
    const records: MemorizationProgress[] = []

    // Previous year: only for students already registered at the time
    const wasThere = student.registrationDate <= PREVIOUS.semesters.SEMESTER_1.endDate
    if (wasThere) {
      records.push(...record(student, PREVIOUS.id, "SEMESTER_1", value(PREVIOUS.id, "SEMESTER_1", at(base)), "2026-01-24"))
    }
    if (student.registrationDate <= PREVIOUS.semesters.SEMESTER_2.endDate && (wasThere || noise(`s2:${student.id}`) < 0.8)) {
      records.push(...record(student, PREVIOUS.id, "SEMESTER_2", value(PREVIOUS.id, "SEMESTER_2", at(base + 2)), "2026-06-12"))
    }

    // Current year, semester 1 (semester 2 has not started yet)
    const skip = NOT_SET.has(student.id) || (!fixed[`${CURRENT.id}:SEMESTER_1`] && noise(`skip:${student.id}`) < 0.12)
    if (!skip && student.registrationDate <= MOCK_TODAY) {
      const dates = CURRENT_UPDATE_DATES.filter((d) => d >= student.registrationDate)
      const updatedAt = dates[Math.floor(noise(`date:${student.id}`) * dates.length)] ?? MOCK_TODAY
      records.push(...record(student, CURRENT.id, "SEMESTER_1", value(CURRENT.id, "SEMESTER_1", at(wasThere ? base + 4 : base)), updatedAt))
    }
    return records
  })
