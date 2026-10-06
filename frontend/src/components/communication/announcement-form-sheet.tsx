"use client"

import { useState } from "react"

import { ChoiceGroup } from "@/components/shared/choice-group"
import { FormField, FormSection, FormSheet } from "@/components/shared/form"
import { MultiSelect } from "@/components/shared/multi-select"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { groupClassLabel } from "@/lib/communication"
import type { Lookups } from "@/lib/domain"
import { labels } from "@/lib/i18n"
import type { AnnouncementDraft } from "@/lib/store/operations"
import type { Announcement, AnnouncementAudienceType, ID, ISODate } from "@/types/domain"

/** Create / edit an announcement (admin only in this phase). */
export function AnnouncementFormSheet({
  open,
  onOpenChange,
  announcement,
  initialClassIds,
  lookups,
  today,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  announcement?: Announcement
  initialClassIds: ID[]
  lookups: Lookups
  today: ISODate
  onSave: (draft: AnnouncementDraft, groupClassIds: ID[]) => void
}) {
  const [title, setTitle] = useState(announcement?.title ?? "")
  const [content, setContent] = useState(announcement?.content ?? "")
  const [audience, setAudience] = useState<AnnouncementAudienceType>(announcement?.audienceType ?? "EVERYONE")
  const [classIds, setClassIds] = useState<ID[]>(initialClassIds)
  const [publishedAt, setPublishedAt] = useState(announcement?.publishedAt ?? today)
  const [expiresAt, setExpiresAt] = useState(announcement?.expiresAt ?? "")
  const [isActive, setIsActive] = useState(announcement?.isActive ?? true)
  const [submitted, setSubmitted] = useState(false)

  const errors = {
    title: !title.trim() ? "العنوان مطلوب" : undefined,
    content: !content.trim() ? "المحتوى مطلوب" : undefined,
    classes: audience === "SPECIFIC_GROUP_CLASSES" && classIds.length === 0 ? "اختر فصلًا واحدًا على الأقل" : undefined,
    publishedAt: !publishedAt ? "حدّد تاريخ النشر" : undefined,
    expiresAt: expiresAt && expiresAt < publishedAt ? "تاريخ الانتهاء يجب أن يكون بعد تاريخ النشر" : undefined,
  }
  const shown = (key: keyof typeof errors) => (submitted ? errors[key] : undefined)

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={announcement ? "تعديل الإعلان" : "إعلان جديد"}
      submitLabel={announcement ? "حفظ التعديلات" : "نشر الإعلان"}
      onSubmit={(e) => {
        e.preventDefault()
        setSubmitted(true)
        if (Object.values(errors).some(Boolean)) return
        onSave(
          {
            id: announcement?.id,
            title: title.trim(),
            content: content.trim(),
            audienceType: audience,
            publishedAt,
            expiresAt: expiresAt || undefined,
            isActive,
          },
          audience === "SPECIFIC_GROUP_CLASSES" ? classIds : []
        )
      }}
    >
      <FormSection title="الإعلان" className="sm:grid-cols-1">
        <FormField id="ann-title" label="العنوان" required error={shown("title")}>
          <Input id="ann-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} aria-invalid={!!shown("title") || undefined} />
        </FormField>
        <FormField id="ann-content" label="المحتوى" required error={shown("content")}>
          <Textarea id="ann-content" value={content} onChange={(e) => setContent(e.target.value)} rows={5} maxLength={2000} aria-invalid={!!shown("content") || undefined} />
        </FormField>
      </FormSection>

      <FormSection title="الجمهور المستهدف" className="sm:grid-cols-1">
        <ChoiceGroup
          label="الجمهور المستهدف"
          value={audience}
          onChange={setAudience}
          choices={[
            { value: "EVERYONE", label: labels.announcementAudience.EVERYONE, description: "الطلبة والمعلمون والإدارة" },
            { value: "TEACHERS", label: labels.announcementAudience.TEACHERS, description: "كل المعلمين" },
            { value: "STUDENTS", label: labels.announcementAudience.STUDENTS, description: "كل الطلبة النشطين" },
            { value: "SPECIFIC_GROUP_CLASSES", label: labels.announcementAudience.SPECIFIC_GROUP_CLASSES, description: "طلبة ومعلمو فصول بعينها" },
          ]}
        />
        {audience === "SPECIFIC_GROUP_CLASSES" && (
          <FormField id="ann-classes" label="الفصول المستهدفة" required error={shown("classes")}>
            <MultiSelect
              id="ann-classes"
              options={lookups.groupClasses.filter((c) => c.status !== "ARCHIVED").map((c) => ({ value: c.id, label: groupClassLabel(c, lookups) }))}
              selected={classIds}
              onChange={setClassIds}
              placeholder="اختر الفصول"
              searchPlaceholder="ابحث عن فصل…"
              countLabel={(n) => `${n} فصل مختار`}
              invalid={!!shown("classes")}
            />
          </FormField>
        )}
      </FormSection>

      <FormSection title="النشر">
        <FormField id="ann-published" label="تاريخ النشر" required error={shown("publishedAt")}>
          <Input id="ann-published" type="date" value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} />
        </FormField>
        <FormField id="ann-expires" label="تاريخ الانتهاء" optional error={shown("expiresAt")} description="بعده يختفي الإعلان من فضاء المعلمين والطلبة.">
          <Input id="ann-expires" type="date" value={expiresAt} min={publishedAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </FormField>
        <label className="flex cursor-pointer items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="size-4 accent-primary" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          الإعلان مفعّل
          <span className="text-xs text-muted-foreground">(غير المفعّل لا يظهر إلا للإدارة)</span>
        </label>
      </FormSection>
    </FormSheet>
  )
}
