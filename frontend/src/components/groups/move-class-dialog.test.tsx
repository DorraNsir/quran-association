import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { Button } from "@/components/ui/button"
import { DirectionProvider } from "@/components/ui/direction"
import { ApiError } from "@/lib/api/errors"
import { clearSession, setSession } from "@/lib/api/session"
import type { Lookups } from "@/lib/domain"
import { authResponse, json } from "@/test/fetch-mock"
import { renderWithClient } from "@/test/render"
import type { Group, GroupClass, Student } from "@/types/domain"

import { MoveClassDialog } from "./move-class-dialog"
import { classActions, useGroupDialogs } from "./use-group-dialogs"

const push = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
Element.prototype.scrollIntoView ??= () => {}
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.releasePointerCapture ??= () => {}

const group = (id: string, name: string, status: Group["status"] = "ACTIVE"): Group => ({ id, name, audience: "", status, createdAt: "2026-09-01" })
const lookups: Lookups = {
  branches: [{ id: "b1", name: "فرع المركز", address: "نابل", status: "ACTIVE" }],
  rooms: [],
  groups: [group("gA", "أركان"), group("gB", "الماهر"), group("gI", "النور", "INACTIVE"), group("gZ", "القديمة", "ARCHIVED")],
  groupClasses: [{ id: "cA", groupId: "gA", branchId: "b1", supervisorId: "t1", assistantIds: [], status: "ACTIVE" }],
  teachers: [{ id: "t1", firstName: "درة", lastName: "ن", phone: "", status: "ACTIVE", joinedAt: "2024-09-01" }],
  schedules: [],
}
const [gA] = lookups.groups
const cA: GroupClass = lookups.groupClasses[0]
const pupil = { id: "st1", firstName: "سلمى", lastName: "المؤدب", groupClassId: "cA", status: "ACTIVE" } as unknown as Student

const ELIGIBLE = {
  groupClassId: "cA",
  from: { id: "gA", name: "أركان", status: "ACTIVE" },
  to: { id: "gB", name: "الماهر", status: "ACTIVE" },
  eligible: true,
  blocks: [],
  keeps: { weeklySchedules: 2, plannedSessions: 5, teachers: 1, onboardingLinks: 0 },
  destinationFee: "200.000",
}
const BLOCKED = {
  ...ELIGIBLE,
  eligible: false,
  blocks: [
    { code: "HAS_STUDENTS", count: 1, message: "ضمّ هذا القسم طالبًا من قبل. أنشئ القسم في المجموعة الصحيحة، ثم انقل الطلبة إليه عبر «تغيير المجموعة»." },
    { code: "HAS_ATTENDANCE", count: 3, message: "سُجّل الحضور في 3 حصص من حصصه." },
  ],
}

/** Answers the preview with the next plan of `plans` (the last one repeats) and the move with `move` */
function stubApi(plans: object[], move: () => Response = () => json(200, { id: "cA" })) {
  const calls: { url: string; method: string; body?: string }[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, method: init?.method ?? "GET", body: init?.body as string | undefined })
      if (url.includes("/move-preview")) return json(200, plans.length > 1 ? plans.shift() : plans[0])
      if (url.endsWith("/move")) return move()
      return json(200, [])
    })
  )
  return calls
}
const renderDialog = (students: Student[] = [], onConfirm = vi.fn(async () => {})) => {
  renderWithClient(
    <DirectionProvider dir="rtl">
      <MoveClassDialog open onOpenChange={() => {}} group={gA} groupClass={cA} lookups={lookups} students={students} onConfirm={onConfirm} />
    </DirectionProvider>
  )
  return onConfirm
}
async function pickGroup(dialog: HTMLElement, name: RegExp) {
  fireEvent.click(within(dialog).getByRole("combobox"))
  fireEvent.click(await screen.findByRole("option", { name }))
}
const confirmButton = (dialog: HTMLElement) => within(dialog).getByRole("button", { name: "نقل القسم" }) as HTMLButtonElement

beforeEach(() => {
  clearSession()
  setSession(authResponse("admin"))
  push.mockClear()
})

