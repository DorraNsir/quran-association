"use client"

import { Megaphone, Plus, SearchX } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { EmptyState } from "@/components/shared/empty-state"
import { FilterBar, SearchInput } from "@/components/shared/filters"
import { PageHeader } from "@/components/shared/page-header"
import { Pager } from "@/components/shared/pager"
import { QueryState } from "@/components/shared/query-state"
import { WithTeacherWorkspace } from "@/components/shared/with-workspace"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useAnnouncements, type AnnouncementDto } from "@/lib/api/announcements"
import { todayInTunis, tunisDateOf } from "@/lib/dates"
import type { Lookups } from "@/lib/domain"
import { formatDate, formatRelativeDay } from "@/lib/format"
import { usePlatformSettings } from "@/lib/store/settings"
import { cn } from "@/lib/utils"
import type { ID } from "@/types/domain"

import { AnnouncementAudienceBadge, AnnouncementDetails, audienceDetail, publicationLine, STATE_LABEL } from "./announcements-views"
import { TeacherAnnouncementActions, TeacherAnnouncementEditor } from "./teacher-announcement-actions"
import { eligibleClasses } from "./teacher-announcement-audience"

const BACK = "/teacher/announcements"

export function TeacherAnnouncementsScreen() {
  return <WithTeacherWorkspace>{({ teacher, lookups }) => <TeacherAnnouncements teacherId={teacher.id} lookups={lookups} />}</WithTeacherWorkspace>
}

/** One announcement; its author also gets its status, audience and actions. */
export function TeacherAnnouncementScreen({ id }: { id: ID }) {
  const router = useRouter()
  return (
    <WithTeacherWorkspace>
      {({ teacher, lookups }) => (
        <AnnouncementDetails
          announcementId={id}
          workspace="teacher"
          lookups={lookups}
          renderActions={(a) => (
            <TeacherAnnouncementActions
              announcement={a}
              classes={eligibleClasses(teacher.id, lookups)}
              triggerVariant="outline"
              afterDelete={() => router.push(BACK)}
            />
          )}
        />
      )}
    </WithTeacherWorkspace>
  )
}

type View = "feed" | "mine"
const VIEWS: [View, string][] = [
  ["feed", "الإعلانات"],
  ["mine", "إعلاناتي"],
]

/**
 * «الإعلانات» for a teacher: the FEED of what reaches them today, and
 * «إعلاناتي» — the announcements they wrote, any status, with the actions the
 * API allows (their own only). «إعلان جديد» only with an eligible class.
 */
