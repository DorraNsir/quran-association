"use client"

import { ArrowDown, ArrowUp, ExternalLink, Eye, EyeOff, ImagePlus, Pencil, Plus, Trash2, type LucideIcon } from "lucide-react"
import Image from "next/image"
import { useState } from "react"
import { toast } from "sonner"

import { ActionsMenu, type RowAction } from "@/components/shared/actions-menu"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { EmptyState } from "@/components/shared/empty-state"
import { FormField, FormSection, FormSheet } from "@/components/shared/form"
import { Breadcrumbs, PageHeader } from "@/components/shared/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { MOCK_TODAY } from "@/lib/mock/reference-date"
import { operations, useOperations, type CmsCollection, type CmsCollections, type CmsDraft } from "@/lib/store/operations"
import { cn } from "@/lib/utils"
import type { ID } from "@/types/domain"

export type FieldType = "text" | "textarea" | "image" | "date" | "time" | "number" | "select" | "checkbox" | "url"

export interface CmsField {
  key: string
  label: string
  type: FieldType
  required?: boolean
  options?: { value: string; label: string }[]
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

export interface CmsConfig<K extends CmsCollection> {
  collection: K
  title: string
  description: string
  addLabel: string
  emptyLabel: string
  fields: CmsField[]
  defaults: Record<string, unknown>
  /** The flag that decides public visibility */
  publishKey: "isPublished" | "isActive"
  /** Supports manual ordering (displayOrder) */
  ordered: boolean
  extraFlags?: CmsFlag[]
  sort?: (a: CmsCollections[K], b: CmsCollections[K]) => number
  summary: (item: CmsCollections[K]) => { title: string; subtitle?: string; image?: string; badges?: string[] }
  validate?: (values: Record<string, unknown>) => Record<string, string | undefined>
  publicHref?: (item: CmsCollections[K]) => string
}

type Item = { id: ID; displayOrder?: number } & Record<string, unknown>

/** Field-driven manager used by every public-content section of the CMS. */
export function CmsManager<K extends CmsCollection>({ config }: { config: CmsConfig<K> }) {
  const state = useOperations()
  const [editor, setEditor] = useState<{ item?: Item; key: number; open: boolean }>({ key: 0, open: false })
  const [deleting, setDeleting] = useState<Item | null>(null)
  const items = [...(state[config.collection] as unknown as Item[])].sort(
    config.sort
      ? (a, b) => config.sort!(a as unknown as CmsCollections[K], b as unknown as CmsCollections[K])
      : (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)
  )
  const openEditor = (item?: Item) => setEditor((p) => ({ item, key: p.key + 1, open: true }))
  const addButton = (
    <Button onClick={() => openEditor()}>
      <Plus />
      {config.addLabel}
    </Button>
  )

  return (
    <>
      <Breadcrumbs className="mb-4" items={[{ label: "الموقع الإلكتروني", href: "/admin/website" }, { label: config.title }]} />
      <PageHeader title={config.title} description={config.description} actions={addButton} />
      {items.length === 0 ? (
        <Card className="p-0">
          <EmptyState icon={ImagePlus} title={config.emptyLabel} action={addButton} />
        </Card>
      ) : (
        <ul className="space-y-2">
          {items.map((item, index) => {
            const typed = item as unknown as CmsCollections[K]
            const { title, subtitle, image, badges } = config.summary(typed)
            const visible = Boolean(item[config.publishKey])
            const actions: RowAction[] = [
              { label: "تعديل", icon: Pencil, onSelect: () => openEditor(item) },
              ...(config.extraFlags ?? []).map((flag) => ({
                label: item[flag.key] ? flag.off : flag.on,
                icon: flag.icon,
                onSelect: () => operations.setCmsFlag(config.collection, item.id, flag.key, !item[flag.key], MOCK_TODAY),
              })),
              ...(config.publicHref && visible ? [{ label: "عرض في الموقع", icon: ExternalLink, href: config.publicHref(typed) }] : []),
              { label: "حذف", icon: Trash2, destructive: true, separated: true, onSelect: () => setDeleting(item) },
            ]
            return (
              <li key={item.id}>
                <Card className={cn("flex-row items-center gap-3 p-3 sm:gap-4", !visible && "bg-muted/40")}>
                  {config.ordered && (
                    <div className="flex flex-col">
                      <Button variant="ghost" size="icon" className="size-7" disabled={index === 0} aria-label={`تقديم ${title}`}
                        onClick={() => operations.moveCmsItem(config.collection, item.id, "up")}>
                        <ArrowUp />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-7" disabled={index === items.length - 1} aria-label={`تأخير ${title}`}
                        onClick={() => operations.moveCmsItem(config.collection, item.id, "down")}>
                        <ArrowDown />
                      </Button>
                    </div>
                  )}
                  {config.fields.some((f) => f.type === "image") && (
                    <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-muted sm:h-16 sm:w-24">
                      {image ? <Image src={image} alt="" fill unoptimized className="object-cover" /> : <ImagePlus className="absolute inset-0 m-auto size-5 text-muted-foreground" aria-hidden />}
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
                  <Button
                    variant="outline"
                    size="sm"
                    className="hidden shrink-0 sm:inline-flex"
                    onClick={() => {
                      operations.setCmsFlag(config.collection, item.id, config.publishKey, !visible, MOCK_TODAY)
                      toast.success(visible ? "لم يعد ظاهرًا في الموقع" : "أصبح ظاهرًا في الموقع")
                    }}
                  >
                    {visible ? <EyeOff /> : <Eye />}
                    {visible ? (config.publishKey === "isActive" ? "إلغاء التفعيل" : "إلغاء النشر") : config.publishKey === "isActive" ? "تفعيل" : "نشر"}
                  </Button>
                  <ActionsMenu
                    label={`إجراءات: ${title}`}
                    actions={[
                      // On phones the publish toggle lives in the menu
                      {
                        label: visible ? "إخفاء من الموقع" : "إظهار في الموقع",
                        icon: visible ? EyeOff : Eye,
                        onSelect: () => operations.setCmsFlag(config.collection, item.id, config.publishKey, !visible, MOCK_TODAY),
                      },
                      ...actions,
                    ]}
                  />
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      <CmsItemForm key={editor.key} open={editor.open} onOpenChange={(open) => setEditor((p) => ({ ...p, open }))} config={config} item={editor.item} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="حذف هذا العنصر؟"
        description="سيُحذف نهائيًا ويختفي من الموقع. لإخفائه مؤقتًا استعمل «إلغاء النشر»."
        confirmLabel="حذف"
        destructive
        onConfirm={() => {
          if (deleting) operations.deleteCmsItem(config.collection, deleting.id)
          setDeleting(null)
          toast.success("تم الحذف")
        }}
      />
    </>
  )
}

/** Image picker: keeps the current URL, or a transient blob: preview (no upload, no base64). */
function ImageInput({ id, value, onChange, required }: { id: string; value?: string; onChange: (url?: string) => void; required?: boolean }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg border bg-muted">
          {value ? <Image src={value} alt="" fill unoptimized className="object-cover" /> : <ImagePlus className="absolute inset-0 m-auto size-5 text-muted-foreground" aria-hidden />}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild type="button" variant="outline" size="sm">
            <label htmlFor={id} className="cursor-pointer">{value ? "تغيير الصورة" : "اختيار صورة"}</label>
          </Button>
          {value && !required && (
            <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => onChange(undefined)}>إزالة</Button>
          )}
        </div>
      </div>
      <input
        id={id}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          // Transient preview for this session — the API will store the file and return its URL
          if (file) onChange(URL.createObjectURL(file))
        }}
      />
    </div>
  )
}

function CmsItemForm<K extends CmsCollection>({
  open,
  onOpenChange,
  config,
  item,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: CmsConfig<K>
  item?: Item
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...config.defaults, ...(item ?? {}) }))
  const [submitted, setSubmitted] = useState(false)
  const set = (key: string, value: unknown) => setValues((v) => ({ ...v, [key]: value }))
  const errors: Record<string, string | undefined> = {}
  for (const f of config.fields) {
    const v = values[f.key]
    if (f.required && (v === undefined || v === null || String(v).trim() === "")) errors[f.key] = `${f.label}: حقل مطلوب`
    if (f.type === "url" && v && !/^(https?:\/\/|\/)/.test(String(v))) errors[f.key] = "رابط غير صالح (يبدأ بـ https:// أو /)"
  }
  Object.assign(errors, config.validate?.(values) ?? {})
  const hasErrors = Object.values(errors).some(Boolean)

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={item ? `تعديل — ${config.title}` : config.addLabel}
      description="المحتوى بالعربية؛ الحقول الفرنسية ستُضاف مع النسخة الفرنسية للموقع."
      submitLabel={item ? "حفظ التعديلات" : "إضافة"}
      onSubmit={(e) => {
        e.preventDefault()
        setSubmitted(true)
        if (hasErrors) return
        const draft: Record<string, unknown> = { ...values }
        for (const f of config.fields) {
          const v = draft[f.key]
          if (f.type === "number") draft[f.key] = v === "" || v === undefined ? undefined : Number(v)
          else if (typeof v === "string") draft[f.key] = v.trim() === "" ? undefined : v.trim()
        }
        delete draft.createdAt
        delete draft.updatedAt
        delete draft.displayOrder
        operations.saveCmsItem(config.collection, draft as CmsDraft<K>, MOCK_TODAY)
        onOpenChange(false)
        toast.success(item ? "تم حفظ التعديلات" : "تمت الإضافة", { description: "يظهر التغيير مباشرة في الموقع إن كان العنصر منشورًا." })
      }}
    >
      <FormSection title="المحتوى">
        {config.fields.map((f) => {
          const id = `cms-${f.key}`
          const error = submitted ? errors[f.key] : undefined
          const value = values[f.key]
          let control: React.ReactNode
          switch (f.type) {
            case "textarea":
              control = <Textarea id={id} rows={f.key.startsWith("content") ? 8 : 3} value={String(value ?? "")} onChange={(e) => set(f.key, e.target.value)} />
              break
            case "image":
              control = <ImageInput id={id} value={value as string | undefined} onChange={(url) => set(f.key, url)} required={f.required} />
              break
            case "select":
              control = (
                <Select value={value ? String(value) : "__none"} onValueChange={(v) => set(f.key, v === "__none" ? undefined : v)}>
                  <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent position="popper">
                    {!f.required && <SelectItem value="__none">—</SelectItem>}
                    {f.options?.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
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
      </FormSection>
    </FormSheet>
  )
}
