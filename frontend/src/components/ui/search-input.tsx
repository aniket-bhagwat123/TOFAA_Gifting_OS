import { Search } from "lucide-react";
import { control } from "@/components/ui/table-styles";
import { cn } from "@/lib/utils";

/** The one search box used above every list: 40px tall, magnifier on the left. */
export function SearchInput({ value, onChange, placeholder, label, className }: {
  value: string; onChange: (value: string) => void; placeholder: string; label?: string; className?: string;
}) {
  return <div className={cn("relative min-w-[14rem] flex-1 sm:w-72 sm:flex-none", className)}>
    <Search size={16} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
    <input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={label ?? placeholder} className={cn(control, "w-full pl-9")} />
  </div>;
}
