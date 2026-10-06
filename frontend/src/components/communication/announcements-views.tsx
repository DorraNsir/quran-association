"use client"

import { CalendarDays, Eye, Megaphone, Pencil, Plus, Power, PowerOff, SearchX, Target, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { ActionsMenu, type RowAction } from "@/components/shared/actions-menu"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { EmptyState } from "@/components/shared/empty-state"
import { ALL, FilterBar, FilterSelect, matchesText, SearchInput } from "@/components/shared/filters"
import { NoAccess } from "@/components/shared/no-access"
import { Breadcrumbs, PageHeader } from "@/components/shared/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  announcementState,
  announcementTargetsOf,
  getAnnouncementsForStudent,
  getAnnouncementsForTeacher,
  groupClassLabel,
  isAnnouncementVisibleToStudent,
  isAnnouncementVisibleToTeacher,
  type AnnouncementState,
} from "@/lib/communication"
import type { Lookups } from "@/lib/domain"
import { formatDate, formatRelativeDay } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { operations, useOperations } from "@/lib/store/operations"
import { cn } from "@/lib/utils"
import type { Announcement, AnnouncementTarget, ID, ISODate, Student, User } from "@/types/domain"

import { AnnouncementFormSheet } from "./announcement-form-sheet"

const STATE_LABEL: Record<AnnouncementState, { label: string; className: string }> = {
  ACTIVE: { label: "منشور", className: "bg-brand-soft text-brand-soft-foreground" },
  SCHEDULED: { label: "مبرمج", className: "bg-muted text-foreground" },
  EXPIRED: { label: "منتهي", className: "bg-muted text-muted-foreground" },
  INACTIVE: { label: "غير مفعّل", className: "bg-warning-soft text-warning" },
}

export function AnnouncementAudienceBadge({ audience }: { audience: Announcement["audienceType"] }) {
  return (
    <Badge variant="outline" className="gap-1 font-normal">
      <Target aria-hidden />
      {labels.announcementAudience[audience]}
    </Badge>
  )
}

function audienceDetail(announcement: Announcement, targets: AnnouncementTarget[], lookups: Lookups) {
  if (announcement.audienceType !== "SPECIFIC_GROUP_CLASSES") return []
  return announcementTargetsOf(announcement.id, targets).map((t) => {
    const groupClass = lookups.groupClasses.find((c) => c.id === t.groupClassId)
    return groupClass ? groupClassLabel(groupClass, lookups) : "—"
  })
}

