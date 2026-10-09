"use client"

import { useQuery } from "@tanstack/react-query"
import { useEffect, useMemo } from "react"

import { fetchPrivateBlob } from "./client"

/** "/api/files/…" paths need the Bearer token (private storage). */
export const isPrivateFile = (url?: string | null): url is string => Boolean(url && url.startsWith("/api/files/"))

/**
 * An object URL for a private file (images, PDF, audio): fetched with the
 * access token, kept in memory only (never a public browser cache), and
 * revoked when the component unmounts. Public URLs pass through unchanged.
 */
export function usePrivateFileUrl(url?: string | null) {
  const query = useQuery({
    queryKey: ["private-file", url],
    queryFn: ({ signal }) => fetchPrivateBlob(url!, signal),
    enabled: isPrivateFile(url),
    staleTime: 5 * 60_000,
    gcTime: 5 * 60_000,
    retry: false,
  })
  const objectUrl = useMemo(() => (query.data ? URL.createObjectURL(query.data) : null), [query.data])
  // Released as soon as the component stops showing it
  useEffect(() => () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }, [objectUrl])
  if (!isPrivateFile(url)) return { src: url ?? null, isLoading: false, error: null }
  return { src: objectUrl, isLoading: query.isPending, error: query.error }
}
