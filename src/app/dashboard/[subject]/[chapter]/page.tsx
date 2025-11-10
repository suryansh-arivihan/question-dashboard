"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { VerificationBars } from "@/components/VerificationBars";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { SUBJECT_CHAPTER_MAPPINGS } from "@/data/subject-chapter-mappings";
import { capitalize } from "@/lib/utils";
import { Loader2, Rocket, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { PipelineHistoryModal } from "@/components/PipelineHistoryModal";
import { useIsAdmin } from "@/hooks/useIsAdmin";

interface TopicWithStats {
  name: string;
  display_name: string;
  topic_id: string;
  verified: number;
  pending: number;
  in_progress: number;
  total: number;
  verifiedLevel1?: number;
  verifiedLevel2?: number;
  verifiedLevel3?: number;
  verifiedLevel4?: number;
  verifiedLevel5?: number;
  unverifiedLevel1?: number;
  unverifiedLevel2?: number;
  unverifiedLevel3?: number;
  unverifiedLevel4?: number;
  unverifiedLevel5?: number;
}

export default function ChapterPage() {
  const router = useRouter();
  const params = useParams();
  const subject = params.subject as string;
  const chapter = decodeURIComponent(params.chapter as string);

  const [topics, setTopics] = useState<TopicWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queuedTopics, setQueuedTopics] = useState<Set<string>>(new Set());
  const [queuingTopics, setQueuingTopics] = useState<Set<string>>(new Set());
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<TopicWithStats | null>(null);
  const [selectedLevels, setSelectedLevels] = useState<number[]>([1, 2, 3, 4, 5]);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyTopicId, setHistoryTopicId] = useState<string>("");
  const [historyTopicName, setHistoryTopicName] = useState<string>("");
  const { isAdmin } = useIsAdmin();

  const subjectData = SUBJECT_CHAPTER_MAPPINGS.find((s) => s.subject === subject);
  const chapterData = subjectData?.chapters.find((c) => c.name === chapter);
  const chapterDisplayName = chapterData?.display_name || capitalize(chapter);

  useEffect(() => {
    fetchTopics();
  }, [subject, chapter]);

  const fetchTopics = async () => {
    try {
      const response = await fetch(
        `/api/topics?subject=${encodeURIComponent(subject)}&chapter=${encodeURIComponent(chapter)}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || "Failed to fetch topics");
      }

      const result = await response.json();
      setTopics(result.topics);
    } catch (err) {
      console.error("Error fetching topics:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const showConfirmDialog = (topic: TopicWithStats) => {
    setSelectedTopic(topic);
    setConfirmDialogOpen(true);
  };

  const showHistoryModal = (topic: TopicWithStats) => {
    setHistoryTopicId(topic.topic_id);
    setHistoryTopicName(topic.display_name);
    setHistoryModalOpen(true);
  };

  const toggleLevel = (level: number) => {
    setSelectedLevels((prev) => {
      if (prev.includes(level)) {
        return prev.filter((l) => l !== level);
      }
      return [...prev, level].sort((a, b) => a - b);
    });
  };

  const handleReadyToGo = async () => {
    if (!selectedTopic) return;

    if (selectedLevels.length === 0) {
      toast.error("Please select at least one level");
      return;
    }

    const topicName = selectedTopic.name;
    setConfirmDialogOpen(false);
    setQueuingTopics((prev) => new Set(prev).add(topicName));

    try {
      const response = await fetch("/api/admin/ready-to-go", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subject,
          chapter,
          topic: topicName,
          topicId: selectedTopic.topic_id,
          levels: selectedLevels,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to queue topic");
      }

      setQueuedTopics((prev) => new Set(prev).add(topicName));
      toast.success("Topic queued for generation successfully!");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to queue topic"
      );
    } finally {
      setQueuingTopics((prev) => {
        const next = new Set(prev);
        next.delete(topicName);
        return next;
      });
      setSelectedTopic(null);
    }
  };

  const goBack = () => router.push(`/dashboard/${subject}`);
  const goHome = () => router.push("/dashboard");

  if (loading) {
    return (
      <main className="min-h-dvh bg-background text-foreground">
        <div className="flex min-h-dvh items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Loading topics...</p>
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-dvh bg-background text-foreground">
        <div className="flex min-h-dvh items-center justify-center">
          <div className="mx-auto max-w-md rounded-md border bg-card p-6 text-center">
            <h3 className="text-lg font-semibold">Error</h3>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <div className="mt-4">
              <Button variant="secondary" onClick={goBack}>
                Go Back
              </Button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 md:py-10">
        <header className="mb-6">
          <Button
            variant="secondary"
            size="sm"
            className="mb-2 rounded-md px-3 py-1 transition-all hover:translate-x-[-2px]"
            onClick={goBack}
            aria-label="Go back"
          >
            ← Back
          </Button>
          <h1 className="text-balance text-2xl font-semibold tracking-tight">
            {chapterDisplayName}
          </h1>
        </header>

        <section aria-labelledby="topics-title">
          <div className="mb-4 text-sm text-muted-foreground">
            <nav className="flex items-center gap-2" aria-label="Breadcrumb">
              <button
                className="underline-offset-4 hover:underline"
                onClick={goHome}
              >
                Subjects
              </button>
              <span aria-hidden="true">/</span>
              <button
                className="underline-offset-4 hover:underline"
                onClick={goBack}
              >
                {capitalize(subject)}
              </button>
              <span aria-hidden="true">/</span>
              <span className="text-foreground">{chapterDisplayName}</span>
            </nav>
          </div>

          <h2 id="topics-title" className="sr-only">
            Topics
          </h2>

          {topics.length === 0 ? (
            <div className="mx-auto max-w-md rounded-md border bg-card p-6 text-center">
              <h3 className="text-lg font-semibold">No Topics Found</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                No topics found for this chapter
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border">
              <div className="grid grid-cols-12 bg-muted px-3 py-2 text-xs font-medium text-muted-foreground gap-3">
                <div className="col-span-3">Topic</div>
                <div className="col-span-4 pl-2">Verification Status</div>
                <div className="col-span-1 text-center">Unverified</div>
                <div className="col-span-4 text-right">Actions</div>
              </div>

              <ul role="list" className="divide-y">
                {topics.map((topic) => {
                  const isQueued = queuedTopics.has(topic.name);
                  const isQueuing = queuingTopics.has(topic.name);

                  return (
                    <li key={topic.name} className="px-3 py-3">
                      <div className="grid grid-cols-12 items-center gap-3">
                        <div className="col-span-3">
                          <div className="font-medium text-sm">
                            {topic.display_name}
                          </div>
                        </div>
                        <div className="col-span-4 pl-2">
                          <VerificationBars
                            verifiedLevel1={topic.verifiedLevel1 || 0}
                            verifiedLevel2={topic.verifiedLevel2 || 0}
                            verifiedLevel3={topic.verifiedLevel3 || 0}
                            verifiedLevel4={topic.verifiedLevel4 || 0}
                            verifiedLevel5={topic.verifiedLevel5 || 0}
                            unverifiedLevel1={topic.unverifiedLevel1 || 0}
                            unverifiedLevel2={topic.unverifiedLevel2 || 0}
                            unverifiedLevel3={topic.unverifiedLevel3 || 0}
                            unverifiedLevel4={topic.unverifiedLevel4 || 0}
                            unverifiedLevel5={topic.unverifiedLevel5 || 0}
                          />
                        </div>
                        <div className="col-span-1 flex justify-center">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            topic.pending > 0
                              ? "bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200"
                              : "bg-muted text-muted-foreground"
                          }`}>
                            {topic.pending}
                          </span>
                        </div>
                        <div className="col-span-4 flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => router.push(`/dashboard/${subject}/${encodeURIComponent(chapter)}/${encodeURIComponent(topic.name)}`)}
                          >
                            View Questions
                          </Button>
                          {isAdmin && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => showHistoryModal(topic)}
                                title="View Pipeline History"
                              >
                                <Clock className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => showConfirmDialog(topic)}
                                disabled={isQueuing || isQueued}
                              >
                                {isQueued ? (
                                  <>
                                    <CheckCircle2 className="h-3 w-3" />
                                    Queued
                                  </>
                                ) : (
                                  <>
                                    <Rocket className="h-3 w-3" />
                                    {isQueuing ? "Queueing..." : "Ready to Go"}
                                  </>
                                )}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="max-w-lg p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle className="text-lg font-semibold">
              Trigger Generation Pipeline
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground mt-1">
              {selectedTopic?.display_name}
            </DialogDescription>
          </DialogHeader>

          <div className="p-6 space-y-5">
            {/* Level Selection Section */}
            <div>
              <h3 className="text-sm font-medium text-foreground mb-3">
                Select Difficulty Levels
              </h3>
              <div className="rounded-lg border divide-y">
                {[1, 2, 3, 4, 5].map((level) => {
                  const isSelected = selectedLevels.includes(level);
                  return (
                    <button
                      key={level}
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

          <DialogFooter className="px-6 pb-6 flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmDialogOpen(false)}
              disabled={selectedTopic ? queuingTopics.has(selectedTopic.name) : false}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleReadyToGo}
              disabled={selectedTopic ? queuingTopics.has(selectedTopic.name) || selectedLevels.length === 0 : false}
              className="flex-1"
            >
              {selectedTopic && queuingTopics.has(selectedTopic.name) ? (
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
        open={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        topicId={historyTopicId}
        topicDisplayName={historyTopicName}
      />
    </main>
  );
}
