"use client"

import { Paperclip } from "lucide-react"
import { useState } from "react"

import { ChoiceGroup } from "@/components/shared/choice-group"
import { FormField, FormSection, FormSheet } from "@/components/shared/form"
import { MultiSelect } from "@/components/shared/multi-select"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { groupClassLabel } from "@/lib/communication"
import type { Lookups } from "@/lib/domain"
import { labels } from "@/lib/i18n"
import { fileSizeError, RESOURCE_FILE_RULES, type ResourceInput, type ResourceView } from "@/lib/api/resources"
import type { GroupClass, ID, ResourceType, ResourceVisibilityType } from "@/types/domain"

import { FILE_TYPES, formatFileSize, RESOURCE_TYPES } from "./resource-badges"

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

/**
 * Create / edit a resource.
 * - admin: visibility ALL_STUDENTS, GROUP (one or more groups) or GROUP_CLASS;
 * - teacher: always GROUP_CLASS, among `publishableClasses` (their own) only.
 * Files are uploaded on save (private storage, progress shown), then
 * attached by id; links are stored as http(s) URLs.
 */
export function ResourceFormSheet({
  open,
  onOpenChange,
  mode,
  resource,
  lookups,
  publishableClasses,
  pending,
  progress,
  error,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "admin" | "teacher"
  resource?: ResourceView
  lookups: Lookups
  /** Teacher mode: the teacher's own classes */
  publishableClasses: GroupClass[]
  pending?: boolean
  /** Upload progress in %, while a file is being sent */
  progress?: number | null
  error?: string | null
  onSave: (input: ResourceInput, file: File | null) => void
}) {
  const [title, setTitle] = useState(resource?.title ?? "")
  const [description, setDescription] = useState(resource?.description ?? "")
  const [type, setType] = useState<ResourceType>(resource?.type ?? "PDF")
  const [url, setUrl] = useState(resource?.externalUrl ?? "")
  const [file, setFile] = useState<File | null>(null)
  const [visibility, setVisibility] = useState<ResourceVisibilityType>(mode === "teacher" ? "GROUP_CLASS" : resource?.visibility ?? "ALL_STUDENTS")
  const classOptions = (mode === "teacher" ? publishableClasses : lookups.groupClasses.filter((c) => c.status !== "ARCHIVED")).map((c) => ({
    value: c.id,
    label: groupClassLabel(c, lookups),
  }))
  const allowedClassIds = new Set(classOptions.map((o) => o.value))
  const [groupIds, setGroupIds] = useState<ID[]>(resource?.groupIds ?? [])
  // A teacher can only keep targets among their own classes
  const [classIds, setClassIds] = useState<ID[]>((resource?.groupClassIds ?? []).filter((id) => allowedClassIds.has(id)))
  const [submitted, setSubmitted] = useState(false)

  const isFileType = FILE_TYPES.includes(type)
  // Keeping the existing file is fine when editing without changing the type
  const keepsExistingFile = !file && resource?.type === type && Boolean(resource?.file)
  const rule = RESOURCE_FILE_RULES[type]
  const errors = {
    title: !title.trim() ? "العنوان مطلوب" : undefined,
    url: !isFileType && !isHttpUrl(url.trim()) ? "أدخل رابطًا صحيحًا يبدأ بـ https://" : undefined,
    file: isFileType
      ? !file && !keepsExistingFile
        ? "اختر ملفًا"
        : file && rule && !rule.mimes.includes(file.type)
          ? `الملف المختار لا يطابق النوع «${labels.resourceType[type]}» (${rule.label})`
          : file
            ? fileSizeError(file)
            : undefined
      : undefined,
    targets:
      visibility === "GROUP" && groupIds.length === 0
        ? "اختر مجموعة واحدة على الأقل"
        : visibility === "GROUP_CLASS" && classIds.length === 0
          ? "اختر فصلًا واحدًا على الأقل"
          : undefined,
  }
  const shown = (key: keyof typeof errors) => (submitted ? errors[key] : undefined)

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (pending || Object.values(errors).some(Boolean)) return
    onSave(
      {
        title: title.trim(),
        description: description.trim(),
        type,
        externalUrl: isFileType ? undefined : url.trim(),
        visibility: mode === "teacher" ? "GROUP_CLASS" : visibility,
        groupIds,
        groupClassIds: classIds,
      },
      isFileType ? file : null
    )
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={(next) => !pending && onOpenChange(next)}
      pending={pending}
      error={error}
      title={resource ? "تعديل المورد" : "إضافة مورد"}
      description={mode === "teacher" ? "يظهر المورد لطلبة الفصول التي تختارها من فصولك فقط." : undefined}
      onSubmit={submit}
      submitLabel={resource ? "حفظ التعديلات" : "نشر المورد"}
    >
      <FormSection title="المورد" className="sm:grid-cols-1">
        <FormField id="resource-title" label="العنوان" required error={shown("title")}>
          <Input id="resource-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} aria-invalid={!!shown("title") || undefined} />
        </FormField>
        <FormField id="resource-description" label="الوصف" optional>
          <Textarea id="resource-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={5000} />
        </FormField>
        <FormField id="resource-type" label="نوع المورد" required>
          <Select
            value={type}
            onValueChange={(v) => {
              setType(v as ResourceType)
              setFile(null)
            }}
          >
            <SelectTrigger id="resource-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {RESOURCE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {labels.resourceType[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        {isFileType ? (
          <FormField
            id="resource-file"
            label="الملف"
            required
            error={shown("file")}
            description={rule ? `${rule.label} — يُرفع الملف عند الحفظ.` : undefined}
          >
            <label
              htmlFor="resource-file"
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3 text-sm transition-colors hover:bg-muted"
            >
              <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                {file ? file.name : keepsExistingFile ? resource?.file?.fileName : "اختر ملفًا من جهازك"}
              </span>
              {(file || keepsExistingFile) && (
                <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(file?.size ?? resource?.file?.size)}</span>
              )}
            </label>
            <input
              key={type}
              id="resource-file"
              type="file"
              accept={rule?.accept}
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {progress !== null && progress !== undefined && (
              <div className="mt-2 space-y-1" aria-live="polite">
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">جارٍ رفع الملف… {progress}%</p>
              </div>
            )}
          </FormField>
        ) : (
          <FormField id="resource-url" label={type === "VIDEO_LINK" ? "رابط الفيديو" : "الرابط"} required error={shown("url")}>
            <Input
              id="resource-url"
              type="url"
              dir="ltr"
              inputMode="url"
              placeholder={type === "VIDEO_LINK" ? "https://www.youtube.com/watch?v=…" : "https://…"}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              aria-invalid={!!shown("url") || undefined}
            />
          </FormField>
        )}
      </FormSection>

      <FormSection title="نطاق الظهور" className="sm:grid-cols-1">
        {mode === "admin" && (
          <ChoiceGroup
            label="نطاق الظهور"
            value={visibility}
            onChange={setVisibility}
            className="sm:grid-cols-3"
            choices={[
              { value: "ALL_STUDENTS", label: labels.resourceVisibility.ALL_STUDENTS, description: "كل الطلبة النشطين" },
              { value: "GROUP", label: labels.resourceVisibility.GROUP, description: "كل فصول المجموعة" },
              { value: "GROUP_CLASS", label: labels.resourceVisibility.GROUP_CLASS, description: "فصل بعينه فقط" },
            ]}
          />
        )}
        {visibility === "GROUP" && (
          <FormField id="resource-groups" label="المجموعات المستهدفة" required error={shown("targets")}
            description="اختيار مجموعة يشمل كل فصولها في جميع الفروع.">
            <MultiSelect
              id="resource-groups"
              options={lookups.groups.filter((g) => g.status !== "ARCHIVED").map((g) => ({ value: g.id, label: g.name }))}
              selected={groupIds}
              onChange={setGroupIds}
              placeholder="اختر المجموعات"
              searchPlaceholder="ابحث عن مجموعة…"
              countLabel={(n) => `${n} مجموعة مختارة`}
              invalid={!!shown("targets")}
            />
          </FormField>
        )}
        {visibility === "GROUP_CLASS" &&
          (classOptions.length === 0 ? (
            <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">لا توجد فصول مسندة إليك لنشر الموارد</p>
          ) : (
            <FormField id="resource-classes" label="الفصول المستهدفة" required error={shown("targets")}>
              <MultiSelect
                id="resource-classes"
                options={classOptions}
                selected={classIds}
                onChange={setClassIds}
                placeholder="اختر الفصول"
                searchPlaceholder="ابحث عن فصل…"
                countLabel={(n) => `${n} فصل مختار`}
                invalid={!!shown("targets")}
              />
            </FormField>
          ))}
      </FormSection>
    </FormSheet>
  )
}
