import type { Weekday, WeeklySchedule } from "@/types/domain"

import { rooms } from "./branches"

type Row = [groupId: string, day: Weekday, start: string, end: string, roomId: string]

/**
 * Recurring weekly sessions. The data is conflict-free but deliberately
 * dense so conflict detection can be tried, e.g.:
 * - ROOM: المقر الرئيسي / القاعة 1 is used by مجموعة الفرقان on Sunday 09:00–11:00
 *   → scheduling another group there on Sunday 10:00 conflicts, 11:00 does not.
 * - TEACHER: أحمد بن صالح supervises الفرقان (Sun 09:00–11:00) and التقوى
 *   → moving التقوى to Sunday 10:00, in any room, conflicts.
 * - مريم بن عمر assists الفرقان and النور and supervises الهدى (busiest teacher).
 */
const rows: Row[] = [
  ["g1", "SUN", "09:00", "11:00", "b1-r1"],
  ["g1", "WED", "17:00", "19:00", "b1-r2"],
  ["g2", "TUE", "17:00", "18:30", "b1-r2"],
  ["g2", "SAT", "09:00", "11:00", "b1-r2"],
  ["g3", "MON", "19:00", "20:30", "b1-r3"],
  ["g3", "THU", "19:00", "20:30", "b1-r3"],
  ["g4", "SAT", "09:00", "10:30", "b2-r1"],
  ["g4", "SUN", "09:00", "10:30", "b2-r1"],
  ["g5", "MON", "09:30", "11:30", "b2-r2"],
  ["g5", "THU", "09:30", "11:30", "b2-r2"],
  ["g6", "WED", "17:00", "18:30", "b3-r1"],
  ["g6", "SAT", "14:00", "16:00", "b3-r1"],
  ["g7", "FRI", "17:00", "18:30", "b3-r2"],
  ["g7", "SUN", "14:00", "16:00", "b3-r2"],
  ["g8", "FRI", "17:30", "19:30", "b1-r4"],
  ["g8", "SAT", "16:00", "18:00", "b1-r4"],
  ["g9", "TUE", "17:00", "18:30", "b3-r3"],
  ["g9", "FRI", "15:00", "16:30", "b3-r3"],
  ["g10", "SAT", "10:00", "12:00", "b4-r1"],
]

const branchOfRoom = new Map(rooms.map((r) => [r.id, r.branchId]))

export const schedules: WeeklySchedule[] = rows.map(([groupId, day, start, end, roomId], i) => ({
  id: `ws${i + 1}`,
  groupId,
  day,
  start,
  end,
  roomId,
  branchId: branchOfRoom.get(roomId) ?? "",
}))
