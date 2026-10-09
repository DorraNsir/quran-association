"use client"

import { useLookups } from "@/lib/api/academic"
import type { Lookups } from "@/lib/domain"

import { QueryState } from "./query-state"

/** Renders children once the admin reference data (branches → weekly slots) is loaded from the API. */
export function WithLookups({ children }: { children: (lookups: Lookups) => React.ReactNode }) {
  const { lookups, results } = useLookups()
  return <QueryState query={results}>{lookups ? children(lookups) : null}</QueryState>
}
