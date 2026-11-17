"use client"

import { MyPhotoActions } from "@/components/student/my-photo-actions"
import { UserAvatar } from "@/components/shared/user-avatar"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

/**
 * «الصورة الشخصية» of the signed-in teacher (or student): the current photo
 * and the existing change / remove actions on their OWN profile
 * (/api/{role}/profile/photo — the person comes from the account).
 */
export function MyPhotoDialog({
  open,
  onOpenChange,
  name,
  photoUrl,
  role,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  name: string
  photoUrl?: string | null
  role: "student" | "teacher"
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>الصورة الشخصية</DialogTitle>
          <DialogDescription>تظهر صورتك لطلبتك وللإدارة. صيغ JPG أو PNG أو WebP، حتى 5 م.ب.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <UserAvatar name={name} photoUrl={photoUrl ?? undefined} size="xl" />
          <MyPhotoActions hasPhoto={Boolean(photoUrl)} role={role} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
