import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "verified" | "pending" | "in_progress" | "total" | "secondary" | "destructive" | "outline";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        {
          "border-transparent bg-gray-100 text-gray-800": variant === "default" || variant === "total" || variant === "secondary",
          "border-transparent bg-green-100 text-green-800": variant === "verified",
          "border-transparent bg-yellow-100 text-yellow-800": variant === "pending",
          "border-transparent bg-blue-100 text-blue-800": variant === "in_progress",
          "border-transparent bg-red-100 text-red-800": variant === "destructive",
          "border-gray-300 bg-transparent text-gray-800": variant === "outline",
        },
        className
      )}
      {...props}
    />
  );
}

export { Badge };
