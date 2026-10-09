"use client"

import { Archive, CalendarClock, CalendarDays, CalendarX2, Eye, Loader2, Megaphone, Pencil, Plus, SearchX, Send, Target, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { ActionsMenu, type RowAction } from "@/components/shared/actions-menu"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { EmptyState } from "@/components/shared/empty-state"
import { ALL, FilterBar, FilterSelect, SearchInput } from "@/components/shared/filters"
import { NotFoundState } from "@/components/shared/not-found-state"
import { Breadcrumbs, PageHeader } from "@/components/shared/page-header"
import { Pager } from "@/components/shared/pager"
import { QueryState } from "@/components/shared/query-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  useAnnouncement,
  useAnnouncementAction,
  useAnnouncements,
  useCreateAnnouncement,
  useUpdateAnnouncement,
  type AnnouncementDto,
  type AnnouncementScope,
  type AnnouncementState,
  type AnnouncementStatus,
} from "@/lib/api/announcements"
import { ApiError, errorMessage } from "@/lib/api/errors"
import { todayInTunis, tunisDateOf, tunisTimeOf } from "@/lib/dates"
import type { Lookups } from "@/lib/domain"
import { formatDate, formatRelativeDay } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { usePlatformSettings } from "@/lib/store/settings"
import { cn } from "@/lib/utils"
import type { AnnouncementAudienceType, ID } from "@/types/domain"

import { AnnouncementFormSheet, type AnnouncementFormResult } from "./announcement-form-sheet"

const STATE_LABEL: Record<AnnouncementState, { label: string; className: string }> = {
  ACTIVE: { label: "منشور", className: "bg-brand-soft text-brand-soft-foreground" },
  SCHEDULED: { label: "مجدول", className: "bg-muted text-foreground" },
  DRAFT: { label: "مسودة", className: "bg-warning-soft text-warning" },
  EXPIRED: { label: "منتهي", className: "bg-muted text-muted-foreground" },
  ARCHIVED: { label: "مؤرشف", className: "bg-muted text-muted-foreground" },
}
const STATUS_FILTER: { value: AnnouncementStatus; label: string }[] = [
  { value: "PUBLISHED", label: "منشور" },
  { value: "SCHEDULED", label: "مجدول" },
  { value: "DRAFT", label: "مسودة" },
  { value: "ARCHIVED", label: "مؤرشف" },
]
const AUDIENCES: AnnouncementAudienceType[] = ["EVERYONE", "TEACHERS", "STUDENTS", "SPECIFIC_GROUP_CLASSES", "SPECIFIC_BRANCHES"]

/** Publication day of an announcement (Africa/Tunis), or its scheduled day. */
const dayOf = (a: AnnouncementDto) => (a.publishedAt ? tunisDateOf(a.publishedAt) : a.scheduledFor ? tunisDateOf(a.scheduledFor) : tunisDateOf(a.createdAt))
const scheduleLabel = (a: AnnouncementDto) =>
  a.scheduledFor ? `${formatDate(tunisDateOf(a.scheduledFor))} على الساعة ${tunisTimeOf(a.scheduledFor)}` : ""

export function AnnouncementAudienceBadge({ audience }: { audience: AnnouncementAudienceType }) {
  return (
    <Badge variant="outline" className="gap-1 font-normal">
      <Target aria-hidden />
      {labels.announcementAudience[audience]}
    </Badge>
  )
}

function audienceDetail(a: AnnouncementDto) {
  if (a.audience === "SPECIFIC_GROUP_CLASSES") return a.groupClasses.map((c) => `${c.group.name} — ${c.branch.name}`)
  if (a.audience === "SPECIFIC_BRANCHES") return a.branches.map((b) => b.name)
  return []
}

function publicationLine(a: AnnouncementDto) {
  if (a.state === "SCHEDULED") return `يُنشر في ${scheduleLabel(a)}`
  if (a.state === "DRAFT") return "مسودة — لم تُنشر بعد"
  return `النشر: ${formatDate(dayOf(a))}${a.expiresAt ? ` · الانتهاء: ${formatDate(a.expiresAt)}` : ""}`
}

