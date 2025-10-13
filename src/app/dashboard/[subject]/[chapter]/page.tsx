"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { VerificationBars } from "@/components/VerificationBars";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { SUBJECT_CHAPTER_MAPPINGS } from "@/data/subject-chapter-mappings";
import { capitalize } from "@/lib/utils";
import { Loader2, Rocket, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

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

  const handleReadyToGo = async () => {
    if (!selectedTopic) return;

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
              <div className="grid grid-cols-12 bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
                <div className="col-span-4">Topic</div>
                <div className="col-span-4">Verification Status</div>
                <div className="col-span-4 text-right">Actions</div>
              </div>

              <ul role="list" className="divide-y">
                {topics.map((topic) => {
                  const isQueued = queuedTopics.has(topic.name);
                  const isQueuing = queuingTopics.has(topic.name);

                  return (
                    <li key={topic.name} className="px-3 py-3">
                      <div className="grid grid-cols-12 items-center gap-2">
                        <div className="col-span-4">
                          <div className="font-medium text-sm">
                            {topic.display_name}
                          </div>
                        </div>
                        <div className="col-span-4 pl-4">
                          <VerificationBars
                            verifiedLevel1={topic.verifiedLevel1 || 0}
                            verifiedLevel2={topic.verifiedLevel2 || 0}
                            verifiedLevel3={topic.verifiedLevel3 || 0}
                          />
                        </div>
                        <div className="col-span-4 flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => router.push(`/dashboard/${subject}/${encodeURIComponent(chapter)}/${encodeURIComponent(topic.name)}`)}
                          >
                            View Questions
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
              <strong>{selectedTopic?.display_name}</strong>?
              <br />
              <br />
              This will queue the topic for question generation. The process may take some time to complete.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDialogOpen(false)}
              disabled={selectedTopic ? queuingTopics.has(selectedTopic.name) : false}
            >
              Cancel
            </Button>
            <Button
              variant="success"
              onClick={handleReadyToGo}
              disabled={selectedTopic ? queuingTopics.has(selectedTopic.name) : false}
            >
              {selectedTopic && queuingTopics.has(selectedTopic.name) ? "Queueing..." : "Yes, Trigger Pipeline"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
