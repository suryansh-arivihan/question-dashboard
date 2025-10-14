"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { Loader2, CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";
import { GenerationQueueEntry } from "@/types";
import { toast } from "sonner";

interface PipelineHistoryModalProps {
  open: boolean;
  onClose: () => void;
  topicId: string;
  topicDisplayName: string;
}

export function PipelineHistoryModal({
  open,
  onClose,
  topicId,
  topicDisplayName,
}: PipelineHistoryModalProps) {
  const [entries, setEntries] = useState<GenerationQueueEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open && topicId) {
      fetchHistory();
    }
  }, [open, topicId]);

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/admin/pipeline-history?topicId=${encodeURIComponent(topicId)}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch pipeline history");
      }

      const data = await response.json();
      setEntries(data.entries || []);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to fetch pipeline history"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return (
          <Badge variant="default" className="bg-green-500 hover:bg-green-600">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        );
      case "FAILED":
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      case "IN_PROGRESS":
        return (
          <Badge variant="default" className="bg-blue-500 hover:bg-blue-600">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            In Progress
          </Badge>
        );
      case "QUEUED":
        return (
          <Badge variant="secondary">
            <Clock className="h-3 w-3 mr-1" />
            Queued
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getLevelStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return (
          <Badge variant="default" className="bg-green-500 hover:bg-green-600 text-xs">
            Completed
          </Badge>
        );
      case "FAILED":
        return (
          <Badge variant="destructive" className="text-xs">
            Failed
          </Badge>
        );
      case "SKIPPED":
        return (
          <Badge variant="secondary" className="text-xs">
            Skipped
          </Badge>
        );
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDuration = (createdAt: number, updatedAt: number) => {
    const durationMs = updatedAt - createdAt;
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="text-xl">
            Pipeline History - {topicDisplayName}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <AlertCircle className="h-12 w-12 mb-4" />
            <p>No pipeline history found for this topic.</p>
          </div>
        ) : (
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-4">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="border rounded-lg p-4 space-y-3 hover:bg-accent/50 transition-colors"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {getStatusBadge(entry.status)}
                        <span className="text-sm text-muted-foreground">
                          {formatDate(entry.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Triggered by: {entry.triggered_by}
                      </p>
                      {entry.status === "COMPLETED" && (
                        <p className="text-xs text-muted-foreground">
                          Duration: {formatDuration(entry.createdAt, entry.updatedAt)}
                        </p>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      ID: {entry.id.slice(0, 8)}...
                    </div>
                  </div>

                  {/* Level Summary */}
                  {entry.summary && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Level Details:</p>
                      <div className="flex flex-col gap-2">
                        {Object.entries(entry.summary).map(([levelKey, levelData]) => (
                          <div
                            key={levelKey}
                            className="border rounded p-3 space-y-2 bg-card"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">
                                Level {levelData.level}
                              </span>
                              {getLevelStatusBadge(levelData.status)}
                            </div>
                            <div className="text-xs space-y-1">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Existing:</span>
                                <span>{levelData.existing_count}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Needed:</span>
                                <span>{levelData.needed_count}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Generated:</span>
                                <span className="font-medium">
                                  {levelData.generated_count}
                                </span>
                              </div>
                            </div>
                            {levelData.reason && (
                              <p className="text-xs text-muted-foreground italic">
                                {levelData.reason}
                              </p>
                            )}
                            {levelData.error && (
                              <p className="text-xs text-destructive">
                                Error: {levelData.error}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
