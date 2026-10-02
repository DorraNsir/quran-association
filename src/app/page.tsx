import { redirect } from "next/navigation"

/** The public website comes in a later phase; for now the root opens the admin. */
export default function Home() {
  redirect("/admin")
}
