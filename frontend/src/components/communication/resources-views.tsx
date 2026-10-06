"use client"

import { CalendarDays, Eye, FolderOpen, Pencil, Plus, SearchX, Target, Trash2, UserRound } from "lucide-react"
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
  canTeacherManageResource,
  canTeacherViewResource,
  getResourcesForStudent,
  getResourcesPublishedBy,
  getTeacherPublishableGroupClasses,
  groupClassLabel,
  isResourceVisibleToStudent,
  resourceTargetsOf,
} from "@/lib/communication"
import type { Lookups } from "@/lib/domain"
import { formatDate, formatRelativeDay } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { operations, useOperations } from "@/lib/store/operations"
import type { ID, ISODate, Resource, ResourceTarget, Student, User } from "@/types/domain"

import { RESOURCE_TYPES, ResourceAction, ResourceTypeBadge, formatFileSize } from "./resource-badges"
import { ResourceFormSheet } from "./resource-form-sheet"

/** Publisher display names by user id (names only — no account details reach the page). */
export type PublisherNames = Record<ID, string>

/** "جميع الطلاب" or the explicit Group / GroupClass names — for staff only. */
function targetLabels(resource: Resource, targets: ResourceTarget[], lookups: Lookups) {
  if (resource.visibilityType === "ALL_STUDENTS") return [labels.resourceVisibility.ALL_STUDENTS]
  return resourceTargetsOf(resource.id, targets).map((t) => {
    if (t.targetType === "GROUP") return lookups.groups.find((g) => g.id === t.targetId)?.name ?? "—"
    const groupClass = lookups.groupClasses.find((c) => c.id === t.targetId)
    return groupClass ? groupClassLabel(groupClass, lookups) : "—"
  })
}