/** "Schedule / reschedule" dialog: a Tunis date and time in the future. */
function ScheduleDialog({ announcement, onDone }: { announcement: AnnouncementDto | null; onDone: () => void }) {
  const today = todayInTunis()
  const action = useAnnouncementAction(announcement?.id ?? "")
  const [date, setDate] = useState(announcement?.scheduledForLocal?.slice(0, 10) ?? today)
  const [time, setTime] = useState(announcement?.scheduledForLocal?.slice(11, 16) ?? "")
  const [error, setError] = useState<string>()
  const value = `${date}T${time}`
  /** Checked on submit: "now" is read at that moment, not during render. */
  const validate = () =>
    !date || !time ? "حدّد تاريخ ووقت النشر" : value <= `${todayInTunis()}T${tunisTimeOf(Date.now())}` ? "يجب أن يكون موعد النشر في المستقبل" : undefined
  return (
    <Dialog open={announcement !== null} onOpenChange={(open) => !open && !action.isPending && onDone()}>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            const problem = validate()
            setError(problem)
            if (problem || action.isPending) return
            action.mutate(
              { kind: "schedule", scheduledAt: value },
              {
                onSuccess: () => {
                  toast.success("تمت جدولة الإعلان", { description: `يُنشر في ${formatDate(date)} على الساعة ${time}` })
                  onDone()
                },
              }
            )
          }}
        >
          <DialogHeader>
            <DialogTitle>{announcement?.status === "SCHEDULED" ? "تغيير موعد النشر" : "جدولة النشر"}</DialogTitle>
            <DialogDescription>يُنشر الإعلان تلقائيًا في هذا الموعد (توقيت تونس) ويُرسل الإشعار حينها.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="schedule-date">التاريخ</Label>
              <Input id="schedule-date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="schedule-time">الساعة</Label>
              <Input id="schedule-time" type="time" dir="ltr" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {action.isError && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorMessage(action.error)}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={action.isPending} onClick={onDone}>{labels.common.cancel}</Button>
            <Button type="submit" disabled={action.isPending}>
              {action.isPending ? <Loader2 className="animate-spin" /> : <CalendarClock />}
              جدولة
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type Pending = { kind: "publish" | "cancel-schedule" | "archive" | "delete"; announcement: AnnouncementDto }

const CONFIRM: Record<Pending["kind"], { title: string; description: (a: AnnouncementDto) => string; label: string; success: string; destructive?: boolean }> = {
  publish: {
    title: "نشر الإعلان الآن؟",
    description: (a) => `سيظهر «${a.title}» فورًا ويُرسل إشعار إلى الجمهور المستهدف.`,
    label: "نشر الآن",
    success: "تم نشر الإعلان",
  },
  "cancel-schedule": {
    title: "إلغاء الجدولة؟",
    description: (a) => `يعود «${a.title}» مسودة، ولن يُنشر ولا يُرسل أي إشعار.`,
    label: "إلغاء الجدولة",
    success: "أُلغيت جدولة الإعلان",
  },
  archive: {
    title: "أرشفة الإعلان؟",
    description: (a) => `يختفي «${a.title}» من فضاء المعلمين والطلبة ويبقى محفوظًا في الأرشيف.`,
    label: "أرشفة",
    success: "تمت أرشفة الإعلان",
  },
  delete: {
    title: "حذف هذا الإعلان؟",
    description: (a) => `سيُحذف «${a.title}» نهائيًا مع إشعاراته.`,
    label: "حذف",
    success: "تم حذف الإعلان",
    destructive: true,
  },
}

function ActionConfirm({ pending, onDone, afterDelete }: { pending: Pending | null; onDone: () => void; afterDelete?: () => void }) {
  const action = useAnnouncementAction(pending?.announcement.id ?? "")
  const config = pending ? CONFIRM[pending.kind] : null
  return (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(open) => !open && onDone()}
      title={config?.title ?? ""}
      description={pending && config ? config.description(pending.announcement) : ""}
      confirmLabel={config?.label ?? ""}
      destructive={config?.destructive}
      onConfirm={async () => {
        if (!pending || !config) return
        await action.mutateAsync({ kind: pending.kind })
        toast.success(config.success)
        onDone()
        if (pending.kind === "delete") afterDelete?.()
      }}
    />
  )
}

