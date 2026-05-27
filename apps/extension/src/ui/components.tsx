import React from "react";
import { X } from "lucide-react";

type Tone = "default" | "success" | "warning" | "danger" | "info";

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

const buttonVariants = {
  primary: "border-console-primary bg-console-primary text-white hover:border-console-primary-hover hover:bg-console-primary-hover",
  secondary: "border-console-border-strong bg-console-surface text-console-text hover:bg-console-raised",
  ghost: "border-transparent bg-transparent text-console-text hover:border-console-border hover:bg-console-raised",
  danger: "border-console-danger bg-console-danger text-white hover:border-[#9f2929] hover:bg-[#9f2929]"
};

const buttonSizes = {
  sm: "min-h-8 px-2 text-xs",
  md: "min-h-9 px-3 text-sm",
  icon: "h-9 min-h-9 w-9 px-0"
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  icon,
  fullWidth,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-console-sm border font-semibold transition-colors duration-150",
        buttonVariants[variant],
        buttonSizes[size],
        fullWidth && "w-full",
        className
      )}
    >
      {icon}
      {children}
    </button>
  );
}

interface PanelProps extends React.HTMLAttributes<HTMLElement> {
  as?: "section" | "aside" | "article";
  padded?: boolean;
}

export function Panel({ as = "section", padded = true, className, children, ...props }: PanelProps) {
  const Component = as;
  return (
    <Component
      {...props}
      className={cx(
        "min-w-0 rounded-console border border-console-border bg-console-surface",
        padded && "p-4",
        className
      )}
    >
      {children}
    </Component>
  );
}

const pillStyles: Record<Tone, string> = {
  default: "border-console-border bg-console-surface text-console-subtle",
  success: "border-[rgba(22,130,85,0.28)] bg-console-success-soft text-[#0b6740]",
  warning: "border-[rgba(166,101,0,0.28)] bg-console-warning-soft text-[#734900]",
  danger: "border-[rgba(184,50,50,0.28)] bg-console-danger-soft text-[#8f2222]",
  info: "border-[rgba(35,105,168,0.28)] bg-console-info-soft text-[#164f81]"
};

interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Pill({ tone = "default", className, children, ...props }: PillProps) {
  return (
    <span
      {...props}
      className={cx(
        "inline-flex min-h-[22px] items-center justify-center rounded-full border px-2 text-xs font-semibold whitespace-nowrap",
        pillStyles[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

const dotStyles: Record<Tone, string> = {
  default: "bg-console-subtle",
  success: "bg-console-success shadow-[0_0_0_4px_rgba(22,130,85,0.12)]",
  warning: "bg-console-warning shadow-[0_0_0_4px_rgba(166,101,0,0.12)]",
  danger: "bg-console-danger shadow-[0_0_0_4px_rgba(184,50,50,0.12)]",
  info: "bg-console-info shadow-[0_0_0_4px_rgba(35,105,168,0.12)]"
};

export function StatusDot({ tone = "default", className }: { tone?: Tone; className?: string }) {
  return <span className={cx("h-2 w-2 shrink-0 rounded-full", dotStyles[tone], className)} aria-hidden="true" />;
}

interface ToggleSwitchProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  checked: boolean;
  tone?: "primary" | "success" | "warning";
}

const switchCheckedStyles: Record<NonNullable<ToggleSwitchProps["tone"]>, string> = {
  primary: "bg-console-primary",
  success: "bg-console-success",
  warning: "bg-console-warning"
};

export function ToggleSwitch({ checked, tone = "primary", className, children, ...props }: ToggleSwitchProps) {
  return (
    <button
      {...props}
      type="button"
      role="switch"
      aria-checked={checked}
      className={cx(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition-colors duration-150 focus-visible:shadow-[0_0_0_2px_rgba(15,107,95,0.28)]",
        checked ? switchCheckedStyles[tone] : "bg-console-border-strong",
        className
      )}
    >
      <span
        className={cx(
          "absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-150",
          checked && "translate-x-4"
        )}
      />
      {children && <span className="sr-only">{children}</span>}
    </button>
  );
}

interface FieldProps {
  label: string;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function Field({ label, hint, className, children }: FieldProps) {
  return (
    <label className={cx("grid gap-1.5 text-sm font-semibold text-console-text", className)}>
      <span>{label}</span>
      {children}
      {hint && <small className="text-xs font-normal leading-5 text-console-subtle">{hint}</small>}
    </label>
  );
}

interface ModalShellProps {
  title: string;
  label?: string;
  className?: string;
  children: React.ReactNode;
  onClose?: () => void;
  closeLabel?: string;
}

export function ModalShell({ title, label, className, children, onClose, closeLabel = "关闭" }: ModalShellProps) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[rgba(12,20,25,0.34)] p-4"
      role="presentation"
      onClick={onClose}
    >
      <section
        className={cx(
          "max-h-[min(760px,calc(100vh-32px))] w-full max-w-2xl overflow-auto rounded-console border border-console-border-strong bg-console-surface shadow-console",
          className
        )}
        role="dialog"
        aria-modal="true"
        aria-label={label ?? title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-console-border bg-console-surface p-4">
          <h2 className="truncate text-base font-bold text-console-strong">{title}</h2>
          {onClose && (
            <Button type="button" variant="ghost" size="icon" aria-label={closeLabel} onClick={onClose}>
              <X size={17} aria-hidden="true" />
            </Button>
          )}
        </div>
        <div className="p-4">{children}</div>
      </section>
    </div>
  );
}

interface DrawerShellProps {
  title: string;
  label?: string;
  className?: string;
  children: React.ReactNode;
  onClose: () => void;
  closeLabel?: string;
}

export function DrawerShell({ title, label, className, children, onClose, closeLabel = "关闭详情" }: DrawerShellProps) {
  return (
    <div
      className="fixed inset-0 z-50 grid h-[100dvh] max-h-[100dvh] overflow-hidden bg-[rgba(12,20,25,0.34)] p-0 sm:justify-items-end"
      role="presentation"
      onClick={onClose}
    >
      <section
        className={cx(
          "grid h-[100dvh] max-h-[100dvh] min-h-0 w-full max-w-[820px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden border-l border-console-border-strong bg-console-surface shadow-console",
          className
        )}
        role="dialog"
        aria-modal="true"
        aria-label={label ?? title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-console-border bg-console-surface px-5 py-4">
          <h2 className="truncate text-base font-bold text-console-strong">{title}</h2>
          <Button type="button" variant="ghost" size="icon" aria-label={closeLabel} onClick={onClose}>
            <X size={17} aria-hidden="true" />
          </Button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5">{children}</div>
      </section>
    </div>
  );
}
