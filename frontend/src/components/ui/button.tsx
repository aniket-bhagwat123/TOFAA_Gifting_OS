import * as React from "react";
import { cn } from "@/lib/utils";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
};
export function Button({ className, variant = "primary", size = "md", type = "button", ...props }: Props) {
  const variants = {
    primary: "bg-brand text-white hover:bg-brand-dark shadow-sm",
    secondary: "bg-white text-ink border border-line hover:bg-slate-50",
    ghost: "text-muted hover:bg-black/5 hover:text-ink",
    danger: "bg-rose-600 text-white hover:bg-rose-700"
  };
  // Every size keeps a comfortable touch target (sm ≥ 40px, md ≥ 44px, lg ≥ 52px)
  const sizes = { sm: "min-h-10 px-3.5 text-sm", md: "min-h-11 px-5 text-[0.9375rem]", lg: "min-h-[3.25rem] px-6 text-base" };
  return <button type={type} className={cn("press inline-flex items-center justify-center gap-2 rounded-xl font-semibold disabled:cursor-not-allowed disabled:opacity-50", sizes[size], variants[variant], className)} {...props} />;
}
