import type { ReactNode } from "react";

export const INPUT_CLS =
  "h-[30px] rounded-lg border border-border bg-background px-2.5 text-[12px] text-foreground outline-none transition-colors hover:border-primary/50 focus:border-primary placeholder:text-muted-foreground/60";

export function Field({
  label,
  width,
  children,
}: {
  label: string;
  width?: string;
  children: ReactNode;
}) {
  return (
    <label className={`flex min-w-0 flex-col ${width || ""}`}>
      <span className="mb-0.5 text-[10px] font-medium text-[var(--muted-foreground)]/60">
        {label}
      </span>
      {children}
    </label>
  );
}
