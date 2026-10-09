"use client"

import { useQuery } from "@tanstack/react-query"
import { ArrowDown, ArrowUp, ExternalLink, Eye, EyeOff, ImagePlus, Loader2, Pencil, Plus, Trash2, type LucideIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { ActionsMenu, type RowAction } from "@/components/shared/actions-menu"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { EmptyState } from "@/components/shared/empty-state"
import { FormField, FormSection, FormSheet } from "@/components/shared/form"
import { Breadcrumbs, PageHeader } from "@/components/shared/page-header"
import { QueryState } from "@/components/shared/query-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { queries, useApiMutation } from "@/lib/api/academic"
import { api, fetchAll, uploadFile } from "@/lib/api/client"
import { errorMessage } from "@/lib/api/errors"
import type { StoredFileInfo } from "@/lib/api/hooks/people"
import { usePrivateFileUrl } from "@/lib/api/private-file"
import { cn } from "@/lib/utils"

export type FieldType = "text" | "textarea" | "image" | "date" | "time" | "number" | "select" | "checkbox" | "url"

export interface CmsField {
  /** The API field name (for an image: the URL field; its upload goes to `<name without Url>FileId`) */
  key: string
  label: string
  type: FieldType
  required?: boolean
  options?: { value: string; label: string }[]
  /** Options loaded from the API (active branches / groups) */
  optionsSource?: "branches" | "groups"
  description?: string
  /** Takes the full form width */
  wide?: boolean
}

export interface CmsFlag {
  key: string
  on: string
  off: string
  icon: LucideIcon
}

/** One admin CMS item as returned by GET /api/admin/cms/<slug>. */
export type CmsItem = { id: string; displayOrder?: number } & Record<string, unknown>

export interface CmsConfig {
  /** API collection: /api/admin/cms/<api> */
  api: string
  title: string
  description: string
  addLabel: string
  emptyLabel: string
  fields: CmsField[]
  defaults: Record<string, unknown>
  /** The flag that decides public visibility */
  publishKey: "isPublished" | "isActive"
  /** Supports manual ordering (PUT …/order) */
  ordered: boolean
  extraFlags?: CmsFlag[]
  summary: (item: CmsItem) => { title: string; subtitle?: string; image?: string; badges?: string[] }
  validate?: (values: Record<string, unknown>) => Record<string, string | undefined>
  publicHref?: (item: CmsItem) => string
}

export const cmsKey = (collection: string) => ["cms", collection] as const

/** Every item of a collection (admin order: display order, then creation). */
export function useCmsItems(collection: string) {
  return useQuery({
    queryKey: cmsKey(collection),
    queryFn: ({ signal }) => fetchAll<CmsItem>(`/admin/cms/${collection}`, {}, signal),
  })
}

/** Image field → the upload field the API expects (imageUrl → imageFileId, coverImageUrl → coverImageFileId…). */
const fileFieldOf = (key: string) => key.replace(/Url$/, "FileId")

/** A CMS image: a bundled "/website/…" asset, or an uploaded file (private path → fetched with the token). */
function CmsThumb({ src, className }: { src?: string | null; className?: string }) {
  const { src: resolved } = usePrivateFileUrl(src)
  if (!resolved) return <ImagePlus className="absolute inset-0 m-auto size-5 text-muted-foreground" aria-hidden />
  // eslint-disable-next-line @next/next/no-img-element -- object URL or bundled asset of arbitrary size
  return <img src={resolved} alt="" className={cn("absolute inset-0 size-full object-cover", className)} />
}

/** Field-driven manager used by every public-content section of the CMS — all writes go through the API. */
export function CmsManager({ config }: { config: CmsConfig }) {
  const query = useCmsItems(config.api)
  const invalidate = [cmsKey(config.api)]
  const patch = useApiMutation(
    ({ id, body }: { id: string; body: Record<string, unknown> }) => api(`/admin/cms/${config.api}/${id}`, { method: "PATCH", body }),
    invalidate
  )
  const reorder = useApiMutation((ids: string[]) => api(`/admin/cms/${config.api}/order`, { method: "PUT", body: { ids } }), invalidate)
  const remove = useApiMutation((id: string) => api(`/admin/cms/${config.api}/${id}`, { method: "DELETE" }), invalidate)
  const [editor, setEditor] = useState<{ item?: CmsItem; key: number; open: boolean }>({ key: 0, open: false })
  const [deleting, setDeleting] = useState<CmsItem | null>(null)
  const items = query.data ?? []
  const busy = patch.isPending || reorder.isPending
  const openEditor = (item?: CmsItem) => setEditor((p) => ({ item, key: p.key + 1, open: true }))
  const addButton = (
    <Button onClick={() => openEditor()}>
      <Plus />
      {config.addLabel}
    </Button>
  )
  const setFlag = (item: CmsItem, key: string, value: boolean, success?: string) =>
    patch.mutate(
      { id: item.id, body: { [key]: value } },
      { onSuccess: () => success && toast.success(success), onError: (error) => toast.error(errorMessage(error)) }
    )
  const move = (index: number, delta: -1 | 1) => {
    const ids = items.map((i) => i.id)
    ;[ids[index], ids[index + delta]] = [ids[index + delta], ids[index]]
    reorder.mutate(ids, { onError: (error) => toast.error(errorMessage(error)) })
  }

  return (
    <>
      <Breadcrumbs className="mb-4" items={[{ label: "الموقع الإلكتروني", href: "/admin/website" }, { label: config.title }]} />
      <PageHeader title={config.title} description={config.description} actions={addButton} />
      <QueryState query={query}>
        {items.length === 0 ? (
          <Card className="p-0">
            <EmptyState icon={ImagePlus} title={config.emptyLabel} action={addButton} />
          </Card>
        ) : (
          <ul className="space-y-2">
            {items.map((item, index) => {
              const { title, subtitle, image, badges } = config.summary(item)
              const visible = Boolean(item[config.publishKey])
              const toggleLabel = visible ? (config.publishKey === "isActive" ? "إلغاء التفعيل" : "إلغاء النشر") : config.publishKey === "isActive" ? "تفعيل" : "نشر"
              const toggle = () => setFlag(item, config.publishKey, !visible, visible ? "لم يعد ظاهرًا في الموقع" : "أصبح ظاهرًا في الموقع")
              const actions: RowAction[] = [
                { label: "تعديل", icon: Pencil, onSelect: () => openEditor(item) },
                ...(config.extraFlags ?? []).map((flag) => ({
                  label: item[flag.key] ? flag.off : flag.on,
                  icon: flag.icon,
                  onSelect: () => setFlag(item, flag.key, !item[flag.key], "تم الحفظ"),
                })),
                ...(config.publicHref && visible ? [{ label: "عرض في الموقع", icon: ExternalLink, href: config.publicHref(item) }] : []),
                { label: "حذف", icon: Trash2, destructive: true, separated: true, onSelect: () => setDeleting(item) },
              ]
              return (
                <li key={item.id}>
                  <Card className={cn("flex-row items-center gap-3 p-3 sm:gap-4", !visible && "bg-muted/40")}>
                    {config.ordered && (
                      <div className="flex flex-col">
                        <Button variant="ghost" size="icon" className="size-7" disabled={index === 0 || busy} aria-label={`تقديم ${title}`}
                          onClick={() => move(index, -1)}>
                          <ArrowUp />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-7" disabled={index === items.length - 1 || busy} aria-label={`تأخير ${title}`}
                          onClick={() => move(index, 1)}>
                          <ArrowDown />
                        </Button>
                      </div>
                    )}
                    {config.fields.some((f) => f.type === "image") && (
                      <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-muted sm:h-16 sm:w-24">
                        <CmsThumb src={image} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className={cn("truncate font-medium", !visible && "text-muted-foreground")}>{title}</p>
                      {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
                      <div className="flex flex-wrap gap-1">
                        <Badge className={cn("font-normal", visible ? "bg-brand-soft text-brand-soft-foreground" : "bg-muted text-muted-foreground")}>
                          {visible ? (config.publishKey === "isActive" ? "مفعّل" : "منشور") : config.publishKey === "isActive" ? "غير مفعّل" : "غير منشور"}
                        </Badge>
                        {badges?.map((b) => <Badge key={b} variant="outline" className="font-normal">{b}</Badge>)}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="hidden shrink-0 sm:inline-flex" disabled={busy} onClick={toggle}>
                      {visible ? <EyeOff /> : <Eye />}
                      {toggleLabel}
                    </Button>
                    <ActionsMenu
                      label={`إجراءات: ${title}`}
                      actions={[
                        // On phones the publish toggle lives in the menu
                        { label: visible ? "إخفاء من الموقع" : "إظهار في الموقع", icon: visible ? EyeOff : Eye, onSelect: toggle },
                        ...actions,
                      ]}
                    />
                  </Card>
                </li>
              )
            })}
          </ul>
        )}
      </QueryState>

      <CmsItemForm key={editor.key} open={editor.open} onOpenChange={(open) => setEditor((p) => ({ ...p, open }))} config={config} item={editor.item} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="حذف هذا العنصر؟"
        description="سيُحذف نهائيًا ويختفي من الموقع. لإخفائه مؤقتًا استعمل «إلغاء النشر»."
        confirmLabel="حذف"
        destructive
        onConfirm={async () => {
          if (!deleting) return
          await remove.mutateAsync(deleting.id)
          setDeleting(null)
          toast.success("تم الحذف")
        }}
      />
    </>
  )
}

/** undefined = unchanged, File = new upload, null = removed. */
type ImageChange = File | null | undefined

/** Image picker: the current image, a local preview of a new file, or nothing (uploaded on save). */
function ImageInput({ id, current, change, onChange, required, error }: {
  id: string
  current?: string | null
  change: ImageChange
  onChange: (change: ImageChange) => void
  required?: boolean
  error?: (message: string) => void
}) {
  const preview = useMemo(() => (change instanceof File ? URL.createObjectURL(change) : null), [change])
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])
  const shown = change === null ? null : (preview ?? current)
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg border bg-muted">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen file
            <img src={preview} alt="" className="absolute inset-0 size-full object-cover" />
          ) : (
            <CmsThumb src={shown} />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild type="button" variant="outline" size="sm">
            <label htmlFor={id} className="cursor-pointer">{shown ? "تغيير الصورة" : "اختيار صورة"}</label>
          </Button>
          {shown && !required && (
            <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => onChange(null)}>إزالة</Button>
          )}
        </div>
      </div>
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          if (!file) return
          if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return error?.("اختر صورة JPG أو PNG أو WebP")
          if (file.size > 5 * 1024 * 1024) return error?.("حجم الصورة يجب ألا يتجاوز 5 م.ب")
          onChange(file)
        }}
      />
      <p className="text-xs text-muted-foreground">JPG أو PNG أو WebP، حتى 5 م.ب.</p>
    </div>
  )
}

