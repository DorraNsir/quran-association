import type { Weekday, WeeklySchedule } from "@/types/domain"

type Row = [groupClassId: string, day: Weekday, start: string, end: string]

/**
 * Recurring weekly slots, per class. Rooms and teachers come from the class.
 * Conflict-free but dense enough to try conflict detection:
 * - ROOM: المقر الرئيسي / القاعة 1 hosts الفرقان on Sunday 09:00–11:00
 *   → another class in that room on Sunday 10:00 conflicts, 11:00 does not.
 * - TEACHER: أحمد بن صالح supervises الفرقان (Sun 09:00–11:00) and التقوى
 *   → moving التقوى to Sunday 10:00 conflicts.
 * - مجموعة ماهر meets twice on Sunday, as two separate classes:
 *   المقر الرئيسي with حمدي (09:00–11:00) and فرع حي الرياض with درة (14:00–16:00).
 */
const rows: Row[] = [
  ["g1-a", "SUN", "09:00", "11:00"],
  ["g1-a", "WED", "17:00", "19:00"],
  ["g2-a", "TUE", "17:00", "18:30"],
  ["g2-a", "SAT", "09:00", "11:00"],
  ["g3-a", "MON", "19:00", "20:30"],
  ["g3-a", "THU", "19:00", "20:30"],
  ["g4-a", "SAT", "09:00", "10:30"],
  ["g4-a", "SUN", "09:00", "10:30"],
  ["g5-a", "MON", "09:30", "11:30"],
  ["g5-a", "THU", "09:30", "11:30"],
  ["g6-a", "WED", "17:00", "18:30"],
  ["g6-a", "SAT", "14:00", "16:00"],
  ["g7-a", "FRI", "17:00", "18:30"],
  ["g7-a", "SUN", "14:00", "16:00"],
  ["g8-a", "FRI", "17:30", "19:30"],
  ["g8-a", "SAT", "16:00", "18:00"],
  ["g9-a", "TUE", "17:00", "18:30"],
  ["g9-a", "FRI", "15:00", "16:30"],
  ["g10-a", "SAT", "10:00", "12:00"],
  ["g11-a", "SUN", "09:00", "11:00"],
  ["g11-b", "SUN", "14:00", "16:00"],
]

export const schedules: WeeklySchedule[] = rows.map(([groupClassId, day, start, end], i) => ({
  id: `ws${i + 1}`,
  groupClassId,
  day,
  start,
  end,
}))
