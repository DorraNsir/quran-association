"use client"

import { Camera, Loader2, Trash2 } from "lucide-react"
import { useRef } from "react"
import { toast } from "sonner"

import { PHOTO_ACCEPT, photoFileError } from "@/components/shared/form"
import { Button } from "@/components/ui/button"
import { errorMessage } from "@/lib/api/errors"
import { useSetMyPhoto } from "@/lib/api/workspace"
import { useAuth } from "@/lib/auth/auth-provider"

/**
 * The student changes or removes their own photo — the only profile field
 * they may change (everything else goes through the administration). Saved
 * at once; the header avatar follows (session reloaded).
 */
export function MyPhotoActions({ hasPhoto }: { hasPhoto: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const setPhoto = useSetMyPhoto()
  const { reload } = useAuth()

  function save(photo: File | null) {
    setPhoto.mutateAsync(photo).then(
      async () => {
        toast.success(photo ? "تم تحديث صورتك" : "تم حذف صورتك")
        await reload()
      },
      (error: unknown) => toast.error(errorMessage(error))
    )
  }

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    const invalid = photoFileError(file)
    if (invalid) return void toast.error(invalid)
    save(file)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={setPhoto.isPending} onClick={() => inputRef.current?.click()}>
        {setPhoto.isPending ? <Loader2 className="animate-spin" /> : <Camera />}
        {hasPhoto ? "تغيير الصورة" : "إضافة صورة"}
      </Button>
      {hasPhoto && (
        <Button type="button" variant="ghost" size="sm" disabled={setPhoto.isPending} onClick={() => save(null)}>
          <Trash2 />
          حذف الصورة
        </Button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={PHOTO_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label="صورتي الشخصية"
        onChange={onFile}
      />
    </div>
  )
}
