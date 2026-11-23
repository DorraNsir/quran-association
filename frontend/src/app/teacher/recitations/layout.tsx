import { WorkFollowupProvider } from "@/components/teacher/work-followup/work-followup-provider"

/** «متابعة العرضات» adds recitations through the Work Program form (the same sheets / dialogs). */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <WorkFollowupProvider>{children}</WorkFollowupProvider>
}
