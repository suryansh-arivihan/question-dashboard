"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { Button } from "./ui/button";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Download,
  Plus,
  FileSpreadsheet,
  Calendar,
  User,
  Timer,
  PlayCircle,
} from "lucide-react";
import { TestGenerationQueueEntry } from "@/types";
import { toast } from "sonner";

interface TestHistoryModalProps {
  open: boolean;
  onClose: () => void;
  subject: string;
  chapter: string;
  chapterDisplayName: string;
  onCreateTest: () => void;
}

export function TestHistoryModal({
  open,
  onClose,
  subject,
  chapter,
  chapterDisplayName,
  onCreateTest,
}: TestHistoryModalProps) {
  const [entries, setEntries] = useState<TestGenerationQueueEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchHistory = useCallback(async () => {
    try {
      setIsRefreshing(true);
      const response = await fetch(
        `/api/test/history?subject=${encodeURIComponent(subject)}&chapter=${encodeURIComponent(chapter)}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch test history");
      }

      const data = await response.json();
      setEntries(data.entries || []);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to fetch test history"
      );
    } finally {
      setIsRefreshing(false);
    }
  }, [subject, chapter]);

  useEffect(() => {
    if (open && subject && chapter) {
      setIsLoading(true);
      fetchHistory().finally(() => setIsLoading(false));

      intervalRef.current = setInterval(() => {
        fetchHistory();
      }, 10000);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }
  }, [open, subject, chapter, fetchHistory]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return (
          <Badge variant="default" className="bg-green-500 hover:bg-green-600">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            Completed
          </Badge>
        );
      case "FAILED":
        return (
          <Badge variant="destructive">
            <XCircle className="h-3.5 w-3.5 mr-1.5" />
            Failed
          </Badge>
        );
      case "IN_PROGRESS":
        return (
          <Badge variant="default" className="bg-blue-500 hover:bg-blue-600">
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            In Progress
          </Badge>
        );
      case "QUEUED":
        return (
          <Badge variant="secondary">
            <Clock className="h-3.5 w-3.5 mr-1.5" />
            Queued
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDuration = (createdAt: number, updatedAt: number) => {
    const durationMs = updatedAt - createdAt;
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);

    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const handleDownload = async (entry: TestGenerationQueueEntry) => {
    if (!entry.s3_file_url) {
      toast.error("Download URL not available");
      return;
    }

    try {
      window.open(entry.s3_file_url, "_blank");
      toast.success("Download started");
    } catch (error) {
      toast.error("Failed to download file");
    }
  };

  const handleProcessNow = async (entry: TestGenerationQueueEntry) => {
    try {
      toast.info("Triggering test generation...");

      const response = await fetch("/api/test/process-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId: entry.id }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || error.details || "Failed to process test");
      }

      toast.success("Test generation started!");
      fetchHistory();
    } catch (error) {
      console.error("Error processing test:", error);
      toast.error(error instanceof Error ? error.message : "Failed to process test");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl font-semibold">
                Test Generator
              </DialogTitle>
              <p className="text-sm text-muted-foreground font-medium mt-0.5">
                {chapterDisplayName}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchHistory}
                disabled={isLoading}
                className="h-9"
                title="Refresh (Auto-refreshes every 10s)"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
                />
              </Button>
              <Button
                size="sm"
                onClick={onCreateTest}
                className="h-9"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create New Test
              </Button>
            </div>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">Loading test history...</p>
            </div>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-6">
              <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No tests generated yet</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">
              Click "Create New Test" to generate your first Excel test file for this chapter
            </p>
            <Button onClick={onCreateTest}>
              <Plus className="h-4 w-4 mr-2" />
              Create New Test
            </Button>
          </div>
        ) : (
          <ScrollArea className="h-[calc(90vh-120px)]">
            <div className="p-6 space-y-3">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="group relative rounded-lg border bg-card hover:shadow-md transition-all duration-200 overflow-hidden"
                >
                  {/* Status stripe at top */}
                  <div
                    className={`h-1 ${
                      entry.status === "COMPLETED"
                        ? "bg-green-500"
                        : entry.status === "FAILED"
                        ? "bg-red-500"
                        : entry.status === "IN_PROGRESS"
                        ? "bg-blue-500"
                        : "bg-yellow-500"
                    }`}
                  />

                  <div className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      {/* Left side: Status and info */}
                      <div className="flex-1 min-w-0 space-y-2.5">
                        {/* Top row: Badge and test info */}
                        <div className="flex items-center gap-3 flex-wrap">
                          {getStatusBadge(entry.status)}
                          <span className="text-sm font-semibold text-foreground">
                            {entry.numTests} {entry.numTests === 1 ? "Test" : "Tests"}
                            {entry.status === "COMPLETED" && " • 45 questions each"}
                          </span>
                        </div>

                        {/* Bottom row: Metadata */}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                            <span>{formatDate(entry.createdAt)}</span>
                          </div>

                          {entry.status === "COMPLETED" && (
                            <div className="flex items-center gap-1.5">
                              <Timer className="h-3.5 w-3.5 flex-shrink-0" />
                              <span>{formatDuration(entry.createdAt, entry.updatedAt)}</span>
                            </div>
                          )}

                          <div className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="truncate max-w-[200px]">{entry.triggered_by}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right side: Action button */}
                      <div className="flex-shrink-0">
                        {entry.status === "COMPLETED" && entry.s3_file_url && (
                          <Button
                            size="sm"
                            onClick={() => handleDownload(entry)}
                            className="bg-emerald-600 hover:bg-emerald-700"
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </Button>
                        )}
                        {(entry.status === "QUEUED" || entry.status === "FAILED") && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleProcessNow(entry)}
                          >
                            <PlayCircle className="h-4 w-4 mr-2" />
                            Process
                          </Button>
                        )}
                        {entry.status === "IN_PROGRESS" && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="whitespace-nowrap">Processing...</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Error message - full width below if exists */}
                    {entry.error && (
                      <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/20">
                        <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-destructive mb-0.5">
                            Generation Failed
                          </p>
                          <p className="text-xs text-destructive/80">
                            {entry.error}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}