import Image from "next/image"

import { cn } from "@/lib/utils"

/**
 * An admin-managed image (local asset, transient blob: preview, or a storage
 * URL later). `unoptimized` because CMS URLs are arbitrary; the parent sets
 * the aspect ratio. Without an image, a calm branded placeholder is shown.
 */
export function CmsImage({
  src,
  alt,
  className,
  sizes = "(min-width: 1024px) 33vw, 100vw",
  priority,
}: {
  src?: string
  alt: string
  className?: string
  sizes?: string
  priority?: boolean
}) {
  if (!src) {
    return (
      <div className={cn("absolute inset-0 bg-linear-to-br from-brand-soft to-muted", className)} role="img" aria-label={alt}>
        <Image src="/brand/logo-mark.png" alt="" width={64} height={70} className="absolute inset-0 m-auto h-14 w-auto opacity-30" />
      </div>
    )
  }
  return <Image src={src} alt={alt} fill unoptimized sizes={sizes} priority={priority} className={cn("object-cover", className)} />
}