/** The actions an admin can take on an announcement, by its status. */
function actionsFor(a: AnnouncementDto, open: { edit: () => void; schedule: () => void; confirm: (kind: Pending["kind"]) => void }): RowAction[] {
  const actions: RowAction[] = []
  if (a.status !== "ARCHIVED") actions.push({ label: "تعديل", icon: Pencil, onSelect: open.edit })
  if (a.status === "DRAFT" || a.status === "SCHEDULED") {
    actions.push({ label: "نشر الآن", icon: Send, onSelect: () => open.confirm("publish") })
    actions.push({ label: a.status === "SCHEDULED" ? "تغيير موعد النشر" : "جدولة النشر", icon: CalendarClock, onSelect: open.schedule })
  }
  if (a.status === "SCHEDULED") actions.push({ label: "إلغاء الجدولة", icon: CalendarX2, onSelect: () => open.confirm("cancel-schedule") })
  if (a.status === "PUBLISHED") actions.push({ label: "أرشفة", icon: Archive, onSelect: () => open.confirm("archive") })
  actions.push({ label: "حذف", icon: Trash2, destructive: true, separated: true, onSelect: () => open.confirm("delete") })
  return actions
}

/** Create or edit through the API; reports how many accounts were notified. */
function AnnouncementEditor({
  open,
  onOpenChange,
  announcement,
  lookups,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  announcement?: AnnouncementDto
  lookups: Lookups
}) {
  const create = useCreateAnnouncement()
  const update = useUpdateAnnouncement(announcement?.id ?? "")
  const mutation = announcement ? update : create
  const save = (result: AnnouncementFormResult) => {
    if (announcement) {
      update.mutate(
        { input: result.input, published: announcement.status === "PUBLISHED" },
        {
          onSuccess: () => {
            onOpenChange(false)
            toast.success("تم تعديل الإعلان")
          },
        }
      )
      return
    }
    create.mutate(result, {
      onSuccess: ({ notifiedCount }) => {
        onOpenChange(false)
        if (result.mode === "PUBLISH_NOW") toast.success("تم نشر الإعلان", { description: `أُرسل إشعار إلى ${notifiedCount} حساب.` })
        else if (result.mode === "SCHEDULE") toast.success("تمت جدولة الإعلان", { description: "يُنشر ويُرسل الإشعار في الموعد المحدد." })
        else toast.success("حُفظ الإعلان كمسودة", { description: "لم يُرسل أي إشعار." })
      },
    })
  }
  return (
    <AnnouncementFormSheet
      open={open}
      onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}
      announcement={announcement}
      lookups={lookups}
      pending={mutation.isPending}
      error={mutation.isError ? errorMessage(mutation.error) : null}
      onSave={save}
    />
  )
}

