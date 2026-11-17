"use client"

import { useState } from "react"

import { ChoiceGroup } from "@/components/shared/choice-group"
import { FormField, FormSection, FormSheet } from "@/components/shared/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { AnnouncementDto, TeacherAnnouncementInput, TeacherPublicationMode } from "@/lib/api/announcements"
import { todayInTunis } from "@/lib/dates"
import type { ID } from "@/types/domain"

import { audienceDetail } from "./announcements-views"
import { ClassAudienceField, type ClassOption } from "./teacher-announcement-audience"

export interface TeacherAnnouncementFormResult {
  input: TeacherAnnouncementInput
  mode: TeacherPublicationMode
}

/**
 * The teacher form (TeacherAnnouncementDto): title, content, the target
 * classes chosen explicitly among their eligible ones, an optional last day,
 * and — for a new one — publish now or save as a draft (no scheduling for
 * teachers). After publication only title, content and the last day change.
 */
export function TeacherAnnouncementFormSheet({
  open,
  onOpenChange,
  announcement,
  classes,
  pending,
  error,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  announcement?: AnnouncementDto
  classes: ClassOption[]
  pending?: boolean
  error?: string | null
  onSave: (result: TeacherAnnouncementFormResult) => void
}) {
  const today = todayInTunis()
  const published = announcement?.status === "PUBLISHED"
  const eligible = new Set(classes.map((c) => c.value))
  const [title, setTitle] = useState(announcement?.title ?? "")
  const [content, setContent] = useState(announcement?.content ?? "")
  // Only targets among my current classes are kept: a lost class is never sent back
  const [classIds, setClassIds] = useState<ID[]>(
    announcement ? announcement.groupClasses.map((c) => c.id).filter((id) => eligible.has(id)) : []
  )
  const [expiresAt, setExpiresAt] = useState(announcement?.expiresAt ?? "")
  const [mode, setMode] = useState<TeacherPublicationMode>("PUBLISH_NOW")
  const [submitted, setSubmitted] = useState(false)

  const errors = {
    title: !title.trim() ? "العنوان مطلوب" : undefined,
    content: !content.trim() ? "المحتوى مطلوب" : undefined,
    classes: !published && classIds.length === 0 ? "اختر فصلًا واحدًا على الأقل" : undefined,
    // A new one: not before today (an existing one: the API compares with its publication day)
    expiresAt: !announcement && expiresAt && expiresAt < today ? "تاريخ الانتهاء يجب ألا يسبق اليوم" : undefined,
  }
  const shown = (key: keyof typeof errors) => (submitted ? errors[key] : undefined)

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={announcement ? "تعديل الإعلان" : "إعلان جديد"}
      submitLabel={announcement ? "حفظ التعديلات" : mode === "PUBLISH_NOW" ? "نشر الإعلان" : "حفظ كمسودة"}
      pending={pending}
      error={error}
      onSubmit={(e) => {
        e.preventDefault()
        setSubmitted(true)
        if (pending || Object.values(errors).some(Boolean)) return
        onSave({
          input: { title: title.trim(), content: content.trim(), groupClassIds: classIds, expiresAt: expiresAt || null },
          mode,
        })
      }}
    >
      <FormSection title="الإعلان" className="sm:grid-cols-1">
        <FormField id="tann-title" label="العنوان" required error={shown("title")}>
          <Input id="tann-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} aria-invalid={!!shown("title") || undefined} />
        </FormField>
        <FormField id="tann-content" label="المحتوى" required error={shown("content")}>
          <Textarea
            id="tann-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            maxLength={10000}
            aria-invalid={!!shown("content") || undefined}
          />
        </FormField>
      </FormSection>

      <FormSection
        title="الفصول المستهدفة"
        description={published ? "لا يمكن تغيير الفصول بعد النشر." : "طلبة ومعلمو الفصول المختارة فقط."}
        className="sm:grid-cols-1"
      >
        <ClassAudienceField
          classes={classes}
          selected={classIds}
          onChange={setClassIds}
          error={shown("classes")}
          locked={published && announcement ? audienceDetail(announcement) : undefined}
        />
      </FormSection>

      {!announcement && (
        <FormSection title="النشر" className="sm:grid-cols-1">
          <ChoiceGroup
            label="طريقة النشر"
            value={mode}
            onChange={setMode}
            choices={[
              { value: "PUBLISH_NOW", label: "نشر الآن", description: "يظهر فورًا ويُرسل إشعار إلى طلبة ومعلمي الفصول المختارة." },
              { value: "DRAFT", label: "حفظ كمسودة", description: "لا يظهر لأحد غيرك ولا يُرسل أي إشعار." },
            ]}
          />
        </FormSection>
      )}

      <FormSection title="مدة العرض" className="sm:grid-cols-1">
        <FormField id="tann-expires" label="تاريخ الانتهاء" optional error={shown("expiresAt")} description="آخر يوم يظهر فيه الإعلان.">
          <Input
            id="tann-expires"
            type="date"
            value={expiresAt}
            min={announcement ? undefined : today}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="sm:w-48"
          />
        </FormField>
      </FormSection>
    </FormSheet>
  )
}
