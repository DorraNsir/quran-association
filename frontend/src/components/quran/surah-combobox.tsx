"use client"

import { ChevronsUpDown } from "lucide-react"
import { useState } from "react"

import { matchesText } from "@/components/shared/filters"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SURAHS, surahByNumber } from "@/lib/quran/surahs"
import { cn } from "@/lib/utils"
import type { SurahNumber } from "@/types/domain"

/**
 * Searchable picker over the 114 surahs. Returns the surah NUMBER.
 * Search accepts the Arabic name (hamza / ta-marbuta tolerant), the number
 * or the Latin transliteration. Reusable (admin now, Teacher Space later).
 */
export function SurahCombobox({
  id,
  value,
  onChange,
  invalid,
  className,
}: {
  id: string
  value?: SurahNumber
  onChange: (value: SurahNumber) => void
  invalid?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = value ? surahByNumber(value) : undefined

  return (
    // modal: the combobox is often opened inside a Dialog, whose scroll lock
    // would otherwise swallow wheel/touch scrolling in this (portaled) popover
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          className={cn("w-full justify-between bg-background font-normal", className)}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? (
              <>
                سورة {selected.nameAr}
                <span className="ms-1.5 text-xs text-muted-foreground tabular-nums">({selected.number})</span>
              </>
            ) : (
              "اختر السورة"
            )}
          </span>
          <ChevronsUpDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <Command filter={(_, search, keywords) => (!search || matchesText((keywords ?? []).join(" "), search) ? 1 : 0)}>
          <CommandInput placeholder="ابحث باسم السورة أو رقمها…" />
          {/* One scroll area: capped to the space available on screen, with a visible thin scrollbar */}
          <CommandList
            className="max-h-[min(18rem,calc(var(--radix-popover-content-available-height)-4rem))] [&::-webkit-scrollbar]:block [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border"
            style={{ scrollbarWidth: "thin" }}
          >
            <CommandEmpty>لا توجد سورة بهذا الاسم</CommandEmpty>
            <CommandGroup>
              {SURAHS.map((surah) => (
                <CommandItem
                  key={surah.number}
                  value={String(surah.number)}
                  keywords={[surah.nameAr, surah.nameLatin, surah.nameLatin.replace(/[-\s]/g, ""), String(surah.number)]}
                  data-checked={value === surah.number}
                  onSelect={() => {
                    onChange(surah.number)
                    setOpen(false)
                  }}
                >
                  <span className="w-7 shrink-0 text-xs text-muted-foreground tabular-nums">{surah.number}</span>
                  سورة {surah.nameAr}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
