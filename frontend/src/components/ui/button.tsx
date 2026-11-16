import * as React from "react";
import { cn } from "@/lib/utils";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
};
export function Button({ className, variant = "primary", size = "md", type = "button", ...props }: Props) {
  const variants = {
    primary: "bg-brand text-white hover:bg-brand-dark",
    secondary: "bg-white text-ink border border-line hover:bg-slate-50",
    ghost: "text-muted hover:bg-black/5 hover:text-ink",
    danger: "bg-rose-600 text-white hover:bg-rose-700"
  };
  // DESIGN.md §5: sm 32px, standard 36px, large 40px.
  const sizes = { sm: "min-h-8 px-3 text-xs", md: "min-h-9 px-3.5 text-sm", lg: "min-h-10 px-4 text-sm" };
  return <button type={type} className={cn("press inline-flex items-center justify-center gap-2 rounded-[7px] font-medium disabled:cursor-not-allowed disabled:opacity-50", sizes[size], variants[variant], className)} {...props} />;
}
