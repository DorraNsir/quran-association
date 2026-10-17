import { WorkFollowupProvider } from "@/components/teacher/work-followup/work-followup-provider"

/**
 * PROTOTYPE: the list and the details pages share ONE mock state, kept by
 * this layout while the teacher moves between them (a refresh resets it).
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <WorkFollowupProvider>{children}</WorkFollowupProvider>
}
