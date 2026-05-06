import Link from "next/link";
import { type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ToolCardProps {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  category: string;
}

export function ToolCard({ href, label, description, icon: Icon, category }: ToolCardProps) {
  const { t } = useTranslation();

  return (
    <Link
      href={href}
      className="group relative flex flex-col items-start gap-4 rounded-2xl border border-[var(--border)]/40 bg-[var(--secondary)]/30 p-6 transition-all duration-300 hover:border-[var(--primary)]/40 hover:bg-[var(--secondary)]/50 hover:shadow-xl hover:shadow-primary/5"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--background)] text-[var(--primary)] shadow-sm transition-transform duration-300 group-hover:scale-110">
        <Icon size={24} strokeWidth={1.5} />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <h3 className="text-[17px] font-semibold text-[var(--foreground)]">{t(label)}</h3>
          <span className="rounded-full bg-[var(--primary)]/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--primary)] opacity-0 transition-opacity group-hover:opacity-100">
            {t(category)}
          </span>
        </div>
        <p className="text-[14px] leading-relaxed text-[var(--muted-foreground)] line-clamp-2">
          {t(description)}
        </p>
      </div>

      {/* Decorative arrow */}
      <div className="absolute bottom-6 right-6 translate-x-2 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="text-[var(--primary)]"
        >
          <path
            d="M3.33334 8H12.6667"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M8 3.33334L12.6667 8L8 12.6667"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </Link>
  );
}
