import { WorkspaceGate } from "@/components/auth/workspace-gate"

export default function Layout({ children }: LayoutProps<"/student">) {
  return <WorkspaceGate workspace="student">{children}</WorkspaceGate>
}
