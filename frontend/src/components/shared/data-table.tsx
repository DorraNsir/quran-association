"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { usePlatformSettings } from "@/lib/store/settings"

export interface Column<T> {
  id: string
  header: React.ReactNode
  cell: (row: T) => React.ReactNode
  className?: string
}

/**
 * Responsive data table: a real <table> from `md` up, stacked cards below
 * when `renderMobileCard` is given.
 * Pagination is client-side for the mock phase (page size = platform preference); parents reset it on filter
 * changes by passing a new `key`.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  renderMobileCard,
  emptyState,
  caption,
}: {
  columns: Column<T>[]
  rows: T[]
  getRowId: (row: T) => string
  /** Card layout below `md`; without it the table scrolls horizontally */
  renderMobileCard?: (row: T) => React.ReactNode
  emptyState: React.ReactNode
  caption: string
}) {
  // Rows per page: one platform preference (/admin/settings/preferences) for every table
  const pageSize = usePlatformSettings().defaultPageSize
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const start = (currentPage - 1) * pageSize
  const visible = rows.slice(start, start + pageSize)

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {rows.length === 0 ? (
        emptyState
      ) : (
        <>
          <div className={cn(renderMobileCard && "hidden md:block")}>
            <Table>
              <caption className="sr-only">{caption}</caption>
              <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-transparent">
                  {columns.map((column) => (
                    <TableHead
                      key={column.id}
                      className={cn(
                        "h-10 px-4 text-start text-xs font-medium text-muted-foreground",
                        column.className
                      )}
                    >
                      {column.header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row) => (
                  <TableRow key={getRowId(row)}>
                    {columns.map((column) => (
                      <TableCell key={column.id} className={cn("px-4 py-3", column.className)}>
                        {column.cell(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {renderMobileCard && (
            <ul className="divide-y md:hidden" aria-label={caption}>
              {visible.map((row) => (
                <li key={getRowId(row)} className="p-4">
                  {renderMobileCard(row)}
                </li>
              ))}
            </ul>
          )}
          {pageCount > 1 && (
            <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm">
              <p className="text-muted-foreground">
                عرض <span className="tabular-nums">{start + 1}–{start + visible.length}</span> من{" "}
                <span className="tabular-nums">{rows.length}</span>
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="الصفحة السابقة"
                  disabled={currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  <ChevronRight className="ltr:rotate-180" />
                </Button>
                <span className="min-w-14 text-center tabular-nums text-muted-foreground">
                  {currentPage} / {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="الصفحة التالية"
                  disabled={currentPage === pageCount}
                  onClick={() => setPage(currentPage + 1)}
                >
                  <ChevronLeft className="ltr:rotate-180" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
