import * as React from "react";
import { cn } from "@/lib/utils";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};
export function Button({ className, variant = "primary", size = "md", ...props }: Props) {
  const variants = {
    primary: "bg-brand text-white hover:bg-brand-dark shadow-sm",
    secondary: "bg-white text-ink border border-line hover:bg-slate-50",
    ghost: "text-muted hover:bg-slate-100 hover:text-ink",
    danger: "bg-rose-600 text-white hover:bg-rose-700"
  };
  return <button className={cn("inline-flex items-center justify-center gap-2 rounded-xl font-medium transition disabled:cursor-not-allowed disabled:opacity-50", size === "sm" ? "px-3 py-2 text-xs" : "px-4 py-2.5 text-sm", variants[variant], className)} {...props} />;
}
