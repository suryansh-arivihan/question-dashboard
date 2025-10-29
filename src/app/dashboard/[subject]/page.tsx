"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";
import { SUBJECT_CHAPTER_MAPPINGS } from "@/data/subject-chapter-mappings";
import { capitalize } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function SubjectPage() {
  const router = useRouter();
  const params = useParams();
  const subject = params.subject as string;
  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>({});
  const [openDialog, setOpenDialog] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<string>("");

  const subjectData = SUBJECT_CHAPTER_MAPPINGS.find((s) => s.subject === subject);
  const chapters = subjectData?.chapters || [];

  const handleGenerateCQNQ = async (chapterName: string) => {
    setIsGenerating(true);
    setGenerationStatus("Initializing...");

    // Simulated progress stages
    const progressStages = [
      { time: 0, message: "Initializing..." },
      { time: 2000, message: "Fetching topics from database..." },
      { time: 5000, message: "Scanning verified questions table..." },
      { time: 10000, message: "Collecting questions by topic and level..." },
      { time: 20000, message: "Sorting and selecting questions..." },
      { time: 30000, message: "Generating Excel file..." },
    ];

    // Progress timer
    const progressTimer = progressStages.map((stage) =>
      setTimeout(() => setGenerationStatus(stage.message), stage.time)
    );

    try {
      const response = await fetch(
        `/api/cqnq/generate?subject=${encodeURIComponent(subject)}&chapter=${encodeURIComponent(chapterName)}`
      );

      // Clear all timers
      progressTimer.forEach(clearTimeout);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate CQNQ");
      }

      setGenerationStatus("Preparing download...");

      // Get the blob from response
      const blob = await response.blob();

      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `CQNQ_${subject}_${chapterName}_${Date.now()}.xlsx`;
      document.body.appendChild(a);
      a.click();

      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success("CQNQ generated successfully!");
      setOpenDialog(null);
    } catch (error) {
      console.error("Error generating CQNQ:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to generate CQNQ"
      );
    } finally {
      setIsGenerating(false);
      setGenerationStatus("");
      // Clear any remaining timers
      progressTimer.forEach(clearTimeout);
    }
  };

  if (!subjectData) {
    return (
      <main className="min-h-dvh bg-background text-foreground">
        <div className="mx-auto w-full max-w-6xl px-4 py-8">
          <div className="mx-auto max-w-md rounded-md border bg-card p-6 text-center">
            <h3 className="text-lg font-semibold">Subject Not Found</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              The subject "{subject}" was not found.
            </p>
            <div className="mt-4">
              <Button variant="secondary" onClick={() => router.push("/dashboard")}>
                Go to Subjects
              </Button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const goHome = () => router.push("/dashboard");

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 md:py-10">
        <header className="mb-6">
          <Button
            variant="secondary"
            size="sm"
            className="mb-2 rounded-md px-3 py-1 transition-all hover:translate-x-[-2px]"
            onClick={goHome}
            aria-label="Go back"
          >
            ← Back
          </Button>
          <h1 className="text-balance text-2xl font-semibold tracking-tight">
            {capitalize(subject)}
          </h1>
        </header>

        <section aria-labelledby="chapters-title">
          <div className="mb-4 text-sm text-muted-foreground">
            <nav className="flex items-center gap-2" aria-label="Breadcrumb">
              <button
                className="underline-offset-4 hover:underline"
                onClick={goHome}
                aria-label="Go to Subjects"
              >
                Subjects
              </button>
              <span aria-hidden="true">/</span>
              <span className="text-foreground">{capitalize(subject)}</span>
            </nav>
          </div>

          <h2 id="chapters-title" className="sr-only">
            Chapters
          </h2>

          {chapters.length === 0 ? (
            <div className="mx-auto max-w-md rounded-md border bg-card p-6 text-center">
              <h3 className="text-lg font-semibold">No Chapters Found</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                No chapters found for this subject
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border">
              <div className="grid grid-cols-12 bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
                <div className="col-span-6">Chapter</div>
                <div className="col-span-6 text-right">Actions</div>
              </div>

              <ul role="list" className="divide-y">
                {chapters.map((chapter) => {
                  const topicCount = chapter.topicCount;

                  return (
                    <li key={chapter.name} className="px-3 py-3">
                      <div className="flex items-center gap-4">
                        <div className="flex-1 font-medium">{chapter.display_name}</div>
                        <Badge variant="secondary" className="text-xs">
                          {topicCount} topics
                        </Badge>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setOpenDialog(chapter.name)}
                          >
                            CQNQ
                          </Button>
                          <Button
                            size="sm"
                            className="group"
                            onClick={() =>
                              router.push(
                                `/dashboard/${subject}/${encodeURIComponent(chapter.name)}`
                              )
                            }
                          >
                            View topics
                            <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                          </Button>
                          <Dialog open={openDialog === chapter.name} onOpenChange={(open) => setOpenDialog(open ? chapter.name : null)}>
                            <DialogContent className="max-w-xl">
                              <DialogHeader>
                                <DialogTitle className="text-xl font-semibold">
                                  CQNQ Generator
                                </DialogTitle>
                                <DialogDescription>
                                  Generate CQNQ Excel report for {chapter.display_name}
                                </DialogDescription>
                              </DialogHeader>

                              {/* Fixed height container to prevent size changes */}
                              <div className="min-h-[380px] flex flex-col items-center justify-center px-6 pb-6">
                                {!isGenerating ? (
                                  <div className="flex flex-col items-center gap-6 w-full animate-in fade-in duration-300">
                                    {/* Info card */}
                                    <div className="w-full rounded-lg border bg-muted/30 p-6 space-y-4">
                                      <div className="flex items-start gap-3">
                                        <div className="rounded-lg bg-primary/10 p-2.5 mt-0.5">
                                          <FileSpreadsheet className="h-5 w-5 text-primary" />
                                        </div>
                                        <div className="flex-1">
                                          <h4 className="text-sm font-semibold mb-2">What will be generated?</h4>
                                          <ul className="text-sm text-muted-foreground space-y-1.5">
                                            <li className="flex items-start gap-2">
                                              <span className="text-primary mt-0.5">•</span>
                                              <span>150-250 questions from all topics</span>
                                            </li>
                                            <li className="flex items-start gap-2">
                                              <span className="text-primary mt-0.5">•</span>
                                              <span>Difficulty levels 1-3 only</span>
                                            </li>
                                            <li className="flex items-start gap-2">
                                              <span className="text-primary mt-0.5">•</span>
                                              <span>Excel format (.xlsx)</span>
                                            </li>
                                          </ul>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Generate button */}
                                    <Button
                                      size="lg"
                                      onClick={() => handleGenerateCQNQ(chapter.name)}
                                      className="min-w-[240px] h-12 text-base shadow-lg hover:shadow-xl transition-all"
                                    >
                                      <FileSpreadsheet className="mr-2 h-5 w-5" />
                                      Generate CQNQ Report
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center gap-6 w-full animate-in fade-in duration-300">
                                    {/* Main spinner with pulsing effect */}
                                    <div className="relative">
                                      <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse"></div>
                                      <Loader2 className="relative h-16 w-16 animate-spin text-primary" />
                                    </div>

                                    {/* Status text */}
                                    <div className="text-center space-y-2">
                                      <p className="text-base font-semibold text-foreground animate-pulse">
                                        {generationStatus}
                                      </p>
                                      <p className="text-sm text-muted-foreground">
                                        This may take up to a minute, please wait...
                                      </p>
                                    </div>

                                    {/* Progress stages with smooth animations */}
                                    <div className="w-full max-w-sm space-y-3 mt-2">
                                      {[
                                        {
                                          label: "Scanning tables",
                                          active: generationStatus.includes("Initializing") || generationStatus.includes("Fetching") || generationStatus.includes("Scanning") || generationStatus.includes("Collecting") || generationStatus.includes("Sorting") || generationStatus.includes("Generating"),
                                          completed: generationStatus.includes("Collecting") || generationStatus.includes("Sorting") || generationStatus.includes("Generating") || generationStatus.includes("download")
                                        },
                                        {
                                          label: "Collecting questions",
                                          active: generationStatus.includes("Collecting") || generationStatus.includes("Sorting") || generationStatus.includes("Generating"),
                                          completed: generationStatus.includes("Sorting") || generationStatus.includes("Generating") || generationStatus.includes("download")
                                        },
                                        {
                                          label: "Sorting questions",
                                          active: generationStatus.includes("Sorting") || generationStatus.includes("Generating"),
                                          completed: generationStatus.includes("Generating") || generationStatus.includes("download")
                                        },
                                        {
                                          label: "Creating Excel",
                                          active: generationStatus.includes("Generating") || generationStatus.includes("download"),
                                          completed: generationStatus.includes("download")
                                        },
                                      ].map((stage, idx) => (
                                        <div
                                          key={idx}
                                          className={`flex items-center gap-3 rounded-lg px-4 py-3 border transition-all duration-500 ${
                                            stage.active
                                              ? "bg-primary/5 border-primary/20"
                                              : stage.completed
                                              ? "bg-green-500/5 border-green-500/20"
                                              : "bg-muted/20 border-transparent"
                                          }`}
                                        >
                                          <div className="relative flex-shrink-0">
                                            {stage.completed ? (
                                              <div className="h-5 w-5 rounded-full bg-green-500 flex items-center justify-center animate-in zoom-in duration-300">
                                                <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                </svg>
                                              </div>
                                            ) : stage.active ? (
                                              <div className="h-5 w-5 rounded-full bg-primary animate-pulse"></div>
                                            ) : (
                                              <div className="h-5 w-5 rounded-full bg-muted"></div>
                                            )}
                                          </div>
                                          <span className={`text-sm font-medium transition-colors ${
                                            stage.active
                                              ? "text-foreground"
                                              : stage.completed
                                              ? "text-green-600"
                                              : "text-muted-foreground"
                                          }`}>
                                            {stage.label}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </DialogContent>
                          </Dialog>
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
    </main>
  );
}
