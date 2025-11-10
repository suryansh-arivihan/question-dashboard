"use client";

import { useState, useEffect, useRef } from "react";
import { Rocket, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "./ui/card";
import { StatusBadge } from "./StatusBadge";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Textarea } from "./ui/textarea";
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
  isAdmin?: boolean;
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
  isAdmin = false,
}: TopicCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [queueStatus, setQueueStatus] = useState<QueueStatusResponse | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [currentQueueId, setCurrentQueueId] = useState<string | null>(null);
  const [selectedLevels, setSelectedLevels] = useState<number[]>([]);
  const [userPrompts, setUserPrompts] = useState<Record<string, string>>({});
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

  const toggleLevel = (level: number) => {
    setSelectedLevels((prev) => {
      if (prev.includes(level)) {
        // Remove level and its prompt
        setUserPrompts((prompts) => {
          const newPrompts = { ...prompts };
          delete newPrompts[level.toString()];
          return newPrompts;
        });
        return prev.filter((l) => l !== level);
      }
      return [...prev, level].sort((a, b) => a - b);
    });
  };

  const updatePrompt = (level: number, prompt: string) => {
    setUserPrompts((prev) => ({
      ...prev,
      [level.toString()]: prompt,
    }));
  };

  const handleReadyToGo = async () => {
    if (selectedLevels.length === 0) {
      toast.error("Please select at least one level");
      return;
    }

    setShowConfirmDialog(false);
    setIsLoading(true);
    try {
      // Filter out empty prompts
      const filteredPrompts = Object.entries(userPrompts).reduce((acc, [level, prompt]) => {
        if (prompt.trim()) {
          acc[level] = prompt.trim();
        }
        return acc;
      }, {} as Record<string, string>);

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
          levels: selectedLevels,
          ...(Object.keys(filteredPrompts).length > 0 && { user_prompts: filteredPrompts }),
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
          {isAdmin && (
            <>
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
            </>
          )}
        </CardFooter>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] p-0 gap-0 flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
            <DialogTitle className="text-lg font-semibold">
              Trigger Generation Pipeline
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground mt-1">
              {displayName}
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
            {/* Level Selection Section */}
            <div>
              <h3 className="text-sm font-medium text-foreground mb-3">
                Select Difficulty Levels
              </h3>
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((level) => {
                  const isSelected = selectedLevels.includes(level);
                  return (
                    <div key={level} className="rounded-lg border bg-card transition-all">
                      <button
                        type="button"
                        onClick={() => toggleLevel(level)}
                        className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-foreground">
                            Level {level}
                          </span>
                        </div>
                        <div
                          className={`
                            flex items-center justify-center w-5 h-5 rounded-full border-2 transition-all
                            ${
                              isSelected
                                ? "bg-primary border-primary"
                                : "border-muted-foreground/30"
                            }
                          `}
                        >
                          {isSelected && (
                            <CheckCircle2 className="h-3 w-3 text-primary-foreground" />
                          )}
                        </div>
                      </button>

                      {isSelected && (
                        <div className="px-4 pb-4 pt-2 space-y-2 border-t bg-muted/20">
                          <label htmlFor={`prompt-${level}`} className="text-xs text-muted-foreground">
                            Custom prompt for Level {level} (optional)
                          </label>
                          <Textarea
                            id={`prompt-${level}`}
                            placeholder={`e.g., "Focus on basic concepts with simple numerical values" or "Include real-world applications"`}
                            value={userPrompts[level.toString()] || ""}
                            onChange={(e) => updatePrompt(level, e.target.value)}
                            className="min-h-[80px]"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {selectedLevels.length === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Please select at least one level to continue
                </p>
              )}
            </div>

            {/* Info Section */}
            <div className="rounded-lg bg-muted/50 border p-4">
              <div className="flex items-start gap-3">
                <Clock className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    The pipeline will generate questions for the selected difficulty levels. This process may take several minutes to complete.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 py-6 flex-row gap-2 flex-shrink-0 border-t">
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
              disabled={isLoading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleReadyToGo}
              disabled={isLoading || selectedLevels.length === 0}
              className="flex-1"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Queueing...
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4 mr-2" />
                  Trigger Pipeline
                </>
              )}
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
