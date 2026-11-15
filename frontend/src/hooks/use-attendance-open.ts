"use client"

import { useEffect, useRef, useState } from "react"

import { addDays, todayInTunis } from "@/lib/dates"
import { attendanceOpen } from "@/lib/session-actions"
import type { ISODate, SessionStatus } from "@/types/domain"

/** How often a waiting lesson re-checks the clock (the action turns on by itself). */
const TICK_MS = 15_000

/**
 * Whether attendance can be recorded for a lesson NOW (started, not
 * cancelled — Africa/Tunis), re-evaluated while a lesson of today or tomorrow
 * waits for its start, so the action is enabled at the start minute without
 * a page refresh. `onOpen` runs once when it opens while shown (e.g. to
 * refresh server state such as the roster's `editable` flag).
 */
export function useAttendanceOpen(session: { status: SessionStatus; date: ISODate; start: string }, onOpen?: () => void) {
  const [now, setNow] = useState(() => Date.now())
  const open = attendanceOpen(session, now)
  // Only a lesson about to start keeps a timer (not every future row of a list)
  const waiting = !open && session.status !== "CANCELLED" && session.date <= addDays(todayInTunis(), 1)
  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [waiting])
  const wasOpen = useRef(open)
  const callback = useRef(onOpen)
  useEffect(() => {
    callback.current = onOpen
  })
  useEffect(() => {
    if (open && !wasOpen.current) callback.current?.()
    wasOpen.current = open
  }, [open])
  return { open, now }
}
