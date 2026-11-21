import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { IconArrowRight, IconChevronLeft } from "./icons";

type Variant = "primary" | "dark" | "outline" | "soft" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-butter text-cocoa hover:bg-butter-deep",
  dark: "bg-cocoa text-paper hover:bg-ink",
  outline: "border-2 border-line bg-paper text-cocoa hover:border-butter-deep",
  soft: "bg-butter-soft text-cocoa hover:bg-butter",
  ghost: "text-muted hover:text-cocoa",
  danger: "bg-blush-deep text-paper hover:bg-blush-deep/90",
};

const buttonBase =
  "inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full px-6 text-[17px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40";

export const buttonClass = (variant: Variant = "primary", className = "") => `${buttonBase} ${variants[variant]} ${className}`;

export function Button({ variant = "primary", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={`${buttonBase} ${variants[variant]} ${className}`} {...props} />;
}

export function ButtonLink({ variant = "primary", className = "", ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={`${buttonBase} ${variants[variant]} ${className}`} {...props} />;
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <section className={`rounded-[var(--radius-card)] bg-paper p-5 shadow-[var(--shadow-soft)] ${className}`}>{children}</section>;
}

/** 상단 진행도 바 (온보딩) */
export function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className="h-full rounded-full bg-butter-deep transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function PageHeader({ title, back, right }: { title?: string; back?: string; right?: ReactNode }) {
  return (
    <header className="flex h-14 items-center gap-2 px-4">
      {back ? (
        <Link href={back} aria-label="뒤로" className="-ml-2 grid h-10 w-10 place-items-center rounded-full text-cocoa hover:bg-butter-soft">
          <IconChevronLeft className="h-6 w-6" />
        </Link>
      ) : null}
      {title ? <h1 className="text-[17px] font-bold text-cocoa">{title}</h1> : null}
      <div className="ml-auto">{right}</div>
    </header>
  );
}

export function ArrowBadge({ dark = false }: { dark?: boolean }) {
  return (
    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${dark ? "bg-cocoa text-butter" : "bg-butter text-cocoa"}`}>
      <IconArrowRight className="h-4 w-4" />
    </span>
  );
}

/** 하단 시트 모달 */
export function Sheet({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-cocoa/40" role="dialog" aria-modal="true" aria-label={label} onClick={onClose}>
      <div className="animate-rise w-full max-w-[440px] rounded-t-[2rem] bg-paper px-6 pt-3 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-line" />
        {children}
      </div>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-line/60 ${className}`} />;
}