function ResourceCard({
  resource,
  href,
  publisher,
  today,
  targets,
  actions,
}: {
  resource: Resource
  href: string
  publisher: string
  today: ISODate
  /** Staff only: who the resource reaches */
  targets?: string[]
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
      {targets && (
        <ul className="flex flex-wrap gap-1" aria-label="الفئة المستهدفة">
          {targets.map((t) => (
            <li key={t}>
              <Badge variant="outline" className="h-auto max-w-full whitespace-normal py-0.5 text-start font-normal">{t}</Badge>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <p className="text-xs text-muted-foreground">
          {publisher} · {formatRelativeDay(resource.createdAt, today)}
        </p>
        <ResourceAction resource={resource} />
      </div>
    </Card>
  )
}

/**
 * Admin: every resource, association-wide.
 * Teacher: the resources they published, toward their own classes only.
 */
export function StaffResources({
  workspace,
  user,
  lookups,
  publishers,
  today,
}: {
  workspace: "admin" | "teacher"
  user: User
  lookups: Lookups
  publishers: PublisherNames
  today: ISODate
}) {
  const { resources, resourceTargets } = useOperations()
  const isTeacher = workspace === "teacher"
  const publishable = isTeacher && user.teacherId ? getTeacherPublishableGroupClasses(user.teacherId, lookups) : []
  const [query, setQuery] = useState("")
  const [type, setType] = useState(ALL)
  const [visibility, setVisibility] = useState(ALL)
  const [publisher, setPublisher] = useState(ALL)
  const [classId, setClassId] = useState(ALL)
  const [editor, setEditor] = useState<{ resource?: Resource; key: number; open: boolean }>({ key: 0, open: false })
  const [deleting, setDeleting] = useState<Resource | null>(null)

  const list = isTeacher ? getResourcesPublishedBy(user.id, resources).filter((r) => canTeacherManageResource(r, user)) : [...resources].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const shown = list.filter(
    (r) =>
      (!query.trim() || matchesText(`${r.title} ${r.description}`, query)) &&
      (type === ALL || r.type === type) &&
      (visibility === ALL || r.visibilityType === visibility) &&
      (publisher === ALL || r.publishedByUserId === publisher) &&
      (classId === ALL || resourceTargetsOf(r.id, resourceTargets).some((t) => t.targetType === "GROUP_CLASS" && t.targetId === classId))
  )
  const hasFilters = Boolean(query) || [type, visibility, publisher, classId].some((v) => v !== ALL)
  const openEditor = (resource?: Resource) => setEditor((p) => ({ resource, key: p.key + 1, open: true }))
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
          {list.length > 0 && (
            <FilterBar
              hasActiveFilters={hasFilters}
              onReset={() => {
                setQuery("")
                setType(ALL)
                setVisibility(ALL)
                setPublisher(ALL)
                setClassId(ALL)
              }}
              resultLabel={`${shown.length} مورد`}
              search={<SearchInput value={query} onChange={setQuery} label="البحث في الموارد" placeholder="ابحث في الموارد…" />}
            >
              <FilterSelect label="النوع" allLabel="كل الأنواع" value={type} onValueChange={setType}
                options={RESOURCE_TYPES.map((t) => ({ value: t, label: labels.resourceType[t] }))} />
              {isTeacher ? (
                publishable.length > 1 && (
                  <FilterSelect label="الفصل" allLabel="كل فصولي" value={classId} onValueChange={setClassId}
                    options={publishable.map((c) => ({ value: c.id, label: groupClassLabel(c, lookups) }))} />
                )
              ) : (
                <>
                  <FilterSelect label="نطاق الظهور" allLabel="كل النطاقات" value={visibility} onValueChange={setVisibility}
                    options={(["ALL_STUDENTS", "GROUP", "GROUP_CLASS"] as const).map((v) => ({ value: v, label: labels.resourceVisibility[v] }))} />
                  <FilterSelect label="الناشر" allLabel="كل الناشرين" value={publisher} onValueChange={setPublisher}
                    options={[...new Set(list.map((r) => r.publishedByUserId))].map((id) => ({ value: id, label: publishers[id] ?? "—" }))} />
                </>
              )}
            </FilterBar>
          )}
          {shown.length === 0 ? (
            <Card className="p-0">
              {list.length === 0 ? (
                <EmptyState icon={FolderOpen} title={isTeacher ? "لم تقم بنشر أي موارد بعد" : "لا توجد موارد منشورة"} action={addButton} />
              ) : (
                <EmptyState icon={SearchX} title="لا توجد موارد مطابقة" />
              )}
            </Card>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((resource) => {
                const actions: RowAction[] = [
                  { label: "عرض", icon: Eye, href: `/${workspace}/resources/${resource.id}` },
                  { label: "تعديل", icon: Pencil, onSelect: () => openEditor(resource) },
                  { label: "حذف", icon: Trash2, destructive: true, separated: true, onSelect: () => setDeleting(resource) },
                ]
                return (
                  <li key={resource.id}>
                    <ResourceCard
                      resource={resource}
                      href={`/${workspace}/resources/${resource.id}`}
                      publisher={publishers[resource.publishedByUserId] ?? "—"}
                      today={today}
                      targets={targetLabels(resource, resourceTargets, lookups)}
                      actions={<ActionsMenu label={`إجراءات: ${resource.title}`} actions={actions} />}
                    />
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      <ResourceEditor
        key={editor.key}
        open={editor.open}
        onOpenChange={(open) => setEditor((p) => ({ ...p, open }))}
        mode={workspace}
        resource={editor.resource}
        user={user}
        lookups={lookups}
        today={today}
      />
      <DeleteResourceDialog resource={deleting} onDone={() => setDeleting(null)} />
    </>
  )
}

/** The form wired to the shared store (create → notify recipients). */
function ResourceEditor({
  open,
  onOpenChange,
  mode,
  resource,
  user,
  lookups,
  today,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "admin" | "teacher"
  resource?: Resource
  user: User
  lookups: Lookups
  today: ISODate
}) {
  const { resourceTargets } = useOperations()
  const publishable = mode === "teacher" && user.teacherId ? getTeacherPublishableGroupClasses(user.teacherId, lookups) : []
  return (
    <ResourceFormSheet
      open={open}
      onOpenChange={onOpenChange}
      mode={mode}
      resource={resource}
      initialTargetIds={resource ? resourceTargetsOf(resource.id, resourceTargets).map((t) => t.targetId) : []}
      lookups={lookups}
      publishableClasses={publishable}
      onSave={(draft, targetIds) => {
        // Teacher targets are re-checked against their own classes before saving
        const allowed = mode === "teacher" ? targetIds.filter((id) => publishable.some((c) => c.id === id)) : targetIds
        operations.saveResource(draft, allowed, user.id, today)
        onOpenChange(false)
        toast.success(resource ? "تم تعديل المورد" : "تم نشر المورد", {
          description: resource ? labels.common.mockNotice : "أُرسل إشعار إلى الطلبة المعنيين.",
        })
      }}
    />
  )
}

function DeleteResourceDialog({ resource, onDone, afterDelete }: { resource: Resource | null; onDone: () => void; afterDelete?: () => void }) {
  return (
    <ConfirmDialog
      open={resource !== null}
      onOpenChange={(open) => !open && onDone()}
      title="حذف هذا المورد؟"
      description={resource ? `سيختفي «${resource.title}» من فضاء الطلبة. لا يمكن التراجع عن الحذف.` : ""}
      confirmLabel="حذف"
      destructive
      onConfirm={() => {
        if (resource) operations.deleteResource(resource.id)
        onDone()
        toast.success("تم حذف المورد")
        afterDelete?.()
      }}
    />
  )
}

/** Read-only list of the resources the student can see (same rule as their notifications). */
export function StudentResources({
  student,
  lookups,
  publishers,
  today,
}: {
  student: Student
  lookups: Lookups
  publishers: PublisherNames
  today: ISODate
}) {
  const { resources, resourceTargets } = useOperations()
  const [query, setQuery] = useState("")
  const [type, setType] = useState(ALL)
  const visible = getResourcesForStudent(student, resources, resourceTargets, lookups.groupClasses)
  const shown = visible.filter(
    (r) => (!query.trim() || matchesText(`${r.title} ${r.description}`, query)) && (type === ALL || r.type === type)
  )

  return (
    <>
      <PageHeader title="الموارد" description="ملفات وتسجيلات وروابط نشرها معلموك والإدارة لك." />
      {visible.length > 0 && (
        <FilterBar
          hasActiveFilters={Boolean(query) || type !== ALL}
          onReset={() => {
            setQuery("")
            setType(ALL)
          }}
          resultLabel={`${shown.length} مورد`}
          search={<SearchInput value={query} onChange={setQuery} label="البحث في الموارد" placeholder="ابحث في الموارد…" />}
        >
          <FilterSelect label="النوع" allLabel="كل الأنواع" value={type} onValueChange={setType}
            options={RESOURCE_TYPES.map((t) => ({ value: t, label: labels.resourceType[t] }))} />
        </FilterBar>
      )}
      {shown.length === 0 ? (
        <Card className="p-0">
          <EmptyState icon={visible.length === 0 ? FolderOpen : SearchX} title={visible.length === 0 ? "لا توجد موارد متاحة حالياً" : "لا توجد موارد مطابقة"} />
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((resource) => (
            <li key={resource.id}>
              <ResourceCard resource={resource} href={`/student/resources/${resource.id}`} publisher={publishers[resource.publishedByUserId] ?? "—"} today={today} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/** Who is looking — decides access, targeting details and management actions. */
export type ResourceViewer =
  | { workspace: "admin"; user: User }
  | { workspace: "teacher"; user: User }
  | { workspace: "student"; student: Student }

/** One resource. Students see educational information only (no targets, no actions). */
export function ResourceDetails({
  resourceId,
  viewer,
  lookups,
  publishers,
  today,
}: {
  resourceId: ID
  viewer: ResourceViewer
  lookups: Lookups
  publishers: PublisherNames
  today: ISODate
}) {
  const router = useRouter()
  const { resources, resourceTargets } = useOperations()
  const [editing, setEditing] = useState<{ key: number; open: boolean }>({ key: 0, open: false })
  const [deleting, setDeleting] = useState<Resource | null>(null)
  const resource = resources.find((r) => r.id === resourceId)
  const back = `/${viewer.workspace}/resources`

  if (!resource) {
    return (
      <Card className="p-0">
        <EmptyState icon={FolderOpen} title="المورد غير موجود" description="ربما حُذف هذا المورد."
          action={<Button asChild variant="outline"><Link href={back}>العودة إلى الموارد</Link></Button>} />
      </Card>
    )
  }
  const allowed =
    viewer.workspace === "admin" ||
    (viewer.workspace === "teacher" && canTeacherViewResource(resource, resourceTargets, viewer.user, lookups)) ||
    (viewer.workspace === "student" && isResourceVisibleToStudent(resource, resourceTargets, viewer.student, lookups.groupClasses))
  if (!allowed) return <NoAccess backHref={back} backLabel="العودة إلى الموارد" />

  const canManage = viewer.workspace === "admin" || (viewer.workspace === "teacher" && canTeacherManageResource(resource, viewer.user))
  const isStaff = viewer.workspace !== "student"
  const size = formatFileSize(resource.fileSize)

  return (
    <>
      <Breadcrumbs className="mb-4" items={[{ label: "الموارد", href: back }, { label: resource.title }]} />
      <Card className="gap-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <ResourceTypeBadge type={resource.type} />
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{resource.title}</h1>
          </div>
          {canManage && "user" in viewer && (
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

        {/* Transient previews only exist for files chosen in this session */}
        {resource.type === "IMAGE" && resource.fileUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- blob: preview, not an optimizable asset
          <img src={resource.fileUrl} alt={resource.title} className="max-h-96 w-auto rounded-lg border object-contain" />
        )}
        {resource.type === "AUDIO" && resource.fileUrl && <audio controls src={resource.fileUrl} className="w-full" />}

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <UserRound className="size-4 text-muted-foreground" aria-hidden />
            <dt className="text-muted-foreground">نشره:</dt>
            <dd className="font-medium">{publishers[resource.publishedByUserId] ?? "—"}</dd>
          </div>
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
            <dt className="text-muted-foreground">تاريخ النشر:</dt>
            <dd className="font-medium">{formatDate(resource.createdAt)}</dd>
          </div>
          {resource.fileName && (
            <div className="flex items-center gap-2 sm:col-span-2">
              <FolderOpen className="size-4 text-muted-foreground" aria-hidden />
              <dt className="text-muted-foreground">الملف:</dt>
              <dd className="min-w-0 truncate font-medium" dir="ltr">{resource.fileName}</dd>
              {size && <span className="text-xs text-muted-foreground">({size})</span>}
            </div>
          )}
          {isStaff && (
            <div className="flex items-start gap-2 sm:col-span-2">
              <Target className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
              <dt className="shrink-0 text-muted-foreground">يظهر لـ:</dt>
              <dd className="flex flex-wrap gap-1">
                {targetLabels(resource, resourceTargets, lookups).map((t) => (
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

      {"user" in viewer && canManage && (
        <>
          <ResourceEditor
            key={editing.key}
            open={editing.open}
            onOpenChange={(open) => setEditing((p) => ({ ...p, open }))}
            mode={viewer.workspace}
            resource={resource}
            user={viewer.user}
            lookups={lookups}
            today={today}
          />
          <DeleteResourceDialog resource={deleting} onDone={() => setDeleting(null)} afterDelete={() => router.push(back)} />
        </>
      )}
    </>
  )
}
