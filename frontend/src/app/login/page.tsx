import { redirect } from "next/navigation"

import { getCurrentUser, homeOf } from "@/lib/auth/current-user"

/**
 * "تسجيل الدخول" from the public site. PROTOTYPE: there is no real login yet —
 * the mock account opens its own workspace (admin, teacher or student).
 */
export default async function LoginPage() {
  redirect(homeOf(await getCurrentUser()))
}
