import { screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DirectionProvider } from "@/components/ui/direction"
import { clearSession, setSession } from "@/lib/api/session"
import type { Lookups } from "@/lib/domain"
import { authResponse } from "@/test/fetch-mock"
import { renderWithClient } from "@/test/render"
import type { GroupClass } from "@/types/domain"

import { GroupsView } from "./groups-view"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }))

/** Groups with 0, 1, 4, 5 and 12 classes (one branch per class, to tell them apart). */
const SIZES = { g0: 0, g1: 1, g4: 4, g5: 5, g12: 12 } as const
const classes: GroupClass[] = Object.entries(SIZES).flatMap(([groupId, n]) =>
  Array.from({ length: n }, (_, i) => ({
    id: `${groupId}-c${i + 1}`,
    groupId,
    branchId: `${groupId}-b${i + 1}`,
    supervisorId: "t1",
    assistantIds: [],
    status: "ACTIVE" as const,
  }))
)
const lookups: Lookups = {
  branches: classes.map((c, i) => ({ id: c.branchId, name: `فرع ${c.groupId}-${i}`, address: "نابل", status: "ACTIVE" as const })),
  rooms: [],
  groups: Object.keys(SIZES).map((id) => ({ id, name: `مجموعة ${id}`, audience: "أطفال", status: "ACTIVE" as const, createdAt: "2026-09-01" })),
  groupClasses: classes,
  teachers: [{ id: "t1", firstName: "درة", lastName: "ن", phone: "", status: "ACTIVE", joinedAt: "2024-09-01" }],
  schedules: [],
}

const renderView = () =>
  renderWithClient(
    <DirectionProvider dir="rtl">
      <GroupsView lookups={lookups} students={[]} />
    </DirectionProvider>
  )
/** The card of a group (its title link leads to the group page) */
const card = (groupId: string) => screen.getByRole("link", { name: `مجموعة ${groupId}` }).closest("[data-slot=card]") as HTMLElement
const previewed = (groupId: string) => within(card(groupId)).queryAllByText(/^فرع /).length

beforeEach(() => {
  clearSession()
  setSession(authResponse("admin"))
})

describe("groups list — cards", () => {
  it("previews at most 4 classes per card, in the group's order", () => {
    renderView()
    expect(previewed("g0")).toBe(0)
    expect(within(card("g0")).getByText("لا توجد أقسام بعد")).toBeTruthy()
    expect(previewed("g1")).toBe(1)
    expect(previewed("g4")).toBe(4)
    expect(previewed("g5")).toBe(4)
    expect(previewed("g12")).toBe(4)
    // The first four, in order
    const names = within(card("g12")).getAllByText(/^فرع /).map((el) => el.textContent?.split(" · ")[0])
    expect(names).toEqual(classes.filter((c) => c.groupId === "g12").slice(0, 4).map((c) => lookups.branches.find((b) => b.id === c.branchId)!.name))
  })

  it("«عرض جميع الأقسام (N)» only above 4 classes, to the group page's «أقسام المجموعة»", () => {
    renderView()
    for (const g of ["g0", "g1", "g4"]) expect(within(card(g)).queryByRole("link", { name: /عرض جميع الأقسام/ })).toBeNull()
    expect(within(card("g5")).getByRole("link", { name: "عرض جميع الأقسام (5)" }).getAttribute("href")).toBe("/admin/groups/g5#group-classes")
    expect(within(card("g12")).getByRole("link", { name: "عرض جميع الأقسام (12)" }).getAttribute("href")).toBe("/admin/groups/g12#group-classes")
  })

  it("cards of a row share the tallest height; the classes are never pushed to the bottom", () => {
    const { container } = renderView()
    expect(container.querySelector("ul.grid")!.className).not.toMatch(/items-start/)
    for (const g of Object.keys(SIZES)) {
      expect(card(g).className).toMatch(/\bh-full\b/)
      expect(card(g).innerHTML).not.toMatch(/mt-auto|justify-end/)
    }
  })
})
