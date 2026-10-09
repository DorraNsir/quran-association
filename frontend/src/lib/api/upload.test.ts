import { afterEach, describe, expect, it, vi } from "vitest"

import { authResponse } from "@/test/fetch-mock"

import { uploadFile } from "./client"
import { fileSizeError, RESOURCE_FILE_RULES } from "./resources"
import { clearSession, setSession } from "./session"

/** Minimal XMLHttpRequest double: reports progress, then answers. */
class FakeXhr {
  static instances: FakeXhr[] = []
  static answer = { status: 201, body: { id: "file-1" } }
  upload: { onprogress?: (e: { lengthComputable: boolean; loaded: number; total: number }) => void } = {}
  headers: Record<string, string> = {}
  url = ""
  withCredentials = false
  status = 0
  responseText = ""
  sent?: FormData
  onload?: () => void
  onerror?: () => void
  onabort?: () => void
  constructor() {
    FakeXhr.instances.push(this)
  }
  open(_method: string, url: string) {
    this.url = url
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value
  }
  abort() {
    this.onabort?.()
  }
  send(body: FormData) {
    this.sent = body
    this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 })
    this.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 })
    this.status = FakeXhr.answer.status
    this.responseText = JSON.stringify(FakeXhr.answer.body)
    this.onload?.()
  }
}

afterEach(() => {
  FakeXhr.instances = []
  clearSession()
})

describe("file upload", () => {
  it("posts multipart `file` with the purpose, the Bearer token and progress events", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr)
    setSession(authResponse("admin"))
    const progress: number[] = []
    const file = new File(["%PDF"], "درس.pdf", { type: "application/pdf" })
    const stored = await uploadFile<{ id: string }>("/files", { purpose: "EDUCATIONAL_RESOURCE", groupClassId: "c1" }, file, {
      onProgress: (p) => progress.push(p),
    })
    expect(stored.id).toBe("file-1")
    const xhr = FakeXhr.instances[0]
    expect(xhr.url).toBe("http://api.test/api/files?purpose=EDUCATIONAL_RESOURCE&groupClassId=c1")
    expect(xhr.headers.Authorization).toBe("Bearer token-admin")
    expect(xhr.withCredentials).toBe(true)
    expect((xhr.sent?.get("file") as File).name).toBe("درس.pdf")
    expect(progress).toEqual([50, 100])
  })

  it("an API rejection becomes an Arabic error", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr)
    FakeXhr.answer = { status: 400, body: { code: "FILE_TYPE_NOT_ALLOWED" } as never }
    await expect(uploadFile("/files", { purpose: "CMS_IMAGE" }, new File(["x"], "a.svg"))).rejects.toMatchObject({
      code: "FILE_TYPE_NOT_ALLOWED",
      message: "نوع الملف غير مسموح به.",
    })
    FakeXhr.answer = { status: 201, body: { id: "file-1" } }
  })

  it("checks type and size before sending (images 5 MB, PDF 15 MB, audio 25 MB)", () => {
    const big = (type: string, mb: number) => new File([new Uint8Array(mb * 1024 * 1024 + 1)], "f", { type })
    expect(fileSizeError(big("image/png", 5))).toMatch(/5 م.ب/)
    expect(fileSizeError(big("application/pdf", 5))).toBeUndefined()
    expect(fileSizeError(big("application/pdf", 15))).toMatch(/15 م.ب/)
    expect(RESOURCE_FILE_RULES.IMAGE?.mimes).not.toContain("image/svg+xml")
  })
})