describe("«نقل القسم إلى مجموعة أخرى»", () => {
  it("is in the class menu directly below «تعديل القسم»", () => {
    const labels = classActions(gA, cA, () => {}).map((a) => a.label)
    expect(labels.slice(0, 2)).toEqual(["تعديل القسم", "نقل القسم إلى مجموعة أخرى"])
  })

  it("shows the current group; destinations exclude it and archived groups, an inactive one is labelled", async () => {
    stubApi([ELIGIBLE])
    renderDialog()
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("المجموعة الحالية").parentElement!.textContent).toContain("أركان")
    expect(confirmButton(dialog).disabled).toBe(true)
    fireEvent.click(within(dialog).getByRole("combobox"))
    const options = (await screen.findAllByRole("option")).map((o) => o.textContent)
    expect(options).toEqual(["الماهر", "النور— غير نشط"])
  })

  it("an eligible class: what it keeps and the destination fee, then the move is sent", async () => {
    stubApi([ELIGIBLE])
    const onConfirm = renderDialog()
    const dialog = await screen.findByRole("dialog")
    await pickGroup(dialog, /الماهر/)
    const keeps = await within(dialog).findByRole("region", { name: "ما يبقى مع القسم" })
    const text = keeps.textContent!.replace(/\s+/g, " ")
    expect(text).toContain("المواعيد الأسبوعية:2")
    expect(text).toContain("الحصص المبرمجة:5")
    expect(text).toContain("المعلمون:1")
    expect(text).not.toContain("روابط استكمال البيانات")
    expect(text).toContain("معلوم مجموعة «الماهر» للسنة الدراسية الحالية: 200 د.ت")
    fireEvent.click(confirmButton(dialog))
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("gB"))
  })

  it("a destination without a fee for the current year says so", async () => {
    stubApi([{ ...ELIGIBLE, destinationFee: null }])
    renderDialog()
    const dialog = await screen.findByRole("dialog")
    await pickGroup(dialog, /الماهر/)
    expect(await within(dialog).findByText(/لم يُحدَّد بعد معلوم مجموعة «الماهر»/)).toBeTruthy()
  })

  it("a blocked class: every reason is listed and the move cannot be confirmed", async () => {
    stubApi([BLOCKED])
    const onConfirm = renderDialog()
    const dialog = await screen.findByRole("dialog")
    await pickGroup(dialog, /الماهر/)
    const alert = await within(dialog).findByRole("alert")
    expect(within(alert).getByText("لا يمكن نقل هذا القسم")).toBeTruthy()
    expect(within(alert).getAllByRole("listitem").map((li) => li.textContent)).toEqual(BLOCKED.blocks.map((b) => b.message))
    expect(confirmButton(dialog).disabled).toBe(true)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it("a class with students: explains to recreate it and use «تغيير المجموعة»; nothing to choose", async () => {
    const calls = stubApi([ELIGIBLE])
    renderDialog([pupil])
    const dialog = await screen.findByRole("dialog")
    const alert = within(dialog).getByRole("alert")
    expect(alert.textContent).toMatch(/لا يمكن نقل قسم يضم طلبة/)
    expect(alert.textContent).toMatch(/أنشئ القسم في المجموعة الصحيحة، ثم انقل الطلبة إليه عبر «تغيير المجموعة»/)
    expect(within(dialog).queryByRole("combobox")).toBeNull()
    expect(confirmButton(dialog).disabled).toBe(true)
    expect(calls).toEqual([])
  })

  it("a preview that became stale: the refusal is shown and the preview reloaded with its reasons", async () => {
    stubApi([ELIGIBLE, BLOCKED])
    const onConfirm = vi.fn(async () => {
      throw new ApiError(409, "GROUP_CLASS_MOVE_REFUSED", "لا يمكن نقل هذا القسم: ضمّ هذا القسم طالبًا من قبل.")
    })
    renderDialog([], onConfirm)
    const dialog = await screen.findByRole("dialog")
    await pickGroup(dialog, /الماهر/)
    await within(dialog).findByRole("region", { name: "ما يبقى مع القسم" })
    fireEvent.click(confirmButton(dialog))
    expect(await within(dialog).findByText(/لا يمكن نقل هذا القسم: ضمّ هذا القسم طالبًا من قبل/)).toBeTruthy()
    expect(await within(dialog).findByText(BLOCKED.blocks[1].message)).toBeTruthy()
    expect(confirmButton(dialog).disabled).toBe(true)
  })
})

/** The class menu's dialogs, as the group page uses them */
function Harness() {
  const { runClass, dialogs } = useGroupDialogs({ lookups, students: [] })
  return (
    <>
      <Button onClick={() => runClass("move-class", gA, cA)}>نقل</Button>
      {dialogs}
    </>
  )
}

describe("«نقل القسم» from the class menu", () => {
  it("sends the move, then opens the destination group at «أقسام المجموعة»", async () => {
    const calls = stubApi([ELIGIBLE])
    renderWithClient(
      <DirectionProvider dir="rtl">
        <Harness />
      </DirectionProvider>
    )
    fireEvent.click(screen.getByRole("button", { name: "نقل" }))
    const dialog = await screen.findByRole("dialog")
    await pickGroup(dialog, /الماهر/)
    await within(dialog).findByRole("region", { name: "ما يبقى مع القسم" })
    fireEvent.click(confirmButton(dialog))
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/groups/gB#group-classes"))
    const sent = calls.find((c) => c.url.endsWith("/admin/group-classes/cA/move"))
    expect(sent).toMatchObject({ method: "POST" })
    expect(JSON.parse(sent!.body!)).toEqual({ groupId: "gB" })
  })

  it("a refusal (409) stays in the dialog: no navigation", async () => {
    stubApi([ELIGIBLE, BLOCKED], () =>
      json(409, { statusCode: 409, code: "GROUP_CLASS_MOVE_REFUSED", message: "لا يمكن نقل هذا القسم: سُجّل الحضور في 3 حصص من حصصه." })
    )
    renderWithClient(
      <DirectionProvider dir="rtl">
        <Harness />
      </DirectionProvider>
    )
    fireEvent.click(screen.getByRole("button", { name: "نقل" }))
    const dialog = await screen.findByRole("dialog")
    await pickGroup(dialog, /الماهر/)
    await within(dialog).findByRole("region", { name: "ما يبقى مع القسم" })
    fireEvent.click(confirmButton(dialog))
    expect(await within(dialog).findByText(/لا يمكن نقل هذا القسم: سُجّل الحضور/)).toBeTruthy()
    expect(push).not.toHaveBeenCalled()
  })
})
