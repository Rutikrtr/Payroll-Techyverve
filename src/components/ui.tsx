import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-wine-700 text-white hover:bg-wine-800 active:bg-wine-900 shadow-[inset_0_1px_0_rgba(255,255,255,.12)]",
  secondary: "bg-white text-ink border border-line hover:bg-canvas hover:border-ink-4",
  ghost: "text-ink-2 hover:bg-ink/5",
  danger: "bg-white text-bad border border-line hover:bg-red-50 hover:border-red-200",
};

export function Button({
  variant = "primary", size = "md", loading, icon, children, className, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors cursor-pointer select-none",
        "disabled:opacity-55 disabled:cursor-not-allowed whitespace-nowrap",
        size === "md" ? "h-10 px-4 text-[14px]" : "h-8 px-3 text-[13px]",
        variants[variant], className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button aria-label={label} title={label} {...rest}
      className={cx("inline-flex size-9 items-center justify-center rounded-lg text-ink-3 hover:bg-ink/5 hover:text-ink transition-colors cursor-pointer disabled:opacity-40", className)}>
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="label">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-[12px] text-bad">{error}</span>
        : hint ? <span className="mt-1 block text-[12px] text-ink-3">{hint}</span> : null}
    </label>
  );
}

export function Switch({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <div className="text-[14px] font-medium text-ink">{label}</div>
        {description && <div className="text-[13px] text-ink-3 mt-0.5">{description}</div>}
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
        className={cx("relative h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer", checked ? "bg-wine-700" : "bg-ink/15")}>
        <span className={cx("absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform", checked && "translate-x-5")} />
      </button>
    </div>
  );
}

const tones = {
  neutral: "bg-ink/[.06] text-ink-2",
  wine: "bg-wine-50 text-wine-700 ring-1 ring-wine-200/70",
  ok: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70",
  warn: "bg-amber-50 text-amber-800 ring-1 ring-amber-200/70",
  bad: "bg-rose-50 text-rose-700 ring-1 ring-rose-200/70",
  iris: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/70",
};
export type Tone = keyof typeof tones;
export function Badge({ tone = "neutral", children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap", tones[tone])}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
      <div>
        <h1 className="text-[26px] font-medium leading-tight tracking-[-0.02em]">{title}</h1>
        {subtitle && <p className="mt-1 text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, description, children, footer, wide }: {
  open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLElement>("input,select,textarea,button")?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title}
        className={cx("relative w-full bg-white sm:rounded-2xl rounded-t-2xl shadow-pop animate-pop flex flex-col max-h-[92vh]", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-line">
          <div>
            <h2 className="text-[18px] font-medium">{title}</h2>
            {description && <p className="text-[13px] text-ink-3 mt-0.5">{description}</p>}
          </div>
          <IconButton label="Close" onClick={onClose}><X className="size-4" /></IconButton>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-6 py-4 border-t border-line bg-[#fafaf9] sm:rounded-b-2xl">{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center py-14 px-6">
      <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-wine-50 text-wine-700">{icon}</div>
      <h3 className="text-[16px] font-medium">{title}</h3>
      <p className="mt-1 max-w-sm text-ink-3">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) { return <div className={cx("skeleton", className)} />; }

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string }[] }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line">
      {items.map((it) => (
        <button key={it.value} role="tab" aria-selected={value === it.value} onClick={() => onChange(it.value)}
          className={cx("relative h-10 px-3 text-[14px] font-medium whitespace-nowrap cursor-pointer transition-colors",
            value === it.value ? "text-wine-700" : "text-ink-3 hover:text-ink")}>
          {it.label}
          {value === it.value && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-wine-700" />}
        </button>
      ))}
    </div>
  );
}

/* ─────────── Toasts ─────────── */
type Toast = { id: number; kind: "ok" | "error"; text: string };
const ToastCtx = createContext<(kind: Toast["kind"], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setItems((t) => [...t, { id, kind, text }]);
    setTimeout(() => setItems((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div role="status" aria-live="polite" className="fixed bottom-4 right-4 left-4 sm:left-auto z-[60] flex flex-col gap-2 sm:w-96">
        {items.map((t) => (
          <div key={t.id} className="animate-pop flex items-start gap-3 rounded-xl bg-ink text-white px-4 py-3 shadow-pop text-[14px]">
            {t.kind === "ok" ? <CheckCircle2 className="size-5 shrink-0 text-emerald-300" aria-hidden /> : <AlertCircle className="size-5 shrink-0 text-rose-300" aria-hidden />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
