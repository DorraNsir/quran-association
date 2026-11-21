"use client"

import { Check, ChevronsUpDown } from "lucide-react"
import { useState } from "react"

import { matchesText } from "@/components/shared/filters"
import { UserAvatar } from "@/components/shared/user-avatar"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

import type { WorkClassOption, WorkStudentOption } from "./work-followup-provider"

const nameOf = (s: WorkStudentOption) => `${s.firstName} ${s.lastName}`

/**
 * «اختر الطالب»: searchable picker of the teacher's students, by class (group headings kept for
 * the matches). Each row: round photo (private, fetched with the token) or the first letter, and
 * the name. Search: the app's rule (Latin case, tashkeel and tatweel ignored, أ/إ/آ → ا …).
 */
export function StudentCombobox({
  id,
  value,
  onChange,
  students,
  classes,
  invalid,
}: {
  id: string
  value: string
  onChange: (studentId: string) => void
  students: WorkStudentOption[]
  classes: WorkClassOption[]
  invalid?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selected = students.find((s) => s.id === value)
  return (
    // modal: opened inside a Sheet, whose scroll lock would otherwise swallow scrolling here
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          className="h-auto min-h-9 w-full justify-between bg-background py-1.5 font-normal"
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected && <UserAvatar name={nameOf(selected)} photoUrl={selected.photoUrl ?? undefined} size="sm" />}
            <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected ? nameOf(selected) : "اختر الطالب"}</span>
          </span>
          <ChevronsUpDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <Command filter={(_, search, keywords) => (!search || matchesText((keywords ?? []).join(" "), search) ? 1 : 0)}>
          <CommandInput placeholder="البحث عن طالب..." aria-label="البحث عن طالب بالاسم" />
          <CommandList
            className="max-h-[min(20rem,calc(var(--radix-popover-content-available-height)-4rem))] [&::-webkit-scrollbar]:block [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border"
            style={{ scrollbarWidth: "thin" }}
          >
            <CommandEmpty>لا يوجد طالب بهذا الاسم</CommandEmpty>
            {classes.map((c) => {
              const own = students.filter((s) => s.groupClassId === c.id)
              return own.length === 0 ? null : (
                <CommandGroup key={c.id} heading={c.label}>
                  {own.map((s) => (
                    <CommandItem
                      key={s.id}
                      value={s.id}
                      keywords={[nameOf(s)]}
                      data-checked={s.id === value}
                      onSelect={() => {
                        onChange(s.id)
                        setOpen(false)
                      }}
                      className="gap-2.5 py-1.5"
                    >
                      <UserAvatar name={nameOf(s)} photoUrl={s.photoUrl ?? undefined} />
                      <span className="flex-1 truncate">{nameOf(s)}</span>
                      {s.id === value && <Check className="size-4 text-primary" aria-hidden />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
