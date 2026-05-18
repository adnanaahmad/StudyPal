import { CopilotKit } from "@copilotkit/react-core";
import "@copilotkit/react-ui/styles.css";
import WorkspaceSidebar from "@/components/sidebar/WorkspaceSidebar";
import { UnifiedChatProvider } from "@/context/UnifiedChatContext";

export default function WorkspaceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const showDevTools = process.env.NEXT_PUBLIC_SHOW_COPILOT_DEV_TOOLS === "true";

  return (
    <CopilotKit 
      runtimeUrl="/api/copilotkit"
      showDevConsole={showDevTools}
      enableInspector={showDevTools}
    >
      <UnifiedChatProvider>
        <div suppressHydrationWarning className="flex h-screen overflow-hidden">
          <WorkspaceSidebar />
          <main suppressHydrationWarning className="flex-1 overflow-hidden bg-[var(--background)]">{children}</main>
        </div>
      </UnifiedChatProvider>
    </CopilotKit>
  );
}
