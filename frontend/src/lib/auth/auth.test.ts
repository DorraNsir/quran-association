import { describe, expect, it } from "vitest"

import { authResponse } from "@/test/fetch-mock"

import { destinationAfterLogin } from "./redirects"
import { canUseWorkspace, landingPath } from "./session-user"

const user = (roles: ("ADMIN" | "TEACHER" | "STUDENT")[]) => authResponse("u", roles).user

describe("role-based redirection", () => {
  it("lands each role in its workspace (admin first for multi-role accounts)", () => {
    expect(landingPath(user(["ADMIN"]))).toBe("/admin")
    expect(landingPath(user(["TEACHER"]))).toBe("/teacher")
    expect(landingPath(user(["STUDENT"]))).toBe("/student")
    expect(landingPath(user(["TEACHER", "ADMIN"]))).toBe("/admin")
  })

  it("a teacher/student role without its profile has no workspace", () => {
    expect(canUseWorkspace({ roles: ["TEACHER"], teacherId: null, studentId: null }, "teacher")).toBe(false)
    expect(landingPath({ roles: ["STUDENT"], teacherId: null, studentId: null })).toBeNull()
  })

  it("follows ?next only for an internal workspace path the account may open", () => {
    const teacherAdmin = user(["ADMIN", "TEACHER"])
    expect(destinationAfterLogin(teacherAdmin, "/teacher/sessions?tab=pending")).toBe("/teacher/sessions?tab=pending")
    expect(destinationAfterLogin(user(["TEACHER"]), "/admin/settings")).toBe("/teacher")
    expect(destinationAfterLogin(user(["ADMIN"]), "//evil.example/admin")).toBe("/admin")
    expect(destinationAfterLogin(user(["ADMIN"]), "https://evil.example")).toBe("/admin")
    expect(destinationAfterLogin(user(["STUDENT"]), null)).toBe("/student")
  })
})