/** Admin management: every announcement — drafts, scheduled, published, archived. */
export function AdminAnnouncements({ lookups }: { lookups: Lookups }) {
  const pageSize = usePlatformSettings().defaultPageSize
  const [query, setQuery] = useState("")
  const [audience, setAudience] = useState(ALL)
  const [status, setStatus] = useState(ALL)
  const [page, setPage] = useState(1)
  const [editor, setEditor] = useState<{ announcement?: AnnouncementDto; key: number; open: boolean }>({ key: 0, open: false })
  const [scheduling, setScheduling] = useState<{ announcement: AnnouncementDto | null; key: number }>({ announcement: null, key: 0 })
  const [pending, setPending] = useState<Pending | null>(null)
  const list = useAnnouncements(
    "admin",
    {
      search: query.trim() || undefined,
      status: status === ALL ? undefined : (status as AnnouncementStatus),
      audience: audience === ALL ? undefined : (audience as AnnouncementAudienceType),
    },
    page,
    pageSize
  )
  const rows = list.data?.data ?? []
  const filtered = Boolean(query) || audience !== ALL || status !== ALL
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setPage(1)
  }
  const openEditor = (announcement?: AnnouncementDto) => setEditor((p) => ({ announcement, key: p.key + 1, open: true }))
  const addButton = (
    <Button onClick={() => openEditor()}>
      <Plus />
      إعلان جديد
    </Button>
  )

  return (
    <>
      <PageHeader title="الإعلانات" description="إعلانات إدارية للمعلمين والطلبة حسب الجمهور المستهدف: نشر فوري، جدولة، أو مسودة." actions={addButton} />
      <FilterBar
        hasActiveFilters={filtered}
        onReset={() => {
          setQuery("")
          setAudience(ALL)
          setStatus(ALL)
          setPage(1)
        }}
        resultLabel={list.data ? `${list.data.meta.total} إعلان` : ""}
        search={<SearchInput value={query} onChange={reset(setQuery)} label="البحث في الإعلانات" placeholder="ابحث في الإعلانات…" />}
      >
        <FilterSelect label="الجمهور" allLabel="كل الجماهير" value={audience} onValueChange={reset(setAudience)}
          options={AUDIENCES.map((v) => ({ value: v, label: labels.announcementAudience[v] }))} />
        <FilterSelect label="الحالة" allLabel="كل الحالات" value={status} onValueChange={reset(setStatus)} options={STATUS_FILTER} />
      </FilterBar>

      <QueryState query={list}>
        {rows.length === 0 ? (
          <Card className="p-0">
            {filtered ? <EmptyState icon={SearchX} title="لا توجد إعلانات مطابقة" /> : <EmptyState icon={Megaphone} title="لا توجد إعلانات حالياً" action={addButton} />}
          </Card>
        ) : (
          <ul className="space-y-3">
            {rows.map((a) => (
              <li key={a.id}>
                <Card className="gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge className={cn("font-normal", STATE_LABEL[a.state].className)}>{STATE_LABEL[a.state].label}</Badge>
                      <AnnouncementAudienceBadge audience={a.audience} />
                    </div>
                    <ActionsMenu
                      label={`إجراءات: ${a.title}`}
                      actions={[
                        { label: "عرض", icon: Eye, href: `/admin/announcements/${a.id}` },
                        ...actionsFor(a, {
                          edit: () => openEditor(a),
                          schedule: () => setScheduling((p) => ({ announcement: a, key: p.key + 1 })),
                          confirm: (kind) => setPending({ kind, announcement: a }),
                        }),
                      ]}
                    />
                  </div>
                  <Link href={`/admin/announcements/${a.id}`} className="space-y-1 hover:opacity-80">
                    <h3 className="font-semibold">{a.title}</h3>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{a.content}</p>
                  </Link>
                  {audienceDetail(a).length > 0 && <p className="text-xs text-muted-foreground">{audienceDetail(a).join(" · ")}</p>}
                  <p className="text-xs text-muted-foreground">{publicationLine(a)}</p>
                </Card>
              </li>
            ))}
          </ul>
        )}
        <Pager page={page} totalPages={list.data?.meta.totalPages ?? 1} onPage={setPage} />
      </QueryState>

      <AnnouncementEditor key={editor.key} open={editor.open} onOpenChange={(open) => setEditor((p) => ({ ...p, open }))} announcement={editor.announcement} lookups={lookups} />
      <ScheduleDialog key={scheduling.key} announcement={scheduling.announcement} onDone={() => setScheduling((p) => ({ ...p, announcement: null }))} />
      <ActionConfirm pending={pending} onDone={() => setPending(null)} />
    </>
  )
}

/** The latest active announcements addressed to the signed-in teacher or student. */
export function useReaderAnnouncements(scope: Exclude<AnnouncementScope, "admin">, limit = 2) {
  return useAnnouncements(scope, {}, 1, limit).data?.data ?? []
}

/** Compact list item, also used by dashboards. */
export function AnnouncementItem({ announcement, href, today }: { announcement: AnnouncementDto; href: string; today: string }) {
  return (
    <Link href={href} className="block space-y-0.5 rounded-lg p-2 -mx-2 hover:bg-muted">
      <p className="font-medium leading-snug">{announcement.title}</p>
      <p className="line-clamp-1 text-sm text-muted-foreground">{announcement.content}</p>
      <p className="text-xs text-muted-foreground">{formatRelativeDay(dayOf(announcement), today)}</p>
    </Link>
  )
}

