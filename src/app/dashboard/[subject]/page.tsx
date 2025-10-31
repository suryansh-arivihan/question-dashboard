"use client";

import { useState } from "react";
import * as React from "react";
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
import { FileSpreadsheet, Loader2, Plus, Minus, X } from "lucide-react";
import { toast } from "sonner";

export default function SubjectPage() {
  const router = useRouter();
  const params = useParams();
  const subject = params.subject as string;
  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>({});
  const [openDialog, setOpenDialog] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<string>("");
  const [testDialogOpen, setTestDialogOpen] = useState<string | null>(null);
  const [topics, setTopics] = useState<any[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [numTests, setNumTests] = useState(1);
  const [testData, setTestData] = useState<Record<string, Record<number, Record<number, number>>>>({});
  const [isGeneratingTests, setIsGeneratingTests] = useState(false);
  const [generationProgress, setGenerationProgress] = useState("");

  const subjectData = SUBJECT_CHAPTER_MAPPINGS.find((s) => s.subject === subject);
  const chapters = subjectData?.chapters || [];

  const handleTestButtonClick = async (chapterName: string) => {
    setTestDialogOpen(chapterName);
    setLoadingTopics(true);
    setNumTests(1);
    setTestData({});
    try {
      const response = await fetch(
        `/api/topics?subject=${encodeURIComponent(subject)}&chapter=${encodeURIComponent(chapterName)}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || "Failed to fetch topics");
      }

      const result = await response.json();
      setTopics(result.topics);

      // Initialize testData with zeros
      const initialData: Record<string, Record<number, Record<number, number>>> = {};
      result.topics.forEach((topic: any) => {
        initialData[topic.name] = {};
        for (let test = 1; test <= 1; test++) {
          initialData[topic.name][test] = { 1: 0, 2: 0, 3: 0 };
        }
      });
      setTestData(initialData);
    } catch (err) {
      console.error("Error fetching topics:", err);
      toast.error(err instanceof Error ? err.message : "Failed to fetch topics");
    } finally {
      setLoadingTopics(false);
    }
  };

  const updateTestValue = (topicName: string, testNum: number, level: number, delta: number) => {
    setTestData(prev => {
      // Deep clone to avoid mutation issues in StrictMode
      const newData = JSON.parse(JSON.stringify(prev));
      if (!newData[topicName]) newData[topicName] = {};
      if (!newData[topicName][testNum]) newData[topicName][testNum] = { 1: 0, 2: 0, 3: 0 };

      const currentValue = newData[topicName][testNum][level] || 0;
      const newValue = Math.max(0, currentValue + delta);
      newData[topicName][testNum][level] = newValue;

      return newData;
    });
  };

  const setTestValue = (topicName: string, testNum: number, level: number, value: string) => {
    const numValue = parseInt(value) || 0;
    setTestData(prev => {
      // Deep clone to avoid mutation issues in StrictMode
      const newData = JSON.parse(JSON.stringify(prev));
      if (!newData[topicName]) newData[topicName] = {};
      if (!newData[topicName][testNum]) newData[topicName][testNum] = { 1: 0, 2: 0, 3: 0 };
      newData[topicName][testNum][level] = Math.max(0, numValue);
      return newData;
    });
  };

  const calculateTestTotal = (testNum: number) => {
    return topics.reduce((sum, topic) => {
      const l1 = testData[topic.name]?.[testNum]?.[1] || 0;
      const l2 = testData[topic.name]?.[testNum]?.[2] || 0;
      const l3 = testData[topic.name]?.[testNum]?.[3] || 0;
      return sum + l1 + l2 + l3;
    }, 0);
  };

  const areAllTestsValid = () => {
    for (let testNum = 1; testNum <= numTests; testNum++) {
      if (calculateTestTotal(testNum) !== 45) {
        return false;
      }
    }
    return true;
  };

  const validateTopicLevelLimits = () => {
    const violations: string[] = [];

    topics.forEach(topic => {
      for (const level of [1, 2, 3]) {
        let totalAcrossTests = 0;
        for (let testNum = 1; testNum <= numTests; testNum++) {
          totalAcrossTests += testData[topic.name]?.[testNum]?.[level] || 0;
        }

        if (totalAcrossTests > 10) {
          violations.push(`${topic.display_name} - Level ${level}: ${totalAcrossTests} questions (max 10)`);
        }
      }
    });

    return violations;
  };

  const topicLevelViolations = validateTopicLevelLimits();
  const hasViolations = topicLevelViolations.length > 0;

  const handleGenerateTests = async () => {
    setIsGeneratingTests(true);
    setGenerationProgress("Validating question availability...");

    try {
      // Create topic display name mapping
      const topicDisplayNames: Record<string, string> = {};
      topics.forEach(topic => {
        topicDisplayNames[topic.name] = topic.display_name;
      });

      // First, validate question availability
      const validationResponse = await fetch("/api/test/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subject,
          chapter: testDialogOpen,
          numTests,
          testData,
          topicDisplayNames,
        }),
      });

      const validationResult = await validationResponse.json();

      if (!validationResult.valid) {
        const insufficientTopics = validationResult.insufficientTopics || [];
        const errorMessages = insufficientTopics.map(
          (item: any) =>
            `${item.topicDisplay || item.topic} - Level ${item.level}: Need ${item.needed}, Available ${item.available}`
        );

        throw new Error(
          `Insufficient questions available:\n${errorMessages.join("\n")}`
        );
      }

      setGenerationProgress("Fetching questions from database...");

      const response = await fetch("/api/test/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subject,
          chapter: testDialogOpen,
          numTests,
          testData,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate tests");
      }

      setGenerationProgress("Generating Excel file...");

      // Get the blob from response
      const blob = await response.blob();

      setGenerationProgress("Preparing download...");

      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Tests_${subject}_${testDialogOpen}_${Date.now()}.xlsx`;
      document.body.appendChild(a);
      a.click();

      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success("Tests generated successfully!");
      setTestDialogOpen(null);
    } catch (error) {
      console.error("Error generating tests:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to generate tests";

      // Show detailed error in toast for insufficient questions
      if (errorMessage.includes("Insufficient questions")) {
        toast.error(errorMessage, { duration: 8000 });
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setIsGeneratingTests(false);
      setGenerationProgress("");
    }
  };

  const addTest = () => {
    if (numTests < 4) {
      const newTestNum = numTests + 1;
      setNumTests(newTestNum);

      // Initialize new test column with zeros for all topics
      setTestData(prev => {
        const newData = { ...prev };
        topics.forEach(topic => {
          if (!newData[topic.name]) newData[topic.name] = {};
          newData[topic.name][newTestNum] = { 1: 0, 2: 0, 3: 0 };
        });
        return newData;
      });
    }
  };

  const removeTest = () => {
    if (numTests > 1) {
      const testToRemove = numTests;
      setNumTests(numTests - 1);

      // Remove the last test column from all topics
      setTestData(prev => {
        const newData = { ...prev };
        Object.keys(newData).forEach(topicName => {
          delete newData[topicName][testToRemove];
        });
        return newData;
      });
    }
  };

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
                            variant="outline"
                            onClick={() => handleTestButtonClick(chapter.name)}
                          >
                            TEST
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
                          {testDialogOpen === chapter.name && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center">
                              {/* Backdrop */}
                              <div
                                className="fixed inset-0 bg-black/50"
                                onClick={() => setTestDialogOpen(null)}
                              />
                              {/* Dialog Content */}
                              <div className="relative z-50 w-[94vw] max-w-[1600px] h-[88vh] rounded-lg border bg-white shadow-lg flex flex-col p-6">
                                <div className="flex flex-col space-y-1.5 mb-4">
                                  <h2 className="text-xl font-semibold">
                                    Test Generator - {chapter.display_name}
                                  </h2>
                                  <p className="text-sm text-muted-foreground">
                                    Configure the number of questions for each topic, level, and test
                                  </p>
                                </div>

                              <div className={`flex-1 px-2 relative ${isGeneratingTests ? 'overflow-hidden' : 'overflow-auto'}`}>
                                {isGeneratingTests && (
                                  <div className="absolute inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center">
                                    <div className="flex flex-col items-center gap-6 w-full max-w-md mx-4 animate-in fade-in duration-300">
                                      {/* Main spinner with pulsing effect */}
                                      <div className="relative">
                                        <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse"></div>
                                        <Loader2 className="relative h-16 w-16 animate-spin text-primary" />
                                      </div>

                                      {/* Status text */}
                                      <div className="text-center space-y-2">
                                        <p className="text-base font-semibold text-foreground animate-pulse">
                                          {generationProgress}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                          This may take up to a minute, please wait...
                                        </p>
                                      </div>

                                      {/* Progress stages with smooth animations */}
                                      <div className="w-full max-w-sm space-y-3 mt-2">
                                        {[
                                          {
                                            label: "Validating availability",
                                            active: generationProgress.includes("Validating"),
                                            completed: generationProgress.includes("Fetching") || generationProgress.includes("Generating") || generationProgress.includes("download")
                                          },
                                          {
                                            label: "Fetching questions",
                                            active: generationProgress.includes("Fetching"),
                                            completed: generationProgress.includes("Generating") || generationProgress.includes("download")
                                          },
                                          {
                                            label: "Creating Excel file",
                                            active: generationProgress.includes("Generating"),
                                            completed: generationProgress.includes("download")
                                          },
                                          {
                                            label: "Preparing download",
                                            active: generationProgress.includes("download"),
                                            completed: false
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
                                  </div>
                                )}
                                {loadingTopics ? (
                                  <div className="flex items-center justify-center py-12">
                                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                  </div>
                                ) : topics.length === 0 ? (
                                  <div className="text-center py-8 text-muted-foreground">
                                    No topics found
                                  </div>
                                ) : (
                                  <div className="w-full">
                                    {/* Header with Test Controls */}
                                    {/* ...existing code... */}

                                    {/* Table */}
                                    <div className="border-2 rounded-lg overflow-x-auto -mx-2 shadow-sm">
                                      <div className="max-h-[68vh] overflow-y-auto">
                                        <table className="w-full border-collapse">
                                        <thead className="sticky top-0 z-20 shadow-sm">
                                          <tr className="bg-muted border-slate-300 dark:border-slate-600">
                                              <th className="border-r-2 p-2 text-left font-bold text-sm sticky left-0 bg-muted z-30 min-w-[280px] w-[280px]">
                                              Topic
                                            </th>
                                            {Array.from({ length: numTests }, (_, i) => i + 1).map((testNum) => (
                                              <th key={testNum} colSpan={3} className={`p-1.5 text-center font-bold text-sm bg-muted ${testNum < numTests ? 'border-r-2' : ''}`}>
                                                Test {testNum}
                                              </th>
                                            ))}
                                          </tr>
                                          <tr className="bg-muted">
                                            <th className="border-r-2 border-slate-300 dark:border-slate-600 p-1.5 sticky left-0 bg-muted z-30"></th>
                                            {Array.from({ length: numTests }, (_, i) => i + 1).map((testNum) => (
                                              <React.Fragment key={`level-headers-${testNum}`}>
                                                <th className="p-1 border-b-2 border-slate-300 dark:border-slate-600 text-center text-xs font-semibold text-muted-foreground bg-muted">
                                                  L1
                                                </th>
                                                <th className="p-1 border-b-2 border-slate-300 dark:border-slate-600 text-center text-xs font-semibold text-muted-foreground bg-muted">
                                                  L2
                                                </th>
                                                <th className={`p-1 border-b-2 border-slate-300 dark:border-slate-600 text-center text-xs font-semibold text-muted-foreground bg-muted ${testNum < numTests ? 'border-r-2' : ''}`}>
                                                  L3
                                                </th>
                                              </React.Fragment>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {topics.map((topic, idx) => (
                                            <tr key={topic.name} className="hover:bg-muted/20 transition-colors">
                                              <td className="border-r-2 border-b p-3 font-semibold text-xs sticky left-0 bg-background z-0 min-w-[280px] w-[280px]">
                                                {topic.display_name}
                                              </td>
                                              {Array.from({ length: numTests }, (_, i) => i + 1).map((testNum) => (
                                                <React.Fragment key={`${topic.name}-test-${testNum}`}>
                                                  {[1, 2, 3].map((level, levelIdx) => (
                                                    <td
                                                      key={`${topic.name}-${testNum}-${level}`}
                                                      className={`border-b p-1.5 min-w-[120px] ${
                                                        levelIdx < 2 ? 'border-r border-solid' : ''
                                                      } ${levelIdx === 2 && testNum < numTests ? 'border-r-2' : ''} ${testNum % 2 === 0 ? 'bg-muted/5' : ''}`}
                                                    >
                                                      <div className="flex items-center justify-center gap-1">
                                                        <Button
                                                          size="icon"
                                                          variant="outline"
                                                          className="h-6 w-6 p-0 rounded-full flex items-center justify-center bg-muted/60 hover:bg-primary hover:text-primary-foreground transition-colors"
                                                          style={{ minWidth: '24px', minHeight: '24px' }}
                                                          onClick={() => updateTestValue(topic.name, testNum, level, -1)}
                                                          aria-label="Decrease"
                                                        >
                                                          <Minus className="h-3 w-3 font-bold stroke-[3]" />
                                                        </Button>
                                                        <input
                                                          type="number"
                                                          min="0"
                                                          value={testData[topic.name]?.[testNum]?.[level] || 0}
                                                          onChange={(e) => setTestValue(topic.name, testNum, level, e.target.value)}
                                                          className="w-12 h-8 text-center border rounded text-xs font-medium focus:ring-2 focus:ring-primary focus:outline-none"
                                                        />
                                                        <Button
                                                          size="icon"
                                                          variant="outline"
                                                          className="h-6 w-6 p-0 rounded-full flex items-center justify-center bg-muted/40 hover:bg-primary hover:text-primary-foreground transition-colors"
                                                          style={{ minWidth: '24px', minHeight: '24px' }}
                                                          onClick={() => updateTestValue(topic.name, testNum, level, 1)}
                                                          aria-label="Increase"
                                                        >
                                                          <Plus className="h-3 w-3 font-bold stroke-[3]" />
                                                        </Button>
                                                      </div>
                                                    </td>
                                                  ))}
                                                </React.Fragment>
                                              ))}
                                            </tr>
                                          ))}
                                        </tbody>
                                        <tfoot className="sticky bottom-0 z-20 bg-background">
                                          {/* Summary Row */}
                                          <tr className="bg-slate-100 dark:bg-slate-800 font-bold text-slate-900 dark:text-slate-100 border-t-2 border-slate-300 dark:border-slate-600">
                                            <td className="border-r-2 p-1.5 text-xs sticky left-0 bg-slate-100 dark:bg-slate-800 z-30 min-w-[280px] w-[280px]">
                                              TOTAL
                                            </td>
                                            {Array.from({ length: numTests }, (_, i) => i + 1).map((testNum) => (
                                              <React.Fragment key={`total-test-${testNum}`}>
                                                {[1, 2, 3].map((level, levelIdx) => {
                                                  const total = topics.reduce((sum, topic) => {
                                                    return sum + (testData[topic.name]?.[testNum]?.[level] || 0);
                                                  }, 0);
                                                  return (
                                                    <td
                                                      key={`total-${testNum}-${level}`}
                                                      className={`p-1.5 text-center text-xs font-bold min-w-[120px] ${
                                                        levelIdx === 2 && testNum < numTests ? 'border-r-2' : ''
                                                      }`}
                                                    >
                                                      {total}
                                                    </td>
                                                  );
                                                })}
                                              </React.Fragment>
                                            ))}
                                          </tr>
                                          {/* Grand Total Row */}
                                          <tr className="bg-slate-200 dark:bg-slate-700 font-bold text-slate-900 dark:text-slate-100">
                                            <td className="border-r-2 p-1.5 text-xs sticky left-0 bg-slate-200 dark:bg-slate-700 z-30 min-w-[280px] w-[280px]">
                                              GRAND TOTAL
                                            </td>
                                            {Array.from({ length: numTests }, (_, i) => i + 1).map((testNum) => {
                                              const testTotal = calculateTestTotal(testNum);
                                              const isValid = testTotal === 45;
                                              return (
                                                <td
                                                  key={`grand-total-${testNum}`}
                                                  colSpan={3}
                                                  className={`p-1.5 text-center text-xs font-bold ${
                                                    testNum < numTests ? 'border-r-2' : ''
                                                  } ${
                                                    isValid ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                                                  }`}
                                                >
                                                  {testTotal} / 45
                                                  {isValid && <span className="ml-1">✓</span>}
                                                  {!isValid && <span className="ml-1">✗</span>}
                                                </td>
                                              );
                                            })}
                                          </tr>
                                        </tfoot>
                                      </table>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>

                              <div className="flex justify-end gap-2 pt-2 border-t mt-1">
                                <div className="flex flex-1 items-center gap-4">
                                  <span className="text-sm font-medium">Number of Tests:</span>
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-6 w-6 p-0 rounded-full flex items-center justify-center bg-muted/60 hover:bg-primary hover:text-primary-foreground transition-colors"
                                    style={{ minWidth: '24px', minHeight: '24px' }}
                                    onClick={removeTest}
                                    disabled={numTests <= 1}
                                  >
                                    <Minus className="h-3 w-3 font-bold stroke-[3]" />
                                  </Button>
                                  <span className="px-3 py-1 border rounded-md text-sm font-semibold">
                                    {numTests}
                                  </span>
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-6 w-6 p-0 rounded-full flex items-center justify-center bg-muted/40 hover:bg-primary hover:text-primary-foreground transition-colors"
                                    style={{ minWidth: '24px', minHeight: '24px' }}
                                    onClick={addTest}
                                    disabled={numTests >= 4}
                                  >
                                    <Plus className="h-3 w-3 font-bold stroke-[3]" />
                                  </Button>
                                </div>
                                <div className="text-sm space-y-1">
                                  {areAllTestsValid() ? (
                                    <div className="text-green-600 font-semibold">✓ All tests have exactly 45 questions</div>
                                  ) : (
                                    <div className="text-red-600 font-semibold">⚠ Each test must have exactly 45 questions</div>
                                  )}
                                  {hasViolations && (
                                    <div className="text-red-600 text-xs">
                                      <div className="font-semibold">⚠ Topic-level limit exceeded (max 10 per topic-level across all tests):</div>
                                      <ul className="mt-1 ml-4 list-disc">
                                        {topicLevelViolations.slice(0, 3).map((violation, idx) => (
                                          <li key={idx}>{violation}</li>
                                        ))}
                                        {topicLevelViolations.length > 3 && (
                                          <li>...and {topicLevelViolations.length - 3} more</li>
                                        )}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    onClick={() => setTestDialogOpen(null)}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    onClick={handleGenerateTests}
                                    disabled={!areAllTestsValid() || hasViolations || isGeneratingTests}
                                  >
                                    {isGeneratingTests ? (
                                      <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Generating...
                                      </>
                                    ) : (
                                      "Generate Tests"
                                    )}
                                  </Button>
                                </div>
                              </div>
                              </div>
                            </div>
                          )}
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
