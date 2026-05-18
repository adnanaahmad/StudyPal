"use client";

import { TOOLS } from "@/lib/tools";
import { ToolCard } from "@/components/tools/ToolCard";
import { useTranslation } from "react-i18next";
import { LayoutGrid } from "lucide-react";

export default function ToolsHubPage() {
  const { t } = useTranslation();

  // Group tools by category for a structured layout if needed, 
  // but for 8 tools a single clean grid is usually better.

  return (
    <div suppressHydrationWarning className="flex h-full flex-col overflow-y-auto bg-[var(--background)] px-6 py-10 md:px-12">
      <div suppressHydrationWarning className="mx-auto w-full max-w-6xl">
        {/* Header Section */}
        <div suppressHydrationWarning className="mb-12 flex flex-col items-start gap-4">
          <div suppressHydrationWarning className="flex items-center gap-3 rounded-2xl bg-[var(--primary)]/10 px-4 py-2 text-[var(--primary)]">
            <LayoutGrid size={20} strokeWidth={2} />
            <span className="text-sm font-semibold uppercase tracking-wider">{t("Workshop")}</span>
          </div>

          <h1 className="text-[24px] font-semibold tracking-tight text-[var(--foreground)]">
            {t("Learning Tools")}
          </h1>

          <p className="max-w-2xl text-[17px] leading-relaxed text-[var(--muted-foreground)]">
            {t("Supercharge your studies with specialized AI utilities. From visualizing complex ideas to simulating exams, everything you need to master your subjects is right here.")}
          </p>
        </div>

        {/* Tools Grid */}
        <div suppressHydrationWarning className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {TOOLS.map((tool) => (
            <ToolCard
              key={tool.id}
              href={tool.href}
              label={tool.label}
              description={tool.description}
              icon={tool.icon}
              category={tool.category}
            />
          ))}
        </div>

        {/* Empty State / Footer Callout */}
        {/* <div className="mt-20 flex flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--border)] p-12 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--secondary)] text-[var(--muted-foreground)]">
            <LayoutGrid size={24} />
          </div>
          <h3 className="text-lg font-medium text-[var(--foreground)]">{t("More coming soon")}</h3>
          <p className="mt-2 text-[15px] text-[var(--muted-foreground)]">
            {t("We are constantly building new ways to help you learn faster and better.")}
          </p>
        </div> */}
      </div>
    </div>
  );
}