/** Teacher / student: read-only feed of the announcements addressed to them (resolved by the API). */
export function AnnouncementFeed({ workspace }: { workspace: Exclude<AnnouncementScope, "admin"> }) {
  const today = todayInTunis()
  const pageSize = usePlatformSettings().defaultPageSize
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const list = useAnnouncements(workspace, { search: query.trim() || undefined }, page, pageSize)
  // Teachers also get their own drafts from this endpoint: the feed only shows what is live
  const shown = (list.data?.data ?? []).filter((a) => a.state === "ACTIVE")
  return (
    <>
      <PageHeader title="الإعلانات" description="آخر إعلانات إدارة الجمعية الموجّهة إليك." />
      <div className="mb-4 sm:max-w-xs">
        <SearchInput
          value={query}
          onChange={(v) => {
            setQuery(v)
            setPage(1)
          }}
          label="البحث في الإعلانات"
          placeholder="ابحث في الإعلانات…"
        />
      </div>
      <QueryState query={list}>
        {shown.length === 0 ? (
          <Card className="p-0">
            <EmptyState icon={query ? SearchX : Megaphone} title={query ? "لا توجد إعلانات مطابقة" : "لا توجد إعلانات حالياً"} />
          </Card>
        ) : (
          <ul className="space-y-3">
            {shown.map((a) => (
              <li key={a.id}>
                <Link href={`/${workspace}/announcements/${a.id}`} className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                  <Card className="gap-1.5 p-4 transition-colors hover:border-primary/40">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold">{a.title}</h3>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeDay(dayOf(a), today)}</span>
                    </div>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{a.content}</p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Pager page={page} totalPages={list.data?.meta.totalPages ?? 1} onPage={setPage} />
      </QueryState>
    </>
  )
}

/** One announcement. Admins also see audience, status and the actions of its status. */
export function AnnouncementDetails({ announcementId, workspace, lookups }: { announcementId: ID; workspace: AnnouncementScope; lookups?: Lookups }) {
  const router = useRouter()
  const query = useAnnouncement(workspace, announcementId)
  const [editing, setEditing] = useState<{ key: number; open: boolean }>({ key: 0, open: false })
  const [scheduling, setScheduling] = useState<{ announcement: AnnouncementDto | null; key: number }>({ announcement: null, key: 0 })
  const [pending, setPending] = useState<Pending | null>(null)
  const back = `/${workspace}/announcements`
  const isAdmin = workspace === "admin"

  if (query.error instanceof ApiError && (query.error.isNotFound || query.error.status === 400))
    return <NotFoundState title="الإعلان غير موجود" backHref={back} backLabel="العودة إلى الإعلانات" />
  const announcement = query.data
  if (!announcement) return <QueryState query={query}>{null}</QueryState>

  return (
    <>
      <Breadcrumbs className="mb-4" items={[{ label: "الإعلانات", href: back }, { label: announcement.title }]} />
      <Card className="gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            {isAdmin && (
              <div className="flex flex-wrap gap-1.5">
                <Badge className={cn("font-normal", STATE_LABEL[announcement.state].className)}>{STATE_LABEL[announcement.state].label}</Badge>
                <AnnouncementAudienceBadge audience={announcement.audience} />
              </div>
            )}
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{announcement.title}</h1>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <CalendarDays className="size-4" aria-hidden />
              {isAdmin ? publicationLine(announcement) : formatDate(dayOf(announcement))}
            </p>
          </div>
          {isAdmin && announcement.canManage && (
            <ActionsMenu
              label="إجراءات الإعلان"
              triggerVariant="outline"
              actions={actionsFor(announcement, {
                edit: () => setEditing((p) => ({ key: p.key + 1, open: true })),
                schedule: () => setScheduling((p) => ({ announcement, key: p.key + 1 })),
                confirm: (kind) => setPending({ kind, announcement }),
              })}
            />
          )}
        </div>
        <p className="leading-relaxed whitespace-pre-wrap">{announcement.content}</p>
        {isAdmin && audienceDetail(announcement).length > 0 && (
          <div className="space-y-1.5 border-t pt-3">
            <p className="text-xs text-muted-foreground">{announcement.audience === "SPECIFIC_BRANCHES" ? "الفروع المستهدفة" : "الفصول المستهدفة"}</p>
            <ul className="flex flex-wrap gap-1">
              {audienceDetail(announcement).map((t) => (
                <li key={t}><Badge variant="outline" className="h-auto whitespace-normal py-0.5 text-start font-normal">{t}</Badge></li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {isAdmin && lookups && (
        <>
          <AnnouncementEditor key={editing.key} open={editing.open} onOpenChange={(open) => setEditing((p) => ({ ...p, open }))} announcement={announcement} lookups={lookups} />
          <ScheduleDialog key={scheduling.key} announcement={scheduling.announcement} onDone={() => setScheduling((p) => ({ ...p, announcement: null }))} />
          <ActionConfirm pending={pending} onDone={() => setPending(null)} afterDelete={() => router.push(back)} />
        </>
      )}
    </>
  )
}