/** Admin management: every announcement, including inactive, scheduled and expired ones. */
export function AdminAnnouncements({ user, lookups, today }: { user: User; lookups: Lookups; today: ISODate }) {
  const { announcements, announcementTargets } = useOperations()
  const [query, setQuery] = useState("")
  const [audience, setAudience] = useState(ALL)
  const [stateFilter, setStateFilter] = useState(ALL)
  const [editor, setEditor] = useState<{ announcement?: Announcement; key: number; open: boolean }>({ key: 0, open: false })
  const [deleting, setDeleting] = useState<Announcement | null>(null)

  const list = [...announcements].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || b.createdAt.localeCompare(a.createdAt))
  const shown = list.filter(
    (a) =>
      (!query.trim() || matchesText(`${a.title} ${a.content}`, query)) &&
      (audience === ALL || a.audienceType === audience) &&
      (stateFilter === ALL || announcementState(a, today) === stateFilter)
  )
  const openEditor = (announcement?: Announcement) => setEditor((p) => ({ announcement, key: p.key + 1, open: true }))
  const addButton = (
    <Button onClick={() => openEditor()}>
      <Plus />
      إعلان جديد
    </Button>
  )

  return (
    <>
      <PageHeader title="الإعلانات" description="إعلانات إدارية للمعلمين والطلبة حسب الجمهور المستهدف." actions={addButton} />
      <FilterBar
        hasActiveFilters={Boolean(query) || audience !== ALL || stateFilter !== ALL}
        onReset={() => {
          setQuery("")
          setAudience(ALL)
          setStateFilter(ALL)
        }}
        resultLabel={`${shown.length} إعلان`}
        search={<SearchInput value={query} onChange={setQuery} label="البحث في الإعلانات" placeholder="ابحث في الإعلانات…" />}
      >
        <FilterSelect label="الجمهور" allLabel="كل الجماهير" value={audience} onValueChange={setAudience}
          options={(["EVERYONE", "TEACHERS", "STUDENTS", "SPECIFIC_GROUP_CLASSES"] as const).map((v) => ({ value: v, label: labels.announcementAudience[v] }))} />
        <FilterSelect label="الحالة" allLabel="كل الحالات" value={stateFilter} onValueChange={setStateFilter}
          options={(Object.keys(STATE_LABEL) as AnnouncementState[]).map((s) => ({ value: s, label: STATE_LABEL[s].label }))} />
      </FilterBar>

      {shown.length === 0 ? (
        <Card className="p-0">
          {list.length === 0 ? (
            <EmptyState icon={Megaphone} title="لا توجد إعلانات حالياً" action={addButton} />
          ) : (
            <EmptyState icon={SearchX} title="لا توجد إعلانات مطابقة" />
          )}
        </Card>
      ) : (
        <ul className="space-y-3">
          {shown.map((a) => {
            const state = announcementState(a, today)
            const actions: RowAction[] = [
              { label: "عرض", icon: Eye, href: `/admin/announcements/${a.id}` },
              { label: "تعديل", icon: Pencil, onSelect: () => openEditor(a) },
              a.isActive
                ? { label: "إلغاء التفعيل", icon: PowerOff, onSelect: () => toggleActive(a, false, today) }
                : { label: "تفعيل", icon: Power, onSelect: () => toggleActive(a, true, today) },
              { label: "حذف", icon: Trash2, destructive: true, separated: true, onSelect: () => setDeleting(a) },
            ]
            return (
              <li key={a.id}>
                <Card className="gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge className={cn("font-normal", STATE_LABEL[state].className)}>{STATE_LABEL[state].label}</Badge>
                      <AnnouncementAudienceBadge audience={a.audienceType} />
                    </div>
                    <ActionsMenu label={`إجراءات: ${a.title}`} actions={actions} />
                  </div>
                  <Link href={`/admin/announcements/${a.id}`} className="space-y-1 hover:opacity-80">
                    <h3 className="font-semibold">{a.title}</h3>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{a.content}</p>
                  </Link>
                  {audienceDetail(a, announcementTargets, lookups).length > 0 && (
                    <p className="text-xs text-muted-foreground">{audienceDetail(a, announcementTargets, lookups).join(" · ")}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    النشر: {formatDate(a.publishedAt)}
                    {a.expiresAt && <> · الانتهاء: {formatDate(a.expiresAt)}</>}
                  </p>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      <AnnouncementEditor
        key={editor.key}
        open={editor.open}
        onOpenChange={(open) => setEditor((p) => ({ ...p, open }))}
        announcement={editor.announcement}
        user={user}
        lookups={lookups}
        today={today}
      />
      <DeleteAnnouncementDialog announcement={deleting} onDone={() => setDeleting(null)} />
    </>
  )
}

function toggleActive(announcement: Announcement, isActive: boolean, today: ISODate) {
  operations.setAnnouncementActive(announcement.id, isActive, today)
  toast.success(isActive ? "تم تفعيل الإعلان" : "تم إلغاء تفعيل الإعلان")
}

function AnnouncementEditor({
  open,
  onOpenChange,
  announcement,
  user,
  lookups,
  today,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  announcement?: Announcement
  user: User
  lookups: Lookups
  today: ISODate
}) {
  const { announcementTargets } = useOperations()
  return (
    <AnnouncementFormSheet
      open={open}
      onOpenChange={onOpenChange}
      announcement={announcement}
      initialClassIds={announcement ? announcementTargetsOf(announcement.id, announcementTargets).map((t) => t.groupClassId) : []}
      lookups={lookups}
      today={today}
      onSave={(draft, classIds) => {
        operations.saveAnnouncement(draft, classIds, user.id, today)
        onOpenChange(false)
        toast.success(announcement ? "تم تعديل الإعلان" : "تم نشر الإعلان", { description: "أُرسل إشعار إلى المعنيين." })
      }}
    />
  )
}

function DeleteAnnouncementDialog({ announcement, onDone, afterDelete }: { announcement: Announcement | null; onDone: () => void; afterDelete?: () => void }) {
  return (
    <ConfirmDialog
      open={announcement !== null}
      onOpenChange={(open) => !open && onDone()}
      title="حذف هذا الإعلان؟"
      description={announcement ? `سيُحذف «${announcement.title}» نهائيًا مع إشعاراته.` : ""}
      confirmLabel="حذف"
      destructive
      onConfirm={() => {
        if (announcement) operations.deleteAnnouncement(announcement.id)
        onDone()
        toast.success("تم حذف الإعلان")
        afterDelete?.()
      }}
    />
  )
}

/** Who reads announcements outside the admin space. */
export type AnnouncementReader = { workspace: "teacher"; teacherId: ID } | { workspace: "student"; student: Student }

/** Active announcements addressed to this teacher or student. */
export function useReaderAnnouncements(reader: AnnouncementReader, lookups: Lookups, today: ISODate) {
  const { announcements, announcementTargets } = useOperations()
  return reader.workspace === "teacher"
    ? getAnnouncementsForTeacher(reader.teacherId, announcements, announcementTargets, lookups, today)
    : getAnnouncementsForStudent(reader.student, announcements, announcementTargets, today)
}

/** Compact list item, also used by dashboards. */
export function AnnouncementItem({ announcement, href, today }: { announcement: Announcement; href: string; today: ISODate }) {
  return (
    <Link href={href} className="block space-y-0.5 rounded-lg p-2 -mx-2 hover:bg-muted">
      <p className="font-medium leading-snug">{announcement.title}</p>
      <p className="line-clamp-1 text-sm text-muted-foreground">{announcement.content}</p>
      <p className="text-xs text-muted-foreground">{formatRelativeDay(announcement.publishedAt, today)}</p>
    </Link>
  )
}

/** Teacher / student: read-only feed. */
export function AnnouncementFeed({ reader, lookups, today }: { reader: AnnouncementReader; lookups: Lookups; today: ISODate }) {
  const list = useReaderAnnouncements(reader, lookups, today)
  const [query, setQuery] = useState("")
  const shown = list.filter((a) => !query.trim() || matchesText(`${a.title} ${a.content}`, query))
  return (
    <>
      <PageHeader title="الإعلانات" description="آخر إعلانات إدارة الجمعية الموجّهة إليك." />
      {list.length > 3 && (
        <div className="mb-4 sm:max-w-xs">
          <SearchInput value={query} onChange={setQuery} label="البحث في الإعلانات" placeholder="ابحث في الإعلانات…" />
        </div>
      )}
      {shown.length === 0 ? (
        <Card className="p-0">
          <EmptyState icon={list.length === 0 ? Megaphone : SearchX} title={list.length === 0 ? "لا توجد إعلانات حالياً" : "لا توجد إعلانات مطابقة"} />
        </Card>
      ) : (
        <ul className="space-y-3">
          {shown.map((a) => (
            <li key={a.id}>
              <Link href={`/${reader.workspace}/announcements/${a.id}`} className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                <Card className="gap-1.5 p-4 transition-colors hover:border-primary/40">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold">{a.title}</h3>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeDay(a.publishedAt, today)}</span>
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{a.content}</p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/** One announcement. Admins also see audience, status and management actions. */
export function AnnouncementDetails({
  announcementId,
  viewer,
  lookups,
  today,
}: {
  announcementId: ID
  viewer: { workspace: "admin"; user: User } | AnnouncementReader
  lookups: Lookups
  today: ISODate
}) {
  const router = useRouter()
  const { announcements, announcementTargets } = useOperations()
  const [editing, setEditing] = useState<{ key: number; open: boolean }>({ key: 0, open: false })
  const [deleting, setDeleting] = useState<Announcement | null>(null)
  const announcement = announcements.find((a) => a.id === announcementId)
  const back = `/${viewer.workspace}/announcements`

  if (!announcement) {
    return (
      <Card className="p-0">
        <EmptyState icon={Megaphone} title="الإعلان غير موجود" description="ربما حُذف أو انتهت صلاحيته."
          action={<Button asChild variant="outline"><Link href={back}>العودة إلى الإعلانات</Link></Button>} />
      </Card>
    )
  }
  const allowed =
    viewer.workspace === "admin" ||
    (viewer.workspace === "teacher" && isAnnouncementVisibleToTeacher(announcement, announcementTargets, viewer.teacherId, lookups, today)) ||
    (viewer.workspace === "student" && isAnnouncementVisibleToStudent(announcement, announcementTargets, viewer.student, today))
  if (!allowed) return <NoAccess backHref={back} backLabel="العودة إلى الإعلانات" />
  const state = announcementState(announcement, today)

  return (
    <>
      <Breadcrumbs className="mb-4" items={[{ label: "الإعلانات", href: back }, { label: announcement.title }]} />
      <Card className="gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            {viewer.workspace === "admin" && (
              <div className="flex flex-wrap gap-1.5">
                <Badge className={cn("font-normal", STATE_LABEL[state].className)}>{STATE_LABEL[state].label}</Badge>
                <AnnouncementAudienceBadge audience={announcement.audienceType} />
              </div>
            )}
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{announcement.title}</h1>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <CalendarDays className="size-4" aria-hidden />
              {formatDate(announcement.publishedAt)}
              {viewer.workspace === "admin" && announcement.expiresAt && <> · ينتهي في {formatDate(announcement.expiresAt)}</>}
            </p>
          </div>
          {viewer.workspace === "admin" && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setEditing((p) => ({ key: p.key + 1, open: true }))}>
                <Pencil />
                تعديل
              </Button>
              <Button variant="outline" onClick={() => toggleActive(announcement, !announcement.isActive, today)}>
                {announcement.isActive ? <PowerOff /> : <Power />}
                {announcement.isActive ? "إلغاء التفعيل" : "تفعيل"}
              </Button>
              <Button variant="outline" className="text-destructive" onClick={() => setDeleting(announcement)}>
                <Trash2 />
                حذف
              </Button>
            </div>
          )}
        </div>
        <p className="leading-relaxed whitespace-pre-wrap">{announcement.content}</p>
        {viewer.workspace === "admin" && audienceDetail(announcement, announcementTargets, lookups).length > 0 && (
          <div className="space-y-1.5 border-t pt-3">
            <p className="text-xs text-muted-foreground">الفصول المستهدفة</p>
            <ul className="flex flex-wrap gap-1">
              {audienceDetail(announcement, announcementTargets, lookups).map((t) => (
                <li key={t}><Badge variant="outline" className="h-auto whitespace-normal py-0.5 text-start font-normal">{t}</Badge></li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {viewer.workspace === "admin" && (
        <>
          <AnnouncementEditor
            key={editing.key}
            open={editing.open}
            onOpenChange={(open) => setEditing((p) => ({ ...p, open }))}
            announcement={announcement}
            user={viewer.user}
            lookups={lookups}
            today={today}
          />
          <DeleteAnnouncementDialog announcement={deleting} onDone={() => setDeleting(null)} afterDelete={() => router.push(back)} />
        </>
      )}
    </>
  )
}
