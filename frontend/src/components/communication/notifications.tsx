"use client"

import { Bell, CheckCheck, FolderOpen, Megaphone } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"

import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Pager } from "@/components/shared/pager"
import { QueryState } from "@/components/shared/query-state"
import { api } from "@/lib/api/client"
import { ApiError, errorMessage } from "@/lib/api/errors"
import {
  toNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from "@/lib/api/notifications"
import { useAuth } from "@/lib/auth/auth-provider"
import { notificationHref } from "@/lib/communication"
import { todayInTunis } from "@/lib/dates"
import { formatRelativeDay } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Workspace } from "@/lib/workspace"
import type { ISODate, UserNotification } from "@/types/domain"

/** The signed-in user's own notifications (the API only ever returns those). */
function useMyNotifications(pageSize: number) {
  const { user } = useAuth()
  const list = useNotifications({ pageSize })
  const unread = useUnreadCount()
  const mine = (list.data?.data ?? []).map((n) => toNotification(n, user?.id ?? ""))
  return { mine, unread: unread.data ?? 0, list, total: list.data?.meta.total ?? 0 }
}

function NotificationItem({
  notification,
  today,
  onOpen,
  onMarkRead,
}: {
  notification: UserNotification
  today: ISODate
  onOpen: () => void
  onMarkRead?: () => void
}) {
  const Icon = notification.entityType === "RESOURCE" ? FolderOpen : Megaphone
  return (
    <div className={cn("flex items-start gap-1 rounded-lg transition-colors hover:bg-muted", !notification.isRead && "bg-brand-soft/30")}>
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-start gap-3 p-2.5 text-start outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-lg">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block text-sm", !notification.isRead && "font-semibold")}>{notification.title}</span>
          <span className="block text-sm text-muted-foreground">{notification.message}</span>
          <span className="block text-xs text-muted-foreground">{formatRelativeDay(notification.createdAt, today)}</span>
        </span>
        {!notification.isRead && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="غير مقروء" />}
      </button>
      {onMarkRead && !notification.isRead && (
        <Button variant="ghost" size="icon" className="mt-1.5 size-8 shrink-0" aria-label="تحديد كمقروء" title="تحديد كمقروء" onClick={onMarkRead}>
          <CheckCheck className="size-4" />
        </Button>
      )}
    </div>
  )
}

/**
 * Opening a notification marks it read, then follows it inside the current
 * workspace — only if the content is still accessible NOW (a notification
 * grants no access: the API answers 404 for content the account lost).
 */
function useOpenNotification(workspace: Workspace, after?: () => void) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const markRead = useMarkNotificationRead()
  return async (n: UserNotification) => {
    if (!n.isRead) markRead.mutate(n.id)
    after?.()
    const href = notificationHref(n, workspace)
    if (!href || !n.entityId) return
    const section = n.entityType === "RESOURCE" ? "resources" : "announcements"
    try {
      await queryClient.fetchQuery({
        queryKey: [section, workspace, "detail", n.entityId],
        queryFn: ({ signal }) => api(`/${workspace}/${section}/${n.entityId}`, { signal }),
      })
      router.push(href)
    } catch (error) {
      toast.error(error instanceof ApiError && error.isNotFound ? "لم يعد هذا المحتوى متاحًا لحسابك." : errorMessage(error))
    }
  }
}

/** Header bell with unread count and the latest notifications. */
export function NotificationBell({ workspace }: { workspace: Workspace }) {
  const [open, setOpen] = useState(false)
  const today = todayInTunis()
  const { mine, unread } = useMyNotifications(6)
  const markAll = useMarkAllNotificationsRead()
  const openNotification = useOpenNotification(workspace, () => setOpen(false))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={unread > 0 ? `الإشعارات (${unread} غير مقروءة)` : "الإشعارات"}>
          <Bell className="size-[1.1rem]" />
          {unread > 0 && (
            <span data-testid="unread-count" className="absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.65rem] font-semibold text-white tabular-nums">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
          <p className="text-sm font-semibold">الإشعارات</p>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-primary" disabled={markAll.isPending} onClick={() => markAll.mutate()}>
              تحديد الكل كمقروء
            </Button>
          )}
        </div>
        <div className="max-h-[min(24rem,60svh)] overflow-y-auto p-1.5">
          {mine.length === 0 ? (
            <EmptyState icon={Bell} title="لا توجد إشعارات جديدة" className="py-8" />
          ) : (
            mine.slice(0, 6).map((n) => (
              <NotificationItem key={n.id} notification={n} today={today} onOpen={() => void openNotification(n)} />
            ))
          )}
        </div>
        <div className="border-t p-1.5">
          <Button asChild variant="ghost" size="sm" className="w-full text-primary" onClick={() => setOpen(false)}>
            <Link href={`/${workspace}/notifications`}>عرض كل الإشعارات</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** Full list of the user's notifications, per workspace route (newest first, paginated). */
export function NotificationsPage({ workspace }: { workspace: Workspace }) {
  const [page, setPage] = useState(1)
  const today = todayInTunis()
  const { user } = useAuth()
  const list = useNotifications({ page, pageSize: 20 })
  const unread = useUnreadCount().data ?? 0
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()
  const openNotification = useOpenNotification(workspace)
  const mine = (list.data?.data ?? []).map((n) => toNotification(n, user?.id ?? ""))
  const totalPages = list.data?.meta.totalPages ?? 1

  return (
    <>
      <PageHeader
        title="الإشعارات"
        description={unread > 0 ? `${unread} غير مقروءة` : "كل إشعاراتك مقروءة."}
        actions={
          unread > 0 && (
            <Button variant="outline" disabled={markAll.isPending} onClick={() => markAll.mutate()}>
              <CheckCheck />
              تحديد الكل كمقروء
            </Button>
          )
        }
      />
      <Card className="gap-0 p-1.5">
        <QueryState query={list} empty={mine.length === 0} emptyIcon={Bell} emptyTitle="لا توجد إشعارات">
          <ul className="space-y-0.5">
            {mine.map((n) => (
              <li key={n.id}>
                <NotificationItem
                  notification={n}
                  today={today}
                  onOpen={() => void openNotification(n)}
                  onMarkRead={() => markRead.mutate(n.id)}
                />
              </li>
            ))}
          </ul>
        </QueryState>
      </Card>
      <Pager page={page} totalPages={totalPages} onPage={setPage} />
    </>
  )
}
