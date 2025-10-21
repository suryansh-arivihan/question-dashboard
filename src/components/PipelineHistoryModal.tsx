"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { Button } from "./ui/button";
import { Loader2, CheckCircle2, XCircle, Clock, AlertCircle, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const toggleEntry = (entryId: string) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  };

  const fetchHistory = useCallback(async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) {
      setIsRefreshing(true);
    } else if (entries.length === 0) {
      // Only show loading spinner on initial load
      setIsLoading(true);
    }

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
      setIsRefreshing(false);
    }
  }, [topicId, entries.length]);

  const handleManualRefresh = () => {
    fetchHistory(true);
  };

  useEffect(() => {
    if (open && topicId) {
      // Initial fetch
      fetchHistory();

      // Set up auto-refresh interval
      intervalRef.current = setInterval(() => {
        fetchHistory();
      }, 5000); // Refresh every 5 seconds

      return () => {
        // Clean up interval when modal closes
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    } else {
      // Clear interval if modal is closed
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [open, topicId, fetchHistory]);

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

  const hasActiveEntries = entries.some(
    (e) => e.status === "IN_PROGRESS" || e.status === "QUEUED"
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-semibold">
              Pipeline History - {topicDisplayName}
            </DialogTitle>
            <div className="flex items-center gap-2">
              {hasActiveEntries && (
                <Badge variant="secondary" className="text-xs">
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Auto-refreshing
                </Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="h-8"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <AlertCircle className="h-12 w-12 mb-4" />
            <p>No pipeline history found for this topic.</p>
          </div>
        ) : (
          <ScrollArea className="h-[calc(85vh-120px)]">
            <div className="p-6 space-y-3">
              {entries.map((entry) => {
                const isExpanded = expandedEntries.has(entry.id);
                return (
                  <div
                    key={entry.id}
                    className="border rounded-lg overflow-hidden"
                  >
                    {/* Header - Clickable */}
                    <div
                      className="p-5 cursor-pointer hover:bg-muted/20 transition-all duration-200"
                      onClick={() => toggleEntry(entry.id)}
                    >
                      {/* Main row */}
                      <div className="flex items-start gap-6">
                        {/* Left: Status badge with generated count */}
                        <div className="flex-shrink-0 flex flex-col items-center gap-2">
                          {getStatusBadge(entry.status)}
                          {entry.summary?.total_generated !== undefined && (
                            <div className="text-center">
                              <div className="text-2xl font-bold text-green-600 leading-none">
                                {entry.summary.total_generated}
                              </div>
                              <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium mt-0.5">
                                Generated
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Center: Date and duration */}
                        <div className="flex-1 min-w-0">
                          {/* Date */}
                          <div className="text-sm font-semibold text-foreground mb-1">
                            {formatDate(entry.createdAt)}
                          </div>

                          {/* Duration */}
                          {entry.status === "COMPLETED" && (
                            <div className="text-xs text-muted-foreground">
                              <span className="font-medium">Duration:</span> {formatDuration(entry.createdAt, entry.updatedAt)}
                            </div>
                          )}
                        </div>

                        {/* Far right: Expand indicator */}
                        <div className="flex-shrink-0 flex flex-col items-center gap-1.5 w-12">
                          {isExpanded ? (
                            <ChevronUp className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          )}
                          <span className="text-[9px] text-muted-foreground/50 font-mono">
                            {entry.id.slice(0, 6)}
                          </span>
                        </div>
                      </div>

                      {/* Triggered by - chip style below */}
                      <div className="mt-4 flex justify-center">
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted/50 border border-muted text-xs">
                          <span className="text-muted-foreground font-medium">Triggered by</span>
                          <span className="h-1 w-1 rounded-full bg-muted-foreground/30"></span>
                          <span className="font-semibold text-foreground" title={entry.triggered_by}>
                            {entry.triggered_by}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                    <div className="border-t bg-muted/5">
                      {/* Queue ID Section */}
                      <div className="px-6 py-3 border-b bg-muted/30">
                        <div className="flex items-center justify-center gap-2 text-xs">
                          <span className="text-muted-foreground font-medium">Queue ID:</span>
                          <span className="font-mono text-muted-foreground/80">{entry.id}</span>
                        </div>
                      </div>

                      {/* Level Details Section */}
                      {entry.summary?.levels_summary && (
                        <div className="px-6 py-5 space-y-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-semibold text-foreground">Generation Breakdown</h4>
                            {entry.summary.overall_status && (
                              <Badge variant="outline" className="text-xs font-medium">
                                {entry.summary.overall_status}
                              </Badge>
                            )}
                          </div>
                          <div className="space-y-3">
                            {Object.entries(entry.summary.levels_summary)
                              .sort(([, a], [, b]) => a.level - b.level)
                              .map(([levelKey, levelData]) => (
                              <div
                                key={levelKey}
                                className="rounded-lg border bg-card/50 hover:bg-card transition-colors overflow-hidden"
                              >
                                {/* Main stats row */}
                                <div className="flex items-center gap-4 p-4">
                                  {/* Level indicator */}
                                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-bold flex-shrink-0">
                                    {levelData.level}
                                  </div>

                                  {/* Stats */}
                                  <div className="flex-1 grid grid-cols-3 gap-4">
                                    <div>
                                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">
                                        Existing
                                      </div>
                                      <div className="text-xl font-semibold">
                                        {levelData.existing_count}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">
                                        Needed
                                      </div>
                                      <div className="text-xl font-semibold">
                                        {levelData.needed_count}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">
                                        Generated
                                      </div>
                                      <div className="text-xl font-bold text-green-600">
                                        {levelData.generated_count}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Status badge */}
                                  <div className="flex-shrink-0">
                                    {getLevelStatusBadge(levelData.status)}
                                  </div>
                                </div>

                                {/* Reason or error - integrated into card */}
                                {(levelData.reason || levelData.error) && (
                                  <div className="px-4 pb-4 pt-0">
                                    <div className="pl-14">
                                      {levelData.reason && (
                                        <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-muted/50 text-xs text-muted-foreground border border-muted">
                                          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 opacity-70" />
                                          <p className="italic leading-relaxed">
                                            {levelData.reason}
                                          </p>
                                        </div>
                                      )}
                                      {levelData.error && (
                                        <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-destructive/10 text-xs text-destructive border border-destructive/20">
                                          <XCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                          <p className="leading-relaxed font-medium">
                                            {levelData.error}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
