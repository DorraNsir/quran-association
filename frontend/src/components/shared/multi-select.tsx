"use client"

import { ChevronsUpDown, Lock, X } from "lucide-react"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
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
import { cn } from "@/lib/utils"

export interface MultiSelectOption {
  value: string
  label: string
  description?: string
  /** Section heading inside the list */
  section?: string
  /** Selected and cannot be removed from here */
  locked?: boolean
}

/** Searchable multi-select with removable chips. */
export function MultiSelect({
  id,
  options,
  selected,
  onChange,
  placeholder,
  searchPlaceholder = "بحث…",
  emptyText = "لا توجد نتائج",
  countLabel,
  invalid,
}: {
  id: string
  options: MultiSelectOption[]
  selected: string[]
  onChange: (values: string[]) => void
  placeholder: string
  searchPlaceholder?: string
  emptyText?: string
  countLabel: (count: number) => string
  invalid?: boolean
}) {
  const [open, setOpen] = useState(false)
  const byValue = new Map(options.map((o) => [o.value, o]))
  const sections = [...new Set(options.map((o) => o.section ?? ""))]

  function toggle(option: MultiSelectOption) {
    if (option.locked) return
    onChange(
      selected.includes(option.value)
        ? selected.filter((v) => v !== option.value)
        : [...selected, option.value]
    )
  }

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={invalid || undefined}
            className="w-full justify-between font-normal"
          >
            <span className={cn(selected.length === 0 && "text-muted-foreground")}>
              {selected.length === 0 ? placeholder : countLabel(selected.length)}
            </span>
            <ChevronsUpDown className="text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              {sections.map((section) => (
                <CommandGroup key={section || "default"} heading={section || undefined}>
                  {options
                    .filter((o) => (o.section ?? "") === section)
                    .map((option) => (
                      <CommandItem
                        key={option.value}
                        value={option.value}
                        keywords={[option.label, option.description ?? ""]}
                        data-checked={selected.includes(option.value)}
                        disabled={option.locked}
                        onSelect={() => toggle(option)}
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate">{option.label}</span>
                          {option.description && (
                            <span className="truncate text-xs text-muted-foreground">
                              {option.description}
                            </span>
                          )}
                        </span>
                      </CommandItem>
                    ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="العناصر المختارة">
          {selected.map((value) => {
            const option = byValue.get(value)
            if (!option) return null
            return (
              <li key={value}>
                <Badge variant="secondary" className="h-6 gap-1 pe-1 font-normal">
                  {option.label}
                  {option.locked ? (
                    <Lock className="size-3 text-muted-foreground" aria-hidden />
                  ) : (
                    <button
                      type="button"
                      className="rounded-full p-0.5 hover:bg-foreground/10"
                      aria-label={`إزالة ${option.label}`}
                      onClick={() => toggle(option)}
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </Badge>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
