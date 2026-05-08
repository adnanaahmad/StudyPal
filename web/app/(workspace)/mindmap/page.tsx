"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CopilotSidebar } from "@copilotkit/react-ui";
import { Brain, Copy, GitBranch, Sparkles } from "lucide-react";
import { useCopilotSidebarSessionKey } from "@/hooks/useClearCopilotChatOnUnmount";
import { MindmapToolbar } from "./components/MindmapToolbar";
import { useMindmapState } from "./hooks/useMindmapState";
import { useMindmapAgent } from "./hooks/useMindmapAgent";

const MindmapCanvas = dynamic(
  () => import("./components/MindmapCanvas").then((m) => m.MindmapCanvas),
  { ssr: false },
);

export default function MindmapPage() {
  const { t } = useTranslation();
  const api = useMindmapState();
  useMindmapAgent(api);
  const copilotSidebarKey = useCopilotSidebarSessionKey();
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);

  const isEmpty = !api.state.rootId;
  const starterPrompts = [
    "Build a concept map about linear algebra",
    "Create a mindmap for World War II with key fronts and events",
    "Map the core topics of calculus for exam prep",
  ];

  const handleCopyPrompt = async (prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedPrompt(prompt);
      setTimeout(() => setCopiedPrompt(null), 1200);
    } catch {
      // Clipboard can fail in restricted contexts; silently ignore.
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--background)]">
      <MindmapToolbar markdown={api.markdown} onNew={api.reset} saveStatus="idle" />

      <div className="relative flex flex-1 overflow-hidden">
        <MindmapCanvas markdown={api.markdown} />

        {isEmpty && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
            <div className="pointer-events-auto w-full max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--card)]/95 p-6 backdrop-blur-sm">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--secondary)] text-[var(--primary)]">
                  <Brain size={22} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
                    {t("Mindmap Workspace")}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    {t("Turn any topic into a visual learning map. Open AI Tutor from the chat button, then expand branches step by step.")}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
                  <GitBranch size={15} className="mb-1 text-[var(--primary)]" />
                  <p className="text-xs font-medium text-[var(--foreground)]">{t("Build Branches")}</p>
                  <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">{t("Create clear topic trees from a root idea.")}</p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
                  <Sparkles size={15} className="mb-1 text-[var(--primary)]" />
                  <p className="text-xs font-medium text-[var(--foreground)]">{t("Learn Actively")}</p>
                  <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">{t("Mark weak and known nodes as you study.")}</p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
                  <Brain size={15} className="mb-1 text-[var(--primary)]" />
                  <p className="text-xs font-medium text-[var(--foreground)]">{t("Quiz by Node")}</p>
                  <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">{t("Ask the tutor to test any branch instantly.")}</p>
                </div>
              </div>

              <div className="mt-5">
                <p className="mb-2 text-xs font-medium text-[var(--muted-foreground)]">
                  {t("Suggested prompts (copy to chat)")}
                </p>
                <div className="space-y-2">
                  {starterPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => void handleCopyPrompt(prompt)}
                      className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-left text-xs text-[var(--foreground)] transition-colors hover:bg-[var(--secondary)]"
                    >
                      <span>{prompt}</span>
                      <span className="ml-3 inline-flex items-center gap-1 text-[10px] text-[var(--muted-foreground)]">
                        <Copy size={12} />
                        {copiedPrompt === prompt ? t("Copied") : t("Copy")}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mindmap-chat-clean">
          <CopilotSidebar
            key={copilotSidebarKey}
            defaultOpen={false}
            clickOutsideToClose={false}
            labels={{
              title: '',
              initial: t("Hi! Tell me a topic and I'll start building a map for you."),
              placeholder: t("Ask me to build, expand, or quiz on any concept..."),
            }}
          />
        </div>
      </div>
      <style jsx global>{`
        .mindmap-chat-clean .copilotKitDevConsole,
        .mindmap-chat-clean .copilotKitHeaderControls > .copilotKitDevConsole {
          display: none !important;
        }

        .mindmap-chat-clean button[aria-label="Open Help"],
        .mindmap-chat-clean .copilotKitDebugMenuTriggerButton {
          display: none !important;
        }

        .mindmap-chat-clean .copilotKitHeaderControls {
          gap: 0 !important;
        }

        .mindmap-chat-clean .copilotKitHeaderControls .copilotKitHeaderCloseButton {
          margin-left: auto;
        }

        .mindmap-chat-clean .copilotKitHeader {
          border-bottom: none !important;
        }

        .mindmap-chat-clean a[href*="copilotkit"],
        .mindmap-chat-clean [data-testid="copilotkit-footer-branding"] {
          display: none !important;
        }
      `}</style>
    </div>
  );
}