export function TeacherAnnouncements({ teacherId, lookups }: { teacherId: ID; lookups: Lookups }) {
  const today = todayInTunis()
  const pageSize = usePlatformSettings().defaultPageSize
  const [view, setView] = useState<View>("feed")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [editor, setEditor] = useState<{ key: number; open: boolean }>({ key: 0, open: false })
  const classes = eligibleClasses(teacherId, lookups)
  const list = useAnnouncements(
    "teacher",
    { search: query.trim() || undefined, ...(view === "feed" ? { status: "PUBLISHED" as const } : { mine: true }) },
    page,
    pageSize
  )
  // The feed shows only what is live (the endpoint also returns my own expired ones)
  const rows = (list.data?.data ?? []).filter((a) => view === "mine" || a.state === "ACTIVE")
  const addButton =
    classes.length > 0 ? (
      <Button onClick={() => setEditor((p) => ({ key: p.key + 1, open: true }))}>
        <Plus />
        إعلان جديد
      </Button>
    ) : undefined

  return (
    <>
      <PageHeader title="الإعلانات" description="الإعلانات الموجّهة إليك، وإعلاناتك لطلبة فصولك." actions={addButton} />
      {classes.length === 0 && <p className="mb-4 text-sm text-muted-foreground">لا توجد فصول نشطة مسندة إليك حاليًا لنشر الإعلانات.</p>}

      <div role="tablist" aria-label="الإعلانات المعروضة" className="mb-4 inline-flex rounded-lg border bg-card p-1">
        {VIEWS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={view === value}
            onClick={() => {
              setView(value)
              setPage(1)
            }}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm transition-colors",
              view === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <FilterBar
        hasActiveFilters={Boolean(query)}
        onReset={() => {
          setQuery("")
          setPage(1)
        }}
        resultLabel={view === "mine" && list.data ? `${list.data.meta.total} إعلان` : ""}
        search={
          <SearchInput
            value={query}
            onChange={(v) => {
              setQuery(v)
              setPage(1)
            }}
            label="البحث في الإعلانات"
            placeholder="ابحث في الإعلانات…"
          />
        }
      />

      <QueryState query={list}>
        {rows.length === 0 ? (
          <Card className="p-0">
            {query ? (
              <EmptyState icon={SearchX} title="لا توجد إعلانات مطابقة" />
            ) : view === "mine" ? (
              <EmptyState icon={Megaphone} title="لم تكتب أي إعلان بعد" action={addButton} />
            ) : (
              <EmptyState icon={Megaphone} title="لا توجد إعلانات حالياً" />
            )}
          </Card>
        ) : (
          <ul className="space-y-3">
            {rows.map((a) => (
              <li key={a.id}>
                <TeacherAnnouncementCard
                  announcement={a}
                  today={today}
                  mine={view === "mine"}
                  actions={view === "mine" ? <TeacherAnnouncementActions announcement={a} classes={classes} /> : undefined}
                />
              </li>
            ))}
          </ul>
        )}
        <Pager page={page} totalPages={list.data?.meta.totalPages ?? 1} onPage={setPage} />
      </QueryState>

      <TeacherAnnouncementEditor key={`new-${editor.key}`} open={editor.open} onOpenChange={(open) => setEditor((p) => ({ ...p, open }))} classes={classes} />
    </>
  )
}

const MAX_AUDIENCE_CHIPS = 3

/**
 * One compact announcement card (the same metadata as on mobile): title, a
 * two-line preview, who it reaches (each class «group — branch»; the extra
 * ones summed up as «+n», all named in its tooltip and on the details page),
 * the publisher and the publication day. «إعلاناتي» adds the state badge, the
 * full publication line and the actions.
 */
export function TeacherAnnouncementCard({
  announcement: a,
  today,
  mine,
  actions,
}: {
  announcement: AnnouncementDto
  today: string
  mine: boolean
  actions?: React.ReactNode
}) {
  const targets = audienceDetail(a)
  const shown = targets.slice(0, MAX_AUDIENCE_CHIPS)
  const rest = targets.slice(MAX_AUDIENCE_CHIPS)
  const publisher = `${a.publishedBy?.firstName ?? ""} ${a.publishedBy?.lastName ?? ""}`.trim()
  const day = tunisDateOf(a.publishedAt ?? a.createdAt)
  return (
    <Card className="gap-2 p-4" data-testid="announcement-card">
      <div className="flex items-start justify-between gap-2">
        <Link href={`${BACK}/${a.id}`} className="min-w-0 space-y-1 hover:opacity-80">
          <h3 className="font-semibold leading-snug">{a.title}</h3>
          <p className="line-clamp-2 text-sm text-muted-foreground">{a.content}</p>
        </Link>
        {actions}
      </div>
      <div className="flex flex-wrap items-center gap-1.5" aria-label="الجمهور المستهدف">
        {mine && <Badge className={cn("font-normal", STATE_LABEL[a.state].className)}>{STATE_LABEL[a.state].label}</Badge>}
        {targets.length === 0 ? (
          <AnnouncementAudienceBadge audience={a.audience} />
        ) : (
          <>
            {shown.map((t) => (
              <Badge key={t} variant="outline" className="h-auto max-w-full truncate py-0.5 font-normal" title={t}>
                {t}
              </Badge>
            ))}
            {rest.length > 0 && (
              <Badge variant="secondary" className="font-normal" title={rest.join("، ")} aria-label={`و${rest.length} أخرى: ${rest.join("، ")}`}>
                +{rest.length}
              </Badge>
            )}
          </>
        )}
      </div>
      <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
        {publisher && <span data-testid="announcement-publisher">{publisher}</span>}
        {publisher && <span aria-hidden>·</span>}
        <span>{mine ? publicationLine(a) : `${formatDate(day)} (${formatRelativeDay(day, today)})`}</span>
      </p>
    </Card>
  )
}
