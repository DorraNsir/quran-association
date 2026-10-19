import { fireEvent, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DirectionProvider } from "@/components/ui/direction"
import { clearSession, setSession } from "@/lib/api/session"
import { authResponse, json } from "@/test/fetch-mock"
import { renderWithClient } from "@/test/render"
import type { StudentWorkProgram } from "@/types/work-followup"

import { StudentWorkScreen } from "./student-work"

const program: StudentWorkProgram = {
  id: "p1",
  session: {
    id: "ses1",
    date: "2099-10-19",
    startTime: "16:00",
    endTime: "18:00",
    status: "SCHEDULED",
    groupClassId: "c1",
    groupName: "مجموعة الماهر",
    branchName: "الفرع الأول",
  },
  teacherName: "مريم بن علي",
  progress: { total: 3, active: 3, completed: 1, pending: 1, unfinished: 1, cancelled: 0, rate: 33.3 },
  items: [
    { id: "i1", type: "REVISION", description: "مراجعة من سورة الزمر\nإلى سورة الناس", status: "COMPLETED", recitationNumber: null, evaluationComment: "أداء متقن", carriedFrom: null },
    { id: "i2", type: "RECITATION", description: "العرضة الثانية من سورة التوبة", status: "NOT_EVALUATED", recitationNumber: 2, evaluationComment: null, carriedFrom: { sessionDate: "2099-10-15", status: "POSTPONED" } },
    { id: "i3", type: "EXAM", description: "اختبار من سورة الروم", status: "PARTIAL", recitationNumber: null, evaluationComment: null, carriedFrom: null },
  ],
}

function routeFetch() {
  const calls: URL[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      calls.push(url)
      if (url.pathname === "/api/student/work-programs") return json(200, { data: [program], meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 } })
      return json(404, { code: "NOT_FOUND" })
    })
  )
  return calls
}

const renderScreen = () =>
  renderWithClient(
    <DirectionProvider dir="rtl">
      <StudentWorkScreen />
    </DirectionProvider>
  )

beforeEach(() => {
  clearSession()
  setSession(authResponse("u1", ["STUDENT"]))
})

describe("student space — «متابعة العمل» (read-only)", () => {
  it("shows the session, the teacher, every item with its type, full text, result and the teacher's comment", async () => {
    routeFetch()
    renderScreen()
    expect(await screen.findByText("المعلم: مريم بن علي")).toBeTruthy()
    expect(screen.getByText("مجموعة الماهر — الفرع الأول")).toBeTruthy()
    expect(screen.getByText(/مراجعة من سورة الزمر/).textContent).toContain("\n")
    expect(screen.getAllByText("منجز").length).toBeGreaterThan(0)
    expect(screen.getByText("جزئي")).toBeTruthy()
    expect(screen.getByText("لم يُقيّم بعد")).toBeTruthy()
    expect(screen.getByText("أداء متقن")).toBeTruthy()
    expect(screen.getByText(/منقول من حصة .* — مؤجل/)).toBeTruthy()
    expect(screen.getByText("تم إنجاز 1 من أصل 3 أعمال")).toBeTruthy()
    // Nothing to change: no action buttons, no links to teacher pages
    expect(screen.queryByRole("button", { name: /تقييم|تعديل|نقل|إضافة/ })).toBeNull()
    expect(screen.queryAllByRole("link")).toHaveLength(0)
  })

  it("upcoming first; history on its own tab (asked to the API)", async () => {
    const calls = routeFetch()
    renderScreen()
    await screen.findByText("المعلم: مريم بن علي")
    expect(calls.find((c) => c.pathname === "/api/student/work-programs")!.searchParams.get("period")).toBe("upcoming")
    fireEvent.click(screen.getByRole("tab", { name: "الأعمال السابقة" }))
    await waitFor(() => expect(calls.some((c) => c.searchParams.get("period") === "past")).toBe(true))
  })
})
