import { redirect } from "next/navigation"

import { getCurrentUser, homeOf } from "@/lib/auth/current-user"

/** The public website comes in a later phase; for now the root opens the user's workspace. */
export default async function Home() {
  redirect(homeOf(await getCurrentUser()))
}
