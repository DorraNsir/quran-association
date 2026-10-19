import { screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DirectionProvider } from "@/components/ui/direction"
import { clearSession, setSession } from "@/lib/api/session"
import type { SessionDto } from "@/lib/api/sessions"
import { addDays, todayInTunis } from "@/lib/dates"
import { describeClass, indexLookups, roomsLabel, sessionIncludesClass, teacherAssignments, type Lookups } from "@/lib/domain"
import { getStudentSessions } from "@/lib/student-access"
import { authResponse, json } from "@/test/fetch-mock"
import { renderWithClient } from "@/test/render"
import type { Session } from "@/types/domain"

import { TeacherClassDetails, TeacherClasses } from "./teacher-classes"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }))
vi.mock("@/lib/store/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/settings")>()),
  useAcademicYears: () => [],
}))

/**
 * Regression: «مجموعاتي» of a shared lesson. درة (t1) supervises A (الارقم)
 * and B (الماهر), which share Monday 09:00–11:00 in القاعة 2 (hosted by A);
 * A also meets alone on Wednesday in القاعة 1. N is a normal class (القاعة 3).
 */
const today = todayInTunis()
const tomorrow = addDays(today, 1)
const lookups: Lookups = {
  branches: [{ id: "br", name: "فرع المركز", address: "نابل", status: "ACTIVE" }],
  rooms: [
    { id: "R1", branchId: "br", name: "القاعة 1", status: "ACTIVE" },
    { id: "R2", branchId: "br", name: "القاعة 2", status: "ACTIVE" },
    { id: "R3", branchId: "br", name: "القاعة 3", status: "ACTIVE" },
  ],
  groups: [
    { id: "gA", name: "الارقم", audience: "", status: "ACTIVE", createdAt: "2026-09-01" },
    { id: "gB", name: "الماهر", audience: "", status: "ACTIVE", createdAt: "2026-09-01" },
    { id: "gN", name: "الثالثة", audience: "", status: "ACTIVE", createdAt: "2026-09-01" },
  ],
  groupClasses: [
    { id: "A", groupId: "gA", branchId: "br", supervisorId: "t1", assistantIds: [], status: "ACTIVE" },
    { id: "B", groupId: "gB", branchId: "br", supervisorId: "t1", assistantIds: [], status: "ACTIVE" },
    { id: "N", groupId: "gN", branchId: "br", supervisorId: "t1", assistantIds: [], status: "ACTIVE" },
  ],
  teachers: [{ id: "t1", firstName: "درة", lastName: "ن", phone: "", status: "ACTIVE", joinedAt: "2024-09-01" }],
  schedules: [
    { id: "sShared", groupClassId: "A", additionalGroupClassIds: ["B"], day: "MON", start: "09:00", end: "11:00", roomId: "R2" },
    { id: "sA", groupClassId: "A", day: "WED", start: "09:00", end: "10:00", roomId: "R1" },
    { id: "sN", groupClassId: "N", day: "THU", start: "09:00", end: "10:00", roomId: "R3" },
  ],
}

const sessionDto = (id: string, classId: string, group: string, extra: SessionDto["additionalClasses"], roomId: string, roomName: string): SessionDto => ({
  id,
  date: tomorrow,
  startTime: "09:00",
  endTime: "11:00",
  status: "SCHEDULED",
  cancellationReason: null,
  weeklyScheduleId: null,
  isExtra: false,
  groupClass: { id: classId, status: "ACTIVE", group: { id: `g${classId}`, name: group, status: "ACTIVE" } },
  additionalClasses: extra,
  room: { id: roomId, name: roomName, status: "ACTIVE", branch: { id: "br", name: "فرع المركز", status: "ACTIVE" } },
  teachers: [{ id: "t1", firstName: "درة", lastName: "ن", role: "SUPERVISOR", status: "ACTIVE" }],
  attendance: { expected: 0, recorded: 0, present: 0, absent: 0, late: 0, excused: 0 },
})
// ONE shared session record (host A + B), and a normal session of N
const sessions = [
  sessionDto("se-shared", "A", "الارقم", [{ id: "B", status: "ACTIVE", group: { id: "gB", name: "الماهر", status: "ACTIVE" } }], "R2", "القاعة 2"),
  sessionDto("se-n", "N", "الثالثة", [], "R3", "القاعة 3"),
]

function routeFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/teacher/sessions/calendar")) return json(200, sessions)
      if (url.includes("/platform-preferences"))
        return json(200, { timezone: "Africa/Tunis", dateFormat: "DD_MM_YYYY", defaultCalendarView: "WEEK", defaultPageSize: 10, currentAcademicYear: null })
      return json(200, [])
    })
  )
}
const rtl = (ui: React.ReactNode) => renderWithClient(<DirectionProvider dir="rtl">{ui}</DirectionProvider>)

beforeEach(() => {
  clearSession()
  setSession(authResponse("u1", ["TEACHER"]))
})

describe("participation-aware rooms and sessions", () => {
  const indexes = indexLookups(lookups)

  it("rooms: the host and the additional class both use the shared slot's room; own slots come first", () => {
    // A hosts both of its slots (Monday shared, Wednesday alone) — slot order
    expect(roomsLabel(indexes.roomsByClass.get("A") ?? [])).toBe("القاعة 2، القاعة 1")
    // B only attends the shared slot
    expect(roomsLabel(describeClass(lookups.groupClasses[1], indexes).rooms)).toBe("القاعة 2")
    // A normal class is unchanged
    expect(roomsLabel(indexes.roomsByClass.get("N") ?? [])).toBe("القاعة 3")
  })

  it("a class's own rooms stay first (the extra-session form's default room)", () => {
    const withOwn = indexLookups({
      ...lookups,
      schedules: [...lookups.schedules, { id: "sB", groupClassId: "B", day: "TUE", start: "09:00", end: "10:00", roomId: "R3" }],
    })
    // B's own Tuesday slot (القاعة 3) before the shared Monday one (القاعة 2), even though Monday comes first
    expect(withOwn.roomsByClass.get("B")?.map((r) => r.id)).toEqual(["R3", "R2"])
  })

  it("sessionIncludesClass / getStudentSessions: host and additional class, nothing else", () => {
    const shared: Session = { id: "s1", groupClassId: "A", additionalGroupClassIds: ["B"], scheduleId: "", roomId: "R2", date: tomorrow, start: "09:00", end: "11:00", status: "SCHEDULED" }
    const normal: Session = { ...shared, id: "s2", groupClassId: "N", additionalGroupClassIds: undefined }
    expect([sessionIncludesClass(shared, "A"), sessionIncludesClass(shared, "B"), sessionIncludesClass(shared, "N")]).toEqual([true, true, false])
    expect([sessionIncludesClass(normal, "N"), sessionIncludesClass(normal, "A")]).toEqual([true, false])
    expect(getStudentSessions({ groupClassId: "B" }, [shared, normal]).map((s) => s.id)).toEqual(["s1"])
  })
})

describe("«مجموعاتي» cards and class page", () => {
  it("both class cards show القاعة 2 and the SAME next (shared) lesson; the normal class is unchanged", async () => {
    routeFetch()
    rtl(<TeacherClasses teacherId="t1" lookups={lookups} students={[]} today={today} />)
    const card = (group: string) => screen.getByText(group, { selector: "p" }).closest("a")!
    await screen.findAllByText(/الحصة القادمة/)
    for (const group of ["الارقم", "الماهر"]) {
      const c = within(card(group))
      expect(c.getByText(/القاعة 2/)).toBeTruthy()
      expect(c.getByText(/الحصة القادمة/)).toBeTruthy()
      expect(c.queryByText("لا توجد حصص قادمة")).toBeNull()
    }
    const n = within(card("الثالثة"))
    expect(n.getByText(/القاعة 3/)).toBeTruthy()
    expect(n.getByText(/الحصة القادمة/)).toBeTruthy()
  })

  it("the additional class's page lists the shared lesson (one record) among its sessions", async () => {
    routeFetch()
    const assignment = teacherAssignments("t1", lookups).find((a) => a.groupClass.id === "B")!
    rtl(<TeacherClassDetails assignment={assignment} lookups={lookups} students={[]} today={today} teacherId="t1" />)
    expect(await screen.findByText("الارقم + الماهر")).toBeTruthy()
    // Not the normal class's lesson
    expect(screen.queryByText("الثالثة")).toBeNull()
    expect(screen.getAllByText(/القاعة 2/).length).toBeGreaterThan(0)
  })
})
