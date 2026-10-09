"use client"

import Image from "next/image"
import Link from "next/link"

import { FALLBACK_ASSOCIATION_NAME, logoSrc, usePublicSiteSettings } from "@/lib/api/public-settings"
import { cn } from "@/lib/utils"

import logoMark from "../../../public/brand/logo-mark.png"
import logoFull from "../../../public/brand/logo.png"

/**
 * The official logo (uploaded through the settings), falling back to the bundled
 * calligraphy mark. Used by every workspace and by the public website.
 */
export function AssociationLogo({ className }: { className?: string }) {
  const { data } = usePublicSiteSettings()
  const src = logoSrc(data)
  if (!src) return <Image src={logoMark} alt="" className={className} priority />
  // The approved uploaded logo, served by /api/public/files/:id
  return <Image src={src} alt="" width={120} height={120} unoptimized className={cn("object-contain", className)} />
}

/** Logo + official name, for the sidebar and mobile drawer. */
export function Brand({ href = "/admin" }: { href?: string }) {
  const { data } = usePublicSiteSettings()
  return (
    <Link
      href={href}
      className="flex min-w-0 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <AssociationLogo className="h-12 w-auto max-w-14 shrink-0" />
      <span className="line-clamp-2 min-w-0 text-sm leading-snug font-semibold">{data?.name ?? FALLBACK_ASSOCIATION_NAME}</span>
    </Link>
  )
}

/** Full calligraphy artwork (static) — for standalone pages outside the workspaces. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <Image
      src={logoFull}
      alt="الفرع المحلي عمر بن الخطاب بدار شعبان الفهري"
      className={cn("h-auto w-48", className)}
      priority
    />
  )
}
