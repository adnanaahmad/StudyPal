"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CopilotSidebar } from "@copilotkit/react-ui";
import { Copy, Layers, Sparkles, Target, Wand2 } from "lucide-react";
import { FlashcardCard } from "./components/FlashcardCard";
import { FlashcardsDeckList } from "./components/FlashcardsDeckList";
import { FlashcardsToolbar } from "./components/FlashcardsToolbar";
import { useCopilotSidebarSessionKey } from "@/hooks/useClearCopilotChatOnUnmount";
import { useFlashcardsAgent } from "./hooks/useFlashcardsAgent";
import { useFlashcardsState } from "./hooks/useFlashcardsState";

export default function FlashcardsPage() {
  const { t } = useTranslation();
  const api = useFlashcardsState();
  useFlashcardsAgent(api);
  const copilotSidebarKey = useCopilotSidebarSessionKey();
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);

  const isEmpty = api.state.cardOrder.length === 0;
  const activeCard = useMemo(
    () => (api.state.activeId ? api.state.cards[api.state.activeId] ?? null : null),
    [api.state.activeId, api.state.cards],
  );
  const activeIndex = useMemo(
    () => (api.state.activeId ? api.state.cardOrder.indexOf(api.state.activeId) : -1),
    [api.state.activeId, api.state.cardOrder],
  );

  const starterPrompts = [
    "Make 8 flashcards on photosynthesis for an AP Bio quiz",
    "Quiz me on the first 20 elements with cloze deletions",
    "Generate cards on the Spanish present tense — mix Q/A and cloze",
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
      <FlashcardsToolbar state={api.state} onReset={api.reset} />

      <div className="relative flex flex-1 overflow-hidden">
        {/* Left: deck strip — only visible when there's at least one card. */}
        {!isEmpty && (
          <aside className="hidden w-[260px] shrink-0 border-r border-[var(--border)] bg-[var(--secondary)]/30 md:block">
            <FlashcardsDeckList state={api.state} onSelect={(id) => api.focusCard({ id })} />
          </aside>
        )}

        {/* Center: card stage / empty state */}
        <div className="relative flex flex-1 items-center justify-center overflow-auto">
          {isEmpty ? (
            <div className="w-full max-w-2xl p-6">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)]/95 p-6 backdrop-blur-sm">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--secondary)] text-[var(--primary)]">
                    <Layers size={22} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
                      {t("Flashcards Workspace")}
                    </h2>
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                      {t(
                        "Tell the tutor a topic and an optional description. They'll build a deck you can flip through and self-grade.",
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
                    <Wand2 size={15} className="mb-1 text-[var(--primary)]" />
                    <p className="text-xs font-medium text-[var(--foreground)]">
                      {t("Generate Cards")}
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                      {t("Q/A and cloze deletions, with math + code support.")}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
                    <Sparkles size={15} className="mb-1 text-[var(--primary)]" />
                    <p className="text-xs font-medium text-[var(--foreground)]">
                      {t("Self-Grade")}
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                      {t("Flip with Space, mark Again or Knew it.")}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
                    <Target size={15} className="mb-1 text-[var(--primary)]" />
                    <p className="text-xs font-medium text-[var(--foreground)]">
                      {t("Refine on the Fly")}
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                      {t("Ask for harder cards, rewrites, or sub-topics.")}
                    </p>
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
          ) : activeCard ? (
            <FlashcardCard
              card={activeCard}
              index={activeIndex}
              total={api.state.cardOrder.length}
              flipped={api.state.flipped}
              onFlip={api.setFlipped}
              onGrade={api.gradeActive}
              onPrev={api.prev}
              onNext={api.next}
            />
          ) : null}
        </div>

        {/* Right: copilot sidebar — same chrome cleanup as mindmap. */}
        <div className="flashcards-chat-clean">
          <CopilotSidebar
            key={copilotSidebarKey}
            defaultOpen={false}
            clickOutsideToClose={true}
            labels={{
              title: "",
              initial: t(
                "Hi! Tell me a topic (and optional description) and I'll build a flashcard deck for you.",
              ),
              placeholder: t("Ask me to build, edit, or expand the deck..."),
            }}
          />
        </div>
      </div>

      <style jsx global>{`
        .flashcards-chat-clean .copilotKitDevConsole,
        .flashcards-chat-clean .copilotKitHeaderControls > .copilotKitDevConsole {
          display: none !important;
        }

        .flashcards-chat-clean button[aria-label="Open Help"],
        .flashcards-chat-clean .copilotKitDebugMenuTriggerButton {
          display: none !important;
        }

        .flashcards-chat-clean .copilotKitHeaderControls {
          gap: 0 !important;
        }

        .flashcards-chat-clean .copilotKitHeaderControls .copilotKitHeaderCloseButton {
          margin-left: auto;
        }

        .flashcards-chat-clean .copilotKitHeader {
          border-bottom: none !important;
        }

        .flashcards-chat-clean a[href*="copilotkit"],
        .flashcards-chat-clean [data-testid="copilotkit-footer-branding"] {
          display: none !important;
        }
      `}</style>
    </div>
  );
}
