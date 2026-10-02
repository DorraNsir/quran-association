import { AdminLayout } from "@/components/layout/admin-layout"
import { currentUser } from "@/lib/mock"

export default function Layout({ children }: LayoutProps<"/admin">) {
  return <AdminLayout user={currentUser}>{children}</AdminLayout>
}
