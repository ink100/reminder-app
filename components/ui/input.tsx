import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-11 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-base text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:border-slate-400 md:min-h-0 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}
