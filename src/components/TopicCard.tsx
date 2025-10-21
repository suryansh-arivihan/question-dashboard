"use client";

import { useState, useEffect, useRef } from "react";
import { Rocket, CheckCircle2, AlertTriangle, Clock, Loader2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "./ui/card";
import { StatusBadge } from "./StatusBadge";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { toast } from "sonner";
import { PipelineHistoryModal } from "./PipelineHistoryModal";
import { QueueStatusResponse } from "@/types";

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
  const [queueStatus, setQueueStatus] = useState<QueueStatusResponse | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [currentQueueId, setCurrentQueueId] = useState<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Start/stop polling based on modal visibility
  useEffect(() => {
    if (showHistoryModal && currentQueueId) {
      startPolling(currentQueueId);
    } else {
      stopPolling();
    }
  }, [showHistoryModal, currentQueueId]);

  // Poll queue status
  const pollQueueStatus = async (queueId: string) => {
    try {
      const response = await fetch(`/api/admin/queue-status/${queueId}`);

      if (!response.ok) {
        if (response.status === 404) {
          // Queue entry not found, stop polling
          stopPolling();
          return;
        }
        throw new Error("Failed to fetch queue status");
      }

      const status: QueueStatusResponse = await response.json();
      setQueueStatus(status);

      // Stop polling if terminal state reached
      if (["COMPLETED", "FAILED", "CANCELLED"].includes(status.status)) {
        stopPolling();
        if (status.status === "COMPLETED") {
          toast.success("Question generation completed!");
          onReadyToGo();
        } else if (status.status === "FAILED") {
          toast.error("Question generation failed");
        }
      }
    } catch (error) {
      console.error("Error polling queue status:", error);
    }
  };

  const startPolling = (queueId: string) => {
    // Clear any existing interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    // Poll immediately
    pollQueueStatus(queueId);

    // Then poll every 10 seconds
    pollIntervalRef.current = setInterval(() => {
      pollQueueStatus(queueId);
    }, 10000);
  };

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

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

      const queueId = data.queueId || data.queue_id;
      setCurrentQueueId(queueId);

      // Show queue position if available
      if (data.position !== undefined) {
        toast.success(`Queued at position ${data.position} (${data.queue_size} total)`);
      } else {
        toast.success("Topic queued for generation successfully!");
      }

      onReadyToGo();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to queue topic"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelQueue = async () => {
    if (!currentQueueId) return;

    try {
      const response = await fetch(`/api/admin/queue-cancel/${currentQueueId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to cancel queue entry");
      }

      stopPolling();
      setQueueStatus(null);
      setCurrentQueueId(null);
      toast.success("Queue entry cancelled successfully");
      onReadyToGo();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to cancel queue entry"
      );
    }
  };

  const isQueued = queueStatus?.status === "QUEUED";
  const isInProgress = queueStatus?.status === "IN_PROGRESS";
  const isCompleted = queueStatus?.status === "COMPLETED";
  const isFailed = queueStatus?.status === "FAILED";
  const isActive = isQueued || isInProgress;

  return (
    <>
      <Card className="transition-all hover:shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl">{displayName}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <StatusBadge label="Level 1" count={verifiedLevel1} variant="verified" />
              <StatusBadge label="Level 2" count={verifiedLevel2} variant="verified" />
              <StatusBadge label="Level 3" count={verifiedLevel3} variant="verified" />
            </div>

            {/* Queue Status Display */}
            {queueStatus && (
              <div className="border rounded-lg p-3 bg-muted/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {isQueued && "Queued"}
                    {isInProgress && "Processing"}
                    {isCompleted && "Completed"}
                    {isFailed && "Failed"}
                  </span>
                  {isQueued && queueStatus.position !== undefined && (
                    <span className="text-xs text-muted-foreground">
                      Position: {queueStatus.position}
                    </span>
                  )}
                </div>

                {queueStatus.estimated_wait_seconds !== undefined && (
                  <div className="text-xs text-muted-foreground">
                    Est. wait: {Math.ceil(queueStatus.estimated_wait_seconds / 60)} min
                  </div>
                )}

                {isCompleted && queueStatus.summary?.total_generated !== undefined && (
                  <div className="text-xs text-green-600">
                    Generated {queueStatus.summary.total_generated} questions
                  </div>
                )}

                {isFailed && queueStatus.error && (
                  <div className="text-xs text-destructive">
                    Error: {queueStatus.error}
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button
            variant="success"
            onClick={() => setShowConfirmDialog(true)}
            disabled={isLoading || isActive}
            className="flex-1"
          >
            {isQueued ? (
              <>
                <Clock className="h-4 w-4" />
                Queued
              </>
            ) : isInProgress ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing
              </>
            ) : isCompleted ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Completed
              </>
            ) : isFailed ? (
              <>
                <XCircle className="h-4 w-4" />
                Failed
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4" />
                {isLoading ? "Queueing..." : "Ready to Go"}
              </>
            )}
          </Button>

          {/* Cancel button - only show when queued */}
          {isQueued && (
            <Button
              variant="destructive"
              onClick={handleCancelQueue}
              className="px-3"
              title="Cancel Queue Entry"
            >
              <XCircle className="h-4 w-4" />
            </Button>
          )}

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
