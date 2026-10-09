"use client"

import { KeyRound, Loader2, Power, PowerOff, ShieldCheck, UserPlus, UserRound } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { passwordPolicyError } from "@/components/auth/change-password-form"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { SectionCard } from "@/components/shared/info-list"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, keys, useApiMutation, type AccountSummary } from "@/lib/api/academic"
import { errorMessage } from "@/lib/api/errors"
import { labels } from "@/lib/i18n"

type Role = AccountSummary["roles"][number]

/** Same rule as the API: 3–32 chars, lowercase latin letters, digits, . _ - */
const USERNAME = /^[a-z0-9](?:[a-z0-9._-]{1,30})[a-z0-9]$/
const usernameError = (value: string) =>
  !value ? "اسم المستخدم مطلوب" : !USERNAME.test(value) ? "من 3 إلى 32 حرفًا: أحرف لاتينية صغيرة وأرقام و . _ - فقط" : undefined

/** A random temporary password (the user must change it at first login). */
function temporaryPassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")
}

/** Invalidated after any account change: profiles read the account from these lists. */
const accountKeys = [keys.teachers, keys.students, ["admin-accounts"]]

/**
 * "حساب الدخول" of a teacher or student (admin only): create a login with a
 * temporary password, reset it, enable / disable it, and — for a teacher —
 * grant the administration role. Passwords are never shown again after the
 * dialog closes; the API forces a change at first login.
 */
export function AccountCard({
  personId,
  account,
  role,
}: {
  personId: string
  account: AccountSummary | null
  /** The workspace role this person's account has */
  role: Extract<Role, "TEACHER" | "STUDENT">
}) {
  const [dialog, setDialog] = useState<{ kind: "create" | "reset"; key: number } | null>(null)
  const [confirm, setConfirm] = useState<"activate" | "deactivate" | "admin" | null>(null)
  const isAdmin = Boolean(account?.roles.includes("ADMIN"))
  const toggle = useApiMutation(
    (kind: "activate" | "deactivate" | "admin") =>
      kind === "admin"
        ? api(`/admin/accounts/${account!.id}/roles`, {
            method: "PUT",
            body: { roles: isAdmin ? account!.roles.filter((r) => r !== "ADMIN") : [...account!.roles, "ADMIN"] },
          })
        : api(`/admin/accounts/${account!.id}/${kind}`, { method: "POST" }),
    accountKeys
  )

  return (
    <SectionCard title="حساب الدخول" icon={KeyRound}>
      {!account ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">لا يوجد حساب دخول. أنشئ حسابًا بكلمة مرور مؤقتة يغيّرها صاحبه عند أول دخول.</p>
          <Button size="sm" onClick={() => setDialog({ kind: "create", key: Date.now() })}>
            <UserPlus />
            إنشاء حساب
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <UserRound className="size-4 text-muted-foreground" aria-hidden />
            <span className="font-medium" dir="ltr">{account.username}</span>
            <Badge variant={account.isActive ? "secondary" : "outline"} className="font-normal">
              {account.isActive ? "مفعّل" : "معطّل"}
            </Badge>
            {account.roles.map((r) => (
              <Badge key={r} variant="outline" className="font-normal">{labels.role[r]}</Badge>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "reset", key: Date.now() })}>
              <KeyRound />
              كلمة مرور مؤقتة جديدة
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirm(account.isActive ? "deactivate" : "activate")}>
              {account.isActive ? <PowerOff /> : <Power />}
              {account.isActive ? "تعطيل الحساب" : "تفعيل الحساب"}
            </Button>
            {role === "TEACHER" && (
              <Button size="sm" variant="outline" onClick={() => setConfirm("admin")}>
                <ShieldCheck />
                {isAdmin ? "سحب صلاحيات الإدارة" : "منح صلاحيات الإدارة"}
              </Button>
            )}
          </div>
        </div>
      )}

      {dialog && (
        <PasswordDialog
          key={dialog.key}
          kind={dialog.kind}
          personId={personId}
          account={account}
          role={role}
          onClose={() => setDialog(null)}
        />
      )}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={
          confirm === "deactivate" ? "تعطيل الحساب؟" : confirm === "activate" ? "تفعيل الحساب؟" : isAdmin ? "سحب صلاحيات الإدارة؟" : "منح صلاحيات الإدارة؟"
        }
        description={
          confirm === "deactivate"
            ? "لن يتمكن صاحبه من الدخول، وتُغلق كل جلساته فورًا."
            : confirm === "activate"
              ? "يمكن لصاحبه الدخول من جديد."
              : "يُطبَّق التغيير عند الطلب التالي لصاحب الحساب."
        }
        confirmLabel="تأكيد"
        destructive={confirm === "deactivate"}
        onConfirm={async () => {
          if (!confirm) return
          await toggle.mutateAsync(confirm)
          setConfirm(null)
          toast.success("تم تحديث الحساب")
        }}
      />
    </SectionCard>
  )
}

function PasswordDialog({
  kind,
  personId,
  account,
  role,
  onClose,
}: {
  kind: "create" | "reset"
  personId: string
  account: AccountSummary | null
  role: Extract<Role, "TEACHER" | "STUDENT">
  onClose: () => void
}) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState(temporaryPassword)
  const [submitted, setSubmitted] = useState(false)
  const save = useApiMutation(
    () =>
      kind === "create"
        ? api("/admin/accounts", { method: "POST", body: { username, temporaryPassword: password, roles: [role], personId } })
        : api(`/admin/accounts/${account!.id}/reset-password`, { method: "POST", body: { temporaryPassword: password } }),
    accountKeys
  )
  const errors = { username: kind === "create" ? usernameError(username) : undefined, password: passwordPolicyError(password) }

  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            setSubmitted(true)
            if (save.isPending || errors.username || errors.password) return
            save.mutate(undefined, {
              onSuccess: () => {
                onClose()
                toast.success(kind === "create" ? "تم إنشاء الحساب" : "تم تعيين كلمة مرور مؤقتة", {
                  description: "سلّم كلمة المرور المؤقتة لصاحب الحساب؛ سيُطلب منه تغييرها عند أول دخول.",
                })
              },
            })
          }}
        >
          <DialogHeader>
            <DialogTitle>{kind === "create" ? "إنشاء حساب دخول" : "كلمة مرور مؤقتة جديدة"}</DialogTitle>
            <DialogDescription>
              {kind === "create"
                ? `حساب ${labels.role[role]} — يُطلب تغيير كلمة المرور عند أول دخول.`
                : "تُغلق كل جلسات الحساب، ويُطلب تغيير كلمة المرور عند الدخول التالي."}
            </DialogDescription>
          </DialogHeader>
          {kind === "create" && (
            <div className="space-y-1.5">
              <Label htmlFor="account-username">اسم المستخدم</Label>
              <Input id="account-username" dir="ltr" autoComplete="off" value={username}
                onChange={(e) => setUsername(e.target.value.trim().toLowerCase())} aria-invalid={(submitted && !!errors.username) || undefined} />
              {submitted && errors.username && <p className="text-xs text-destructive">{errors.username}</p>}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="account-password">كلمة المرور المؤقتة</Label>
            <div className="flex gap-2">
              <Input id="account-password" dir="ltr" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)}
                aria-invalid={(submitted && !!errors.password) || undefined} />
              <Button type="button" variant="outline" onClick={() => setPassword(temporaryPassword())}>توليد</Button>
            </div>
            {submitted && errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
          </div>
          {save.isError && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorMessage(save.error)}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>{labels.common.cancel}</Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />}
              {kind === "create" ? "إنشاء الحساب" : "حفظ"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
