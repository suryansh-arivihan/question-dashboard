"use client";

import { useState } from "react";
import { Rocket, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "./ui/card";
import { StatusBadge } from "./StatusBadge";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { toast } from "sonner";
import { PipelineHistoryModal } from "./PipelineHistoryModal";

interface TopicCardProps {
  topic: string;
  topicId: string;
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
  topicId,
  onReadyToGo,
  verifiedLevel1 = 0,
  verifiedLevel2 = 0,
  verifiedLevel3 = 0,
}: TopicCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isQueued, setIsQueued] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const handleReadyToGo = async () => {
    setShowConfirmDialog(false);
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
          topicId,
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
    <>
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
        <CardFooter className="flex gap-2">
          <Button
            variant="success"
            onClick={() => setShowConfirmDialog(true)}
            disabled={isLoading || isQueued}
            className="flex-1"
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
          <Button
            variant="outline"
            onClick={() => setShowHistoryModal(true)}
            className="px-3"
            title="View Pipeline History"
          >
            <Clock className="h-4 w-4" />
          </Button>
        </CardFooter>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
              </div>
              <DialogTitle>Trigger Generation Pipeline?</DialogTitle>
            </div>
            <DialogDescription className="text-left mt-2">
              Are you sure you want to trigger the generation pipeline for{" "}
              <strong>{displayName}</strong>?
              <br />
              <br />
              This will queue the topic for question generation. The process may take some time to complete.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              variant="success"
              onClick={handleReadyToGo}
              disabled={isLoading}
            >
              {isLoading ? "Queueing..." : "Yes, Trigger Pipeline"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pipeline History Modal */}
      <PipelineHistoryModal
        open={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        topicId={topicId}
        topicDisplayName={displayName}
      />
    </>
  );
}
