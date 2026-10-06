"use client"

import { Bell, CheckCheck, FolderOpen, Megaphone } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { getNotificationsForUser, notificationHref } from "@/lib/communication"
import { formatRelativeDay } from "@/lib/format"
import { operations, useOperations } from "@/lib/store/operations"
import { cn } from "@/lib/utils"
import type { Workspace } from "@/lib/workspace"
import type { ID, ISODate, UserNotification } from "@/types/domain"

/** The signed-in user's own notifications (never anyone else's). */
function useMyNotifications(userId: ID) {
  const { notifications } = useOperations()
  const mine = getNotificationsForUser(userId, notifications)
  return { mine, unread: mine.filter((n) => !n.isRead).length }
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

/** Opening a notification marks it read, then follows it inside the current workspace. */
function useOpenNotification(userId: ID, workspace: Workspace, after?: () => void) {
  const router = useRouter()
  return (n: UserNotification) => {
    operations.markNotificationRead(n.id, userId)
    after?.()
    const href = notificationHref(n, workspace)
    if (href) router.push(href)
  }
}

/** Header bell with unread count and the latest notifications. */
export function NotificationBell({ userId, workspace, today }: { userId: ID; workspace: Workspace; today: ISODate }) {
  const [open, setOpen] = useState(false)
  const { mine, unread } = useMyNotifications(userId)
  const openNotification = useOpenNotification(userId, workspace, () => setOpen(false))

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
            <Button variant="ghost" size="sm" className="h-7 text-primary" onClick={() => operations.markAllNotificationsRead(userId)}>
              تحديد الكل كمقروء
            </Button>
          )}
        </div>
        <div className="max-h-[min(24rem,60svh)] overflow-y-auto p-1.5">
          {mine.length === 0 ? (
            <EmptyState icon={Bell} title="لا توجد إشعارات جديدة" className="py-8" />
          ) : (
            mine.slice(0, 6).map((n) => (
              <NotificationItem key={n.id} notification={n} today={today} onOpen={() => openNotification(n)} />
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

/** Full list of the user's notifications, per workspace route. */
export function NotificationsPage({ userId, workspace, today }: { userId: ID; workspace: Workspace; today: ISODate }) {
  const { mine, unread } = useMyNotifications(userId)
  const openNotification = useOpenNotification(userId, workspace)

  return (
    <>
      <PageHeader
        title="الإشعارات"
        description={unread > 0 ? `${unread} غير مقروءة` : "كل إشعاراتك مقروءة."}
        actions={
          unread > 0 && (
            <Button variant="outline" onClick={() => operations.markAllNotificationsRead(userId)}>
              <CheckCheck />
              تحديد الكل كمقروء
            </Button>
          )
        }
      />
      <Card className="gap-0 p-1.5">
        {mine.length === 0 ? (
          <EmptyState icon={Bell} title="لا توجد إشعارات جديدة" />
        ) : (
          <ul className="space-y-0.5">
            {mine.map((n) => (
              <li key={n.id}>
                <NotificationItem notification={n} today={today} onOpen={() => openNotification(n)}
                  onMarkRead={() => operations.markNotificationRead(n.id, userId)} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
