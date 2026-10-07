"use client"

import Image from "next/image"
import Link from "next/link"

import { useOperations } from "@/lib/store/operations"
import { cn } from "@/lib/utils"

import logoMark from "../../../public/brand/logo-mark.png"
import logoFull from "../../../public/brand/logo.png"

/**
 * The official logo (AssociationSettings.logoUrl), falling back to the bundled
 * calligraphy mark. Used by every workspace and by the public website.
 */
export function AssociationLogo({ className }: { className?: string }) {
  const { associationSettings } = useOperations()
  if (!associationSettings.logoUrl) return <Image src={logoMark} alt="" className={className} priority />
  // A changed logo is a transient blob: preview (no upload in this phase)
  return <Image src={associationSettings.logoUrl} alt="" width={120} height={120} unoptimized className={cn("object-contain", className)} />
}

/** Logo + official name, for the sidebar and mobile drawer. */
export function Brand({ href = "/admin" }: { href?: string }) {
  const { associationSettings } = useOperations()
  return (
    <Link
      href={href}
      className="flex min-w-0 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <AssociationLogo className="h-12 w-auto max-w-14 shrink-0" />
      <span className="line-clamp-2 min-w-0 text-sm leading-snug font-semibold">{associationSettings.name}</span>
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
