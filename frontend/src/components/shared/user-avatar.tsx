"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { usePrivateFileUrl } from "@/lib/api/private-file"
import { cn } from "@/lib/utils"

const sizes = {
  sm: "size-7 text-[0.7rem]",
  md: "size-9 text-xs",
  lg: "size-12 text-sm",
  xl: "size-20 text-xl",
}

/** Restrained palette: brand-tinted and neutral tones only. */
const tones = [
  "bg-brand-soft text-brand-soft-foreground",
  "bg-slate-100 text-slate-700",
  "bg-stone-100 text-stone-700",
  "bg-teal-50 text-teal-800",
  "bg-zinc-100 text-zinc-700",
]

/** One letter: joined Arabic initials read as a word fragment, and many
 *  family names start with the article "ال". */
function initial(name: string) {
  return name.trim().charAt(0)
}

function toneFor(name: string) {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return tones[hash % tones.length]
}

export function UserAvatar({
  name,
  photoUrl,
  size = "md",
  className,
}: {
  name: string
  photoUrl?: string
  size?: keyof typeof sizes
  className?: string
}) {
  // Profile photos are private files: fetched with the token, shown as an object URL
  const { src } = usePrivateFileUrl(photoUrl)
  return (
    <Avatar className={cn(sizes[size], className)}>
      {src && <AvatarImage src={src} alt={name} />}
      <AvatarFallback className={cn("font-semibold", toneFor(name))}>
        <span aria-hidden>{initial(name)}</span>
      </AvatarFallback>
    </Avatar>
  )
}

/** Avatar + name (+ optional secondary line) — used in tables and lists. */
export function PersonCell({
  name,
  photoUrl,
  secondary,
  size = "md",
}: {
  name: string
  photoUrl?: string
  secondary?: React.ReactNode
  size?: keyof typeof sizes
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <UserAvatar name={name} photoUrl={photoUrl} size={size} />
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">{name}</p>
        {secondary && (
          <p className="truncate text-xs text-muted-foreground">{secondary}</p>
        )}
      </div>
    </div>
  )
}