function CmsItemForm({
  open,
  onOpenChange,
  config,
  item,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: CmsConfig
  item?: CmsItem
}) {
  const needs = (source: "branches" | "groups") => config.fields.some((f) => f.optionsSource === source)
  // Reference lists only for the sections that link to them
  const branches = useQuery({ ...queries.branches(), enabled: needs("branches") })
  const groups = useQuery({ ...queries.groups(), enabled: needs("groups") })
  const dynamicOptions = {
    branches: needs("branches") ? (branches.data ?? []).filter((b) => b.status === "ACTIVE").map((b) => ({ value: b.id, label: b.name })) : [],
    groups: needs("groups") ? (groups.data ?? []).map((g) => ({ value: g.id, label: g.name })) : [],
  }
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...config.defaults, ...(item ?? {}) }))
  const [images, setImages] = useState<Record<string, ImageChange>>({})
  const [imageErrors, setImageErrors] = useState<Record<string, string | undefined>>({})
  const [submitted, setSubmitted] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const save = useApiMutation(
    (body: Record<string, unknown>) =>
      item
        ? api(`/admin/cms/${config.api}/${item.id}`, { method: "PATCH", body })
        : api(`/admin/cms/${config.api}`, { method: "POST", body }),
    [cmsKey(config.api)]
  )
  const [serverError, setServerError] = useState<string | null>(null)
  const set = (key: string, value: unknown) => setValues((v) => ({ ...v, [key]: value }))
  const errors: Record<string, string | undefined> = {}
  for (const f of config.fields) {
    const v = values[f.key]
    if (f.type === "image") {
      const empty = images[f.key] === null || (images[f.key] === undefined && !v)
      if (f.required && empty) errors[f.key] = `${f.label}: حقل مطلوب`
      continue
    }
    if (f.required && (v === undefined || v === null || String(v).trim() === "")) errors[f.key] = `${f.label}: حقل مطلوب`
    if (f.type === "url" && v && !/^(https?:\/\/|\/)/.test(String(v))) errors[f.key] = "رابط غير صالح (يبدأ بـ https:// أو /)"
  }
  Object.assign(errors, config.validate?.(values) ?? {})
  const hasErrors = Object.values(errors).some(Boolean)
  const pending = save.isPending || progress !== null

  /** Only the form's fields are sent (empty optional text → null); images are uploaded first. */
  async function submit() {
    const body: Record<string, unknown> = {}
    for (const f of config.fields) {
      if (f.type === "image") {
        const change = images[f.key]
        if (change === undefined) continue
        if (change === null) {
          body[f.key] = null
          body[fileFieldOf(f.key)] = null
          continue
        }
        setProgress(0)
        try {
          const stored = await uploadFile<StoredFileInfo>("/files", { purpose: "CMS_IMAGE" }, change, { onProgress: setProgress })
          body[f.key] = null
          body[fileFieldOf(f.key)] = stored.id
        } finally {
          setProgress(null)
        }
        continue
      }
      const v = values[f.key]
      if (f.type === "checkbox") body[f.key] = Boolean(v)
      else if (f.type === "number") body[f.key] = v === "" || v === undefined || v === null ? null : Number(v)
      else if (typeof v === "string") body[f.key] = v.trim() === "" ? null : v.trim()
      else body[f.key] = v ?? null
    }
    await save.mutateAsync(body)
    onOpenChange(false)
    toast.success(item ? "تم حفظ التعديلات" : "تمت الإضافة", { description: "يظهر التغيير في الموقع إن كان العنصر منشورًا." })
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={(next) => !pending && onOpenChange(next)}
      title={item ? `تعديل — ${config.title}` : config.addLabel}
      description="المحتوى بالعربية."
      submitLabel={item ? "حفظ التعديلات" : "إضافة"}
      pending={pending}
      error={serverError ?? undefined}
      onSubmit={(e) => {
        e.preventDefault()
        setSubmitted(true)
        if (hasErrors || pending) return
        setServerError(null)
        submit().catch((error: unknown) => setServerError(errorMessage(error)))
      }}
    >
      <FormSection title="المحتوى">
        {config.fields.map((f) => {
          const id = `cms-${f.key}`
          const error = submitted ? errors[f.key] : imageErrors[f.key]
          const value = values[f.key]
          const options = f.optionsSource ? dynamicOptions[f.optionsSource] : f.options
          let control: React.ReactNode
          switch (f.type) {
            case "textarea":
              control = <Textarea id={id} rows={f.key === "content" ? 8 : 3} value={String(value ?? "")} onChange={(e) => set(f.key, e.target.value)} />
              break
            case "image":
              control = (
                <ImageInput id={id} current={value as string | null | undefined} change={images[f.key]} required={f.required}
                  onChange={(change) => {
                    setImageErrors((x) => ({ ...x, [f.key]: undefined }))
                    setImages((x) => ({ ...x, [f.key]: change }))
                  }}
                  error={(message) => setImageErrors((x) => ({ ...x, [f.key]: message }))} />
              )
              break
            case "select":
              control = (
                <Select value={value ? String(value) : "__none"} onValueChange={(v) => set(f.key, v === "__none" ? null : v)}>
                  <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent position="popper">
                    {!f.required && <SelectItem value="__none">—</SelectItem>}
                    {options?.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              )
              break
            case "checkbox":
              return (
                <label key={f.key} className="flex cursor-pointer items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" className="size-4 accent-primary" checked={Boolean(value)} onChange={(e) => set(f.key, e.target.checked)} />
                  {f.label}
                  {f.description && <span className="text-xs text-muted-foreground">({f.description})</span>}
                </label>
              )
            default:
              control = (
                <Input
                  id={id}
                  type={f.type === "url" ? "text" : f.type}
                  dir={f.type === "url" || f.type === "time" ? "ltr" : undefined}
                  value={value === undefined || value === null ? "" : String(value)}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              )
          }
          return (
            <FormField key={f.key} id={id} label={f.label} required={f.required} optional={!f.required && f.type !== "image"}
              description={f.description} error={error} className={cn((f.wide || f.type === "textarea" || f.type === "image") && "sm:col-span-2")}>
              {control}
            </FormField>
          )
        })}
        {progress !== null && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2" aria-live="polite">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            جارٍ رفع الصورة… {progress}%
          </p>
        )}
      </FormSection>
    </FormSheet>
  )
}
