import type { Metadata } from "next"

import { AdminDashboard } from "@/components/dashboard/admin-dashboard"

export const metadata: Metadata = { title: "لوحة القيادة" }

export default function DashboardPage() {
  return <AdminDashboard />
}
