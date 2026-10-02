"use client"

import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export interface ProfileTab {
  value: string
  label: string
  /** Rendered icon element, e.g. <ClipboardCheck /> (server-safe) */
  icon: React.ReactNode
  content: React.ReactNode
  /** Planned module — shown, but marked as later */
  later?: boolean
}

/** Underlined tabs that scroll horizontally on small screens. */
export function ProfileTabs({ tabs, defaultValue }: { tabs: ProfileTab[]; defaultValue?: string }) {
  return (
    <Tabs defaultValue={defaultValue ?? tabs[0]?.value} className="gap-6">
      <ScrollArea className="w-full border-b">
        <TabsList variant="line" className="h-11 gap-4 p-0">
          {tabs.map(({ value, label, icon, later }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="flex-none px-1 data-active:text-primary group-data-[variant=line]/tabs-list:data-active:after:bg-primary"
            >
              {icon}
              {label}
              {later && (
                <span className="rounded-full bg-muted px-1.5 text-[0.65rem] font-normal text-muted-foreground">
                  لاحقًا
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        <ScrollBar orientation="horizontal" className="h-1.5" />
      </ScrollArea>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  )
}
