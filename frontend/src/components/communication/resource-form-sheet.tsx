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
import type { ResourceDraft } from "@/lib/store/operations"
import type { GroupClass, ID, Resource, ResourceType, ResourceVisibilityType } from "@/types/domain"

import { FILE_TYPES, formatFileSize, RESOURCE_TYPES } from "./resource-badges"

const ACCEPT: Partial<Record<ResourceType, string>> = {
  PDF: "application/pdf",
  IMAGE: "image/*",
  AUDIO: "audio/*",
  FILE: ".pdf,.doc,.docx,.odt,.ppt,.pptx,.xls,.xlsx,.txt,.zip,image/*,audio/*",
}

/** Does the chosen file match the resource type? */
function fileMatches(type: ResourceType, mime: string) {
  if (type === "PDF") return mime === "application/pdf"
  if (type === "IMAGE") return mime.startsWith("image/")
  if (type === "AUDIO") return mime.startsWith("audio/")
  return true
}

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
 * Files: only metadata + a transient blob: URL for this session — no upload,
 * no base64; the API will return the stored file's URL later.
 */
export function ResourceFormSheet({
  open,
  onOpenChange,
  mode,
  resource,
  initialTargetIds,
  lookups,
  publishableClasses,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "admin" | "teacher"
  resource?: Resource
  initialTargetIds: ID[]
  lookups: Lookups
  /** Teacher mode: the teacher's own classes */
  publishableClasses: GroupClass[]
  onSave: (draft: ResourceDraft, targetIds: ID[]) => void
}) {
  const [title, setTitle] = useState(resource?.title ?? "")
  const [description, setDescription] = useState(resource?.description ?? "")
  const [type, setType] = useState<ResourceType>(resource?.type ?? "PDF")
  const [url, setUrl] = useState(resource?.externalUrl ?? "")
  const [file, setFile] = useState<File | null>(null)
  const [visibility, setVisibility] = useState<ResourceVisibilityType>(mode === "teacher" ? "GROUP_CLASS" : resource?.visibilityType ?? "ALL_STUDENTS")
  const classOptions = (mode === "teacher" ? publishableClasses : lookups.groupClasses.filter((c) => c.status !== "ARCHIVED")).map((c) => ({
    value: c.id,
    label: groupClassLabel(c, lookups),
  }))
  const allowedClassIds = new Set(classOptions.map((o) => o.value))
  const [groupIds, setGroupIds] = useState<ID[]>(resource?.visibilityType === "GROUP" ? initialTargetIds : [])
  // A teacher can only keep targets among their own classes
  const [classIds, setClassIds] = useState<ID[]>(
    resource?.visibilityType === "GROUP_CLASS" || mode === "teacher" ? initialTargetIds.filter((id) => allowedClassIds.has(id)) : []
  )
  const [submitted, setSubmitted] = useState(false)

  const isFileType = FILE_TYPES.includes(type)
  // Keeping the existing file is fine when editing without changing the type
  const keepsExistingFile = !file && resource?.type === type && Boolean(resource?.fileName)
  const errors = {
    title: !title.trim() ? "العنوان مطلوب" : undefined,
    url: !isFileType && !isHttpUrl(url.trim()) ? "أدخل رابطًا صحيحًا يبدأ بـ https://" : undefined,
    file: isFileType
      ? !file && !keepsExistingFile
        ? "اختر ملفًا"
        : file && !fileMatches(type, file.type)
          ? `الملف المختار لا يطابق النوع «${labels.resourceType[type]}»`
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
    if (Object.values(errors).some(Boolean)) return
    const fileFields = isFileType
      ? file
        ? {
            fileName: file.name,
            mimeType: file.type || undefined,
            fileSize: file.size,
            // Transient preview for this browser session only (not an upload)
            fileUrl: URL.createObjectURL(file),
          }
        : { fileName: resource?.fileName, mimeType: resource?.mimeType, fileSize: resource?.fileSize, fileUrl: resource?.fileUrl }
      : {}
    onSave(
      {
        id: resource?.id,
        title: title.trim(),
        description: description.trim(),
        type,
        visibilityType: mode === "teacher" ? "GROUP_CLASS" : visibility,
        externalUrl: isFileType ? undefined : url.trim(),
        ...fileFields,
      },
      visibility === "GROUP" ? groupIds : visibility === "GROUP_CLASS" ? classIds : []
    )
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={resource ? "تعديل المورد" : "إضافة مورد"}
      description={mode === "teacher" ? "يظهر المورد لطلبة الفصول التي تختارها من فصولك فقط." : undefined}
      onSubmit={submit}
      submitLabel={resource ? "حفظ التعديلات" : "نشر المورد"}
    >
      <FormSection title="المورد" className="sm:grid-cols-1">
        <FormField id="resource-title" label="العنوان" required error={shown("title")}>
          <Input id="resource-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} aria-invalid={!!shown("title") || undefined} />
        </FormField>
        <FormField id="resource-description" label="الوصف" optional>
          <Textarea id="resource-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={600} />
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
            description="معاينة مؤقتة في هذه الجلسة فقط — الرفع الفعلي سيتم مع ربط الخادم."
          >
            <label
              htmlFor="resource-file"
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3 text-sm transition-colors hover:bg-muted"
            >
              <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                {file ? file.name : keepsExistingFile ? resource?.fileName : "اختر ملفًا من جهازك"}
              </span>
              {(file || keepsExistingFile) && (
                <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(file?.size ?? resource?.fileSize)}</span>
              )}
            </label>
            <input
              key={type}
              id="resource-file"
              type="file"
              accept={ACCEPT[type]}
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
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
