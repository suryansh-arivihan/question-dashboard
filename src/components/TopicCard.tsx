"use client";

import { useState } from "react";
import { Rocket, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "./ui/card";
import { StatusBadge } from "./StatusBadge";
import { Button } from "./ui/button";
import { toast } from "sonner";

interface TopicCardProps {
  topic: string;
  displayName: string;
  total: number;
  verified: number;
  pending: number;
  inProgress: number;
  subject: string;
  chapter: string;
  onReadyToGo: () => void;
  verifiedLevel1?: number;
  verifiedLevel2?: number;
  verifiedLevel3?: number;
}

export function TopicCard({
  displayName,
  total,
  verified,
  pending,
  inProgress,
  subject,
  chapter,
  topic,
  onReadyToGo,
  verifiedLevel1 = 0,
  verifiedLevel2 = 0,
  verifiedLevel3 = 0,
}: TopicCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isQueued, setIsQueued] = useState(false);

  const handleReadyToGo = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/ready-to-go", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subject,
          chapter,
          topic,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to queue topic");
      }

      setIsQueued(true);
      toast.success("Topic queued for generation successfully!");
      onReadyToGo();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to queue topic"
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="transition-all hover:shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl">{displayName}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          <StatusBadge label="Level 1" count={verifiedLevel1} variant="verified" />
          <StatusBadge label="Level 2" count={verifiedLevel2} variant="verified" />
          <StatusBadge label="Level 3" count={verifiedLevel3} variant="verified" />
        </div>
      </CardContent>
      <CardFooter>
        <Button
          variant="success"
          onClick={handleReadyToGo}
          disabled={isLoading || isQueued}
          className="w-full"
        >
          {isQueued ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Queued
            </>
          ) : (
            <>
              <Rocket className="h-4 w-4" />
              {isLoading ? "Queueing..." : "Ready to Go"}
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
