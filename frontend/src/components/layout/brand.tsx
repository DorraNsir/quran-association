import Image from "next/image"
import Link from "next/link"

import { cn } from "@/lib/utils"

import logoMark from "../../../public/brand/logo-mark.png"
import logoFull from "../../../public/brand/logo.png"

export const ASSOCIATION_NAME = "الفرع المحلي عمر بن الخطاب"
export const ASSOCIATION_PLACE = "بدار شعبان الفهري"

/** Calligraphy mark + name, for the sidebar and mobile drawer. */
export function Brand({ href = "/admin" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="flex min-w-0 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Image src={logoMark} alt="" className="h-12 w-auto shrink-0" priority />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-semibold">{ASSOCIATION_NAME}</span>
        <span className="truncate text-xs text-muted-foreground">{ASSOCIATION_PLACE}</span>
      </span>
    </Link>
  )
}

/** Full logo with the association's name — for standalone pages. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <Image
      src={logoFull}
      alt={`${ASSOCIATION_NAME} ${ASSOCIATION_PLACE}`}
      className={cn("h-auto w-48", className)}
      priority
    />
  )
}
