import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-[6px] px-2 py-0.5 text-[11px] font-medium transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default: "bg-[#E8E8E8] text-[#111111]",
        secondary: "bg-[#E8E8E8] text-[#111111]",
        destructive: "bg-[#E8E8E8] text-[#111111]",
        outline: "border border-[#D0D0D0] text-[#111111]",
        success: "bg-[#E8E8E8] text-[#111111]",
        danger: "bg-[#E8E8E8] text-[#111111]",
        warning: "bg-[#E8E8E8] text-[#111111]",
        purple: "bg-[#E8E8E8] text-[#111111]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
