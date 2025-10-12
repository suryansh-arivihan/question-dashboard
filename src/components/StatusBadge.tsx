import { CheckCircle, Clock, RefreshCw, Hash } from "lucide-react";
import { Badge } from "./ui/badge";

interface StatusBadgeProps {
  label: string;
  count: number;
  variant: "verified" | "pending" | "in_progress" | "total";
}

const iconMap = {
  verified: CheckCircle,
  pending: Clock,
  in_progress: RefreshCw,
  total: Hash,
};

export function StatusBadge({ label, count, variant }: StatusBadgeProps) {
  const Icon = iconMap[variant];

  return (
    <Badge variant={variant} className="text-xs px-3 py-1 gap-1.5">
      <Icon className="h-3 w-3" />
      <span>
        {label}: <strong>{count}</strong>
      </span>
    </Badge>
  );
}
