"use client";

import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { StatusBadge } from "./StatusBadge";

interface ChapterCardProps {
  chapter: string;
  displayName: string;
  total: number;
  verified: number;
  pending: number;
  inProgress: number;
  onClick: () => void;
}

export function ChapterCard({
  displayName,
  total,
  verified,
  pending,
  inProgress,
  onClick,
}: ChapterCardProps) {
  return (
    <Card
      className="cursor-pointer transition-all hover:scale-105 hover:shadow-lg"
      onClick={onClick}
    >
      <CardHeader>
        <CardTitle className="text-xl">{displayName}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          <StatusBadge label="Total" count={total} variant="total" />
          <StatusBadge label="Verified" count={verified} variant="verified" />
          <StatusBadge label="Pending" count={pending} variant="pending" />
          <StatusBadge
            label="In Progress"
            count={inProgress}
            variant="in_progress"
          />
        </div>
      </CardContent>
    </Card>
  );
}
