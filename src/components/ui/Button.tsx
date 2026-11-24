import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition focus:outline-none focus:ring-4 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-ink px-4 py-2.5 text-white shadow-md shadow-ink/15 hover:bg-[#0c2145] focus:ring-ink/15",
        secondary: "border border-slate-200 bg-white px-4 py-2.5 text-slate-700 hover:border-slate-300 hover:bg-slate-50 focus:ring-slate-200",
        ghost: "px-3 py-2 text-slate-600 hover:bg-slate-100 hover:text-ink focus:ring-slate-200",
        danger: "bg-rose-600 px-4 py-2.5 text-white hover:bg-rose-700 focus:ring-rose-200",
      },
      size: { sm: "px-3 py-2 text-xs", md: "", lg: "px-5 py-3 text-base" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean; children: ReactNode };

export function Button({ className, variant, size, asChild, children, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props}>{children}</Comp>;
}
