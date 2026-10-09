"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"

/** Server-side pagination control (same look as the table pager). */
export function Pager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (page: number) => void }) {
  if (totalPages <= 1) return null
  return (
    <div className="mt-3 flex items-center justify-end gap-1 text-sm">
      <Button variant="outline" size="icon" aria-label="الصفحة السابقة" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronRight className="ltr:rotate-180" />
      </Button>
      <span className="min-w-14 text-center tabular-nums text-muted-foreground">
        {page} / {totalPages}
      </span>
      <Button variant="outline" size="icon" aria-label="الصفحة التالية" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        <ChevronLeft className="ltr:rotate-180" />
      </Button>
    </div>
  )
}
