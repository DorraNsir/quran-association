"use client"

import { FilterX, Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { labels } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export const ALL = "all"

export interface FilterOption {
  value: string
  label: string
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
  className?: string
}) {
  return (
    <InputGroup className={cn("bg-background", className)}>
      <InputGroupAddon>
        <Search aria-hidden />
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="[&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label="مسح البحث" onClick={() => onChange("")}>
            <X />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  )
}

export function FilterSelect({
  label,
  value,
  onValueChange,
  options,
  allLabel,
}: {
  label: string
  value: string
  onValueChange: (value: string) => void
  options: FilterOption[]
  allLabel: string
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        aria-label={label}
        className={cn(
          "w-full bg-background sm:w-auto sm:min-w-40",
          value !== ALL && "border-primary/40 bg-brand-soft/50"
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Search on top/at start, filter selects after it, reset when anything is active. */
export function FilterBar({
  search,
  children,
  hasActiveFilters,
  onReset,
  resultLabel,
}: {
  search: React.ReactNode
  children?: React.ReactNode
  hasActiveFilters: boolean
  onReset: () => void
  resultLabel: string
}) {
  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="lg:max-w-xs lg:flex-1">{search}</div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          {children}
        </div>
      </div>
      <div className="flex min-h-7 items-center justify-between gap-2 text-sm">
        <p className="text-muted-foreground" aria-live="polite">
          {resultLabel}
        </p>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={onReset}>
            <FilterX />
            {labels.common.resetFilters}
          </Button>
        )}
      </div>
    </div>
  )
}

/** Case-insensitive, whitespace- and diacritics-tolerant match for Arabic names. */
export function matchesText(haystack: string, needle: string) {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[ً-ْـ]/g, "") // tashkeel + tatweel
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/\s+/g, " ")
      .trim()
  return normalize(haystack).includes(normalize(needle))
}
