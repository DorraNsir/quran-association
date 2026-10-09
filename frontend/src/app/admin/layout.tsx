import { WorkspaceGate } from "@/components/auth/workspace-gate"

export default function Layout({ children }: LayoutProps<"/admin">) {
  return <WorkspaceGate workspace="admin">{children}</WorkspaceGate>
}
