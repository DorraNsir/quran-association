import { WorkspaceGate } from "@/components/auth/workspace-gate"

export default function Layout({ children }: LayoutProps<"/teacher">) {
  return <WorkspaceGate workspace="teacher">{children}</WorkspaceGate>
}
