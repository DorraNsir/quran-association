"use client"

import { useEffect } from "react"

/** How long late content above the target (queries loading) may still shift it */
const SETTLE_MS = 2000

/**
 * Scrolls to the element `id` when the URL hash names it (e.g. a link to
 * `/admin/groups/[id]#group-classes`). Rendered with that element, so it runs
 * once the client-loaded page shows it; content loading above it may push it
 * down for a moment, so it is re-aligned until the page settles — or until
 * the user scrolls on their own.
 */
export function ScrollToHash({ id }: { id: string }) {
  useEffect(() => {
    if (window.location.hash !== `#${id}`) return
    const align = () => document.getElementById(id)?.scrollIntoView({ block: "start" })
    align()
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(align)
    observer?.observe(document.body)
    const stop = () => {
      observer?.disconnect()
      for (const event of ["wheel", "touchstart", "keydown", "pointerdown"]) window.removeEventListener(event, stop)
    }
    for (const event of ["wheel", "touchstart", "keydown", "pointerdown"]) window.addEventListener(event, stop, { once: true, passive: true })
    const timer = window.setTimeout(stop, SETTLE_MS)
    return () => {
      window.clearTimeout(timer)
      stop()
    }
  }, [id])
  return null
}
