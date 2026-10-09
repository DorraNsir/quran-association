"use client"

import { CalendarDays, Eye, FolderOpen, Pencil, Plus, SearchX, Target, Trash2, UserRound } from "lucide-react"
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
import { ApiError, errorMessage } from "@/lib/api/errors"
import { usePrivateFileUrl } from "@/lib/api/private-file"
import {
  toResourceView,
  useDeleteResource,
  useResource,
  useResources,
  useSaveResource,
  type ResourceScope,
  type ResourceView,
} from "@/lib/api/resources"
import { groupClassLabel } from "@/lib/communication"
import { todayInTunis } from "@/lib/dates"
import type { Lookups } from "@/lib/domain"
import { formatDate, formatRelativeDay } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { usePlatformSettings } from "@/lib/store/settings"
import type { GroupClass, ID, ISODate, ResourceType, ResourceVisibilityType } from "@/types/domain"

import { RESOURCE_TYPES, ResourceAction, ResourceTypeBadge, formatFileSize } from "./resource-badges"
import { ResourceFormSheet } from "./resource-form-sheet"

function ResourceCard({
  resource,
  href,
  today,
  showTargets,
  actions,
}: {
  resource: ResourceView
  href: string
  today: ISODate
  /** Staff only: who the resource reaches */
  showTargets?: boolean
  actions?: React.ReactNode
}) {
  return (
    <Card className="h-full gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <ResourceTypeBadge type={resource.type} />
        {actions}
      </div>
      <Link href={href} className="space-y-1 hover:opacity-80">
        <h3 className="font-semibold leading-snug">{resource.title}</h3>
        {resource.description && <p className="line-clamp-2 text-sm text-muted-foreground">{resource.description}</p>}
      </Link>
      {showTargets && (
        <ul className="flex flex-wrap gap-1" aria-label="الفئة المستهدفة">
          {resource.targets.map((t) => (
            <li key={t}>
              <Badge variant="outline" className="h-auto max-w-full whitespace-normal py-0.5 text-start font-normal">{t}</Badge>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <p className="text-xs text-muted-foreground">
          {resource.publisher} · {formatRelativeDay(resource.createdAt, today)}
        </p>
        <ResourceAction resource={resource} />
      </div>
    </Card>
  )
}

/** The classes a teacher may publish to: their current non-archived classes (workspace bundle). */
const publishableOf = (lookups: Lookups): GroupClass[] => lookups.groupClasses.filter((c) => c.status !== "ARCHIVED")

/**
 * Admin: every resource, association-wide.
 * Teacher: the resources they published, toward their own classes only.
 */
export function StaffResources({ workspace, lookups }: { workspace: "admin" | "teacher"; lookups: Lookups }) {
  const today = todayInTunis()
  const pageSize = usePlatformSettings().defaultPageSize
  const isTeacher = workspace === "teacher"
  const publishable = isTeacher ? publishableOf(lookups) : []
  const [query, setQuery] = useState("")
  const [type, setType] = useState(ALL)
  const [visibility, setVisibility] = useState(ALL)
  const [classId, setClassId] = useState(ALL)
  const [page, setPage] = useState(1)
  const [editor, setEditor] = useState<{ resource?: ResourceView; key: number; open: boolean }>({ key: 0, open: false })
  const [deleting, setDeleting] = useState<ResourceView | null>(null)
  const list = useResources(
    workspace,
    {
      search: query.trim() || undefined,
      type: type === ALL ? undefined : (type as ResourceType),
      visibility: visibility === ALL ? undefined : (visibility as ResourceVisibilityType),
      groupClassId: classId === ALL ? undefined : classId,
      mine: isTeacher || undefined,
    },
    page,
    pageSize
  )
  const rows = (list.data?.data ?? []).map(toResourceView)
  const hasFilters = Boolean(query) || [type, visibility, classId].some((v) => v !== ALL)
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setPage(1)
  }
  const openEditor = (resource?: ResourceView) => setEditor((p) => ({ resource, key: p.key + 1, open: true }))
  const canAdd = !isTeacher || publishable.length > 0
  const addButton = (
    <Button onClick={() => openEditor()} disabled={!canAdd}>
      <Plus />
      إضافة مورد
    </Button>
  )

  return (
    <>
      <PageHeader
        title="الموارد"
        description={isTeacher ? "الموارد التي نشرتها لطلبة فصولك." : "الموارد البيداغوجية المنشورة للطلبة: ملفات، تسجيلات وروابط."}
        actions={addButton}
      />
      {isTeacher && publishable.length === 0 ? (
        <Card className="p-0">
          <EmptyState icon={FolderOpen} title="لا توجد فصول مسندة إليك لنشر الموارد" />
        </Card>
      ) : (
        <>
          <FilterBar
            hasActiveFilters={hasFilters}
            onReset={() => {
              setQuery("")
              setType(ALL)
              setVisibility(ALL)
              setClassId(ALL)
              setPage(1)
            }}
            resultLabel={list.data ? `${list.data.meta.total} مورد` : ""}
            search={<SearchInput value={query} onChange={reset(setQuery)} label="البحث في الموارد" placeholder="ابحث في الموارد…" />}
          >
            <FilterSelect label="النوع" allLabel="كل الأنواع" value={type} onValueChange={reset(setType)}
              options={RESOURCE_TYPES.map((t) => ({ value: t, label: labels.resourceType[t] }))} />
            {isTeacher ? (
              publishable.length > 1 && (
                <FilterSelect label="الفصل" allLabel="كل فصولي" value={classId} onValueChange={reset(setClassId)}
                  options={publishable.map((c) => ({ value: c.id, label: groupClassLabel(c, lookups) }))} />
              )
            ) : (
              <FilterSelect label="نطاق الظهور" allLabel="كل النطاقات" value={visibility} onValueChange={reset(setVisibility)}
                options={(["ALL_STUDENTS", "GROUP", "GROUP_CLASS"] as const).map((v) => ({ value: v, label: labels.resourceVisibility[v] }))} />
            )}
          </FilterBar>
          <QueryState query={list}>
            {rows.length === 0 ? (
              <Card className="p-0">
                {hasFilters ? (
                  <EmptyState icon={SearchX} title="لا توجد موارد مطابقة" />
                ) : (
                  <EmptyState icon={FolderOpen} title={isTeacher ? "لم تقم بنشر أي موارد بعد" : "لا توجد موارد منشورة"} action={addButton} />
                )}
              </Card>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {rows.map((resource) => {
                  const actions: RowAction[] = [
                    { label: "عرض", icon: Eye, href: `/${workspace}/resources/${resource.id}` },
                    ...(resource.canManage
                      ? [
                          { label: "تعديل", icon: Pencil, onSelect: () => openEditor(resource) },
                          { label: "حذف", icon: Trash2, destructive: true, separated: true, onSelect: () => setDeleting(resource) },
                        ]
                      : []),
                  ]
                  return (
                    <li key={resource.id}>
                      <ResourceCard
                        resource={resource}
                        href={`/${workspace}/resources/${resource.id}`}
                        today={today}
                        showTargets
                        actions={<ActionsMenu label={`إجراءات: ${resource.title}`} actions={actions} />}
                      />
                    </li>
                  )
                })}
              </ul>
            )}
            <Pager page={page} totalPages={list.data?.meta.totalPages ?? 1} onPage={setPage} />
          </QueryState>
        </>
      )}

      <ResourceEditor key={editor.key} open={editor.open} onOpenChange={(open) => setEditor((p) => ({ ...p, open }))}
        mode={workspace} resource={editor.resource} lookups={lookups} />
      <DeleteResourceDialog scope={workspace} resource={deleting} onDone={() => setDeleting(null)} />
    </>
  )
}

/** The form wired to the API: upload (with progress) → save → recipients notified by the API. */
function ResourceEditor({
  open,
  onOpenChange,
  mode,
  resource,
  lookups,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "admin" | "teacher"
  resource?: ResourceView
  lookups: Lookups
}) {
  const save = useSaveResource(mode, resource?.id)
  const [progress, setProgress] = useState<number | null>(null)
  return (
    <ResourceFormSheet
      open={open}
      onOpenChange={onOpenChange}
      mode={mode}
      resource={resource}
      lookups={lookups}
      publishableClasses={mode === "teacher" ? publishableOf(lookups) : []}
      pending={save.isPending}
      progress={progress}
      error={save.isError ? errorMessage(save.error) : null}
      onSave={(input, file) => {
        save.mutate(
          { input, file, onProgress: setProgress },
          {
            onSuccess: () => {
              onOpenChange(false)
              toast.success(resource ? "تم تعديل المورد" : "تم نشر المورد", {
                description: resource ? undefined : "أُرسل إشعار إلى الطلبة المعنيين.",
              })
            },
            onSettled: () => setProgress(null),
          }
        )
      }}
    />
  )
}

function DeleteResourceDialog({
  scope,
  resource,
  onDone,
  afterDelete,
}: {
  scope: "admin" | "teacher"
  resource: ResourceView | null
  onDone: () => void
  afterDelete?: () => void
}) {
  const remove = useDeleteResource(scope)
  return (
    <ConfirmDialog
      open={resource !== null}
      onOpenChange={(open) => !open && onDone()}
      title="حذف هذا المورد؟"
      description={resource ? `سيختفي «${resource.title}» من فضاء الطلبة. لا يمكن التراجع عن الحذف.` : ""}
      confirmLabel="حذف"
      destructive
      onConfirm={async () => {
        if (!resource) return
        await remove.mutateAsync(resource.id)
        onDone()
        toast.success("تم حذف المورد")
        afterDelete?.()
      }}
    />
  )
}

/** Read-only list of the resources the student can see (resolved by the API from their current class). */
export function StudentResources() {
  const today = todayInTunis()
  const pageSize = usePlatformSettings().defaultPageSize
  const [query, setQuery] = useState("")
  const [type, setType] = useState(ALL)
  const [page, setPage] = useState(1)
  const list = useResources("student", { search: query.trim() || undefined, type: type === ALL ? undefined : (type as ResourceType) }, page, pageSize)
  const rows = (list.data?.data ?? []).map(toResourceView)
  const hasFilters = Boolean(query) || type !== ALL

  return (
    <>
      <PageHeader title="الموارد" description="ملفات وتسجيلات وروابط نشرها معلموك والإدارة لك." />
      <FilterBar
        hasActiveFilters={hasFilters}
        onReset={() => {
          setQuery("")
          setType(ALL)
          setPage(1)
        }}
        resultLabel={list.data ? `${list.data.meta.total} مورد` : ""}
        search={
          <SearchInput
            value={query}
            onChange={(v) => {
              setQuery(v)
              setPage(1)
            }}
            label="البحث في الموارد"
            placeholder="ابحث في الموارد…"
          />
        }
      >
        <FilterSelect label="النوع" allLabel="كل الأنواع" value={type}
          onValueChange={(v) => {
            setType(v)
            setPage(1)
          }}
          options={RESOURCE_TYPES.map((t) => ({ value: t, label: labels.resourceType[t] }))} />
      </FilterBar>
      <QueryState query={list}>
        {rows.length === 0 ? (
          <Card className="p-0">
            <EmptyState icon={hasFilters ? SearchX : FolderOpen} title={hasFilters ? "لا توجد موارد مطابقة" : "لا توجد موارد متاحة حالياً"} />
          </Card>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((resource) => (
              <li key={resource.id}>
                <ResourceCard resource={resource} href={`/student/resources/${resource.id}`} today={today} />
              </li>
            ))}
          </ul>
        )}
        <Pager page={page} totalPages={list.data?.meta.totalPages ?? 1} onPage={setPage} />
      </QueryState>
    </>
  )
}

/** Image / audio preview of a private file (object URL, revoked when leaving). */
function FilePreview({ resource }: { resource: ResourceView }) {
  const previewable = resource.type === "IMAGE" || resource.type === "AUDIO"
  const { src } = usePrivateFileUrl(previewable ? resource.file?.url : null)
  if (!previewable || !src) return null
  return resource.type === "IMAGE" ? (
    // eslint-disable-next-line @next/next/no-img-element -- object URL of a private file
    <img src={src} alt={resource.title} className="max-h-96 w-auto rounded-lg border object-contain" />
  ) : (
    <audio controls src={src} className="w-full" />
  )
}

/** One resource. Students see educational information only (no targets, no actions). */
export function ResourceDetails({ resourceId, workspace, lookups }: { resourceId: ID; workspace: ResourceScope; lookups?: Lookups }) {
  const router = useRouter()
  const query = useResource(workspace, resourceId)
  const [editing, setEditing] = useState<{ key: number; open: boolean }>({ key: 0, open: false })
  const [deleting, setDeleting] = useState<ResourceView | null>(null)
  const back = `/${workspace}/resources`

  if (query.error instanceof ApiError && (query.error.isNotFound || query.error.status === 400))
    return <NotFoundState title="المورد غير موجود" backHref={back} backLabel="العودة إلى الموارد" />
  if (!query.data) return <QueryState query={query}>{null}</QueryState>
  const resource = toResourceView(query.data)
  const isStaff = workspace !== "student"
  const canManage = isStaff && resource.canManage && Boolean(lookups)
  const size = formatFileSize(resource.file?.size)

  return (
    <>
      <Breadcrumbs className="mb-4" items={[{ label: "الموارد", href: back }, { label: resource.title }]} />
      <Card className="gap-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <ResourceTypeBadge type={resource.type} />
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{resource.title}</h1>
          </div>
          {canManage && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditing((p) => ({ key: p.key + 1, open: true }))}>
                <Pencil />
                تعديل
              </Button>
              <Button variant="outline" className="text-destructive" onClick={() => setDeleting(resource)}>
                <Trash2 />
                حذف
              </Button>
            </div>
          )}
        </div>
        {resource.description && <p className="leading-relaxed whitespace-pre-wrap">{resource.description}</p>}
        <FilePreview resource={resource} />

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <UserRound className="size-4 text-muted-foreground" aria-hidden />
            <dt className="text-muted-foreground">نشره:</dt>
            <dd className="font-medium">{resource.publisher}</dd>
          </div>
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
            <dt className="text-muted-foreground">تاريخ النشر:</dt>
            <dd className="font-medium">{formatDate(resource.createdAt)}</dd>
          </div>
          {resource.file && (
            <div className="flex items-center gap-2 sm:col-span-2">
              <FolderOpen className="size-4 text-muted-foreground" aria-hidden />
              <dt className="text-muted-foreground">الملف:</dt>
              <dd className="min-w-0 truncate font-medium" dir="ltr">{resource.file.fileName}</dd>
              {size && <span className="text-xs text-muted-foreground">({size})</span>}
            </div>
          )}
          {isStaff && (
            <div className="flex items-start gap-2 sm:col-span-2">
              <Target className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
              <dt className="shrink-0 text-muted-foreground">يظهر لـ:</dt>
              <dd className="flex flex-wrap gap-1">
                {resource.targets.map((t) => (
                  <Badge key={t} variant="outline" className="h-auto whitespace-normal py-0.5 text-start font-normal">{t}</Badge>
                ))}
              </dd>
            </div>
          )}
        </dl>
        <div>
          <ResourceAction resource={resource} size="default" />
        </div>
      </Card>

      {canManage && lookups && (workspace === "admin" || workspace === "teacher") && (
        <>
          <ResourceEditor key={editing.key} open={editing.open} onOpenChange={(open) => setEditing((p) => ({ ...p, open }))}
            mode={workspace} resource={resource} lookups={lookups} />
          <DeleteResourceDialog scope={workspace} resource={deleting} onDone={() => setDeleting(null)} afterDelete={() => router.push(back)} />
        </>
      )}
    </>
  )
}
