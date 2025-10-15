"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SUBJECT_CHAPTER_MAPPINGS } from "@/data/subject-chapter-mappings";
import { capitalize } from "@/lib/utils";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { LatexRenderer } from "@/components/LatexRenderer";

interface Question {
  PrimaryKey: string;
  question_id: string;
  question: string;
  answer: string;
  difficulty_level: number;
  status: string;
  subject: string;
  chapter_name: string;
  identified_topic: string;
  verifiedBy?: {
    email: string;
    id: string;
    name: string;
  };
}

interface QuestionCounts {
  pending: {
    total: number;
    level1: number;
    level2: number;
    level3: number;
    level4: number;
    level5: number;
  };
  verified: {
    total: number;
    level1: number;
    level2: number;
    level3: number;
    level4: number;
    level5: number;
  };
  discarded: {
    total: number;
    level1: number;
    level2: number;
    level3: number;
    level4: number;
    level5: number;
  };
  total: number;
}

interface Pagination {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export default function QuestionsPage() {
  const router = useRouter();
  const params = useParams();
  const subject = params.subject as string;
  const chapter = decodeURIComponent(params.chapter as string);
  const topic = decodeURIComponent(params.topic as string);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [counts, setCounts] = useState<QuestionCounts | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [statusFilter, setStatusFilter] = useState<"all" | "PENDING" | "VERIFIED" | "DISCARDED">("all");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  const subjectData = SUBJECT_CHAPTER_MAPPINGS.find((s) => s.subject === subject);
  const chapterData = subjectData?.chapters.find((c) => c.name === chapter);
  const chapterDisplayName = chapterData?.display_name || capitalize(chapter);

  useEffect(() => {
    fetchCounts();
  }, [subject, chapter, topic]);

  useEffect(() => {
    setCurrentPage(1); // Reset to page 1 when filters change
  }, [statusFilter, levelFilter]);

  useEffect(() => {
    fetchQuestions();
  }, [subject, chapter, topic, statusFilter, levelFilter, currentPage]);

  const fetchCounts = async () => {
    setLoadingCounts(true);
    try {
      const response = await fetch(
        `/api/questions/count?subject=${subject}&chapter=${chapter}&topic=${topic}`
      );

      if (response.ok) {
        const data = await response.json();
        setCounts(data);
      }
    } catch (err) {
      console.error("Error fetching counts:", err);
    } finally {
      setLoadingCounts(false);
    }
  };

  const fetchQuestions = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        subject,
        chapter,
        topic,
        status: statusFilter,
        page: currentPage.toString(),
        pageSize: "7",
      });

      if (levelFilter !== "all") {
        params.append("level", levelFilter);
      }

      const response = await fetch(`/api/questions?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || "Failed to fetch questions");
      }

      const result = await response.json();
      setQuestions(result.questions);
      setPagination(result.pagination);
    } catch (err) {
      console.error("Error fetching questions:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => router.push(`/dashboard/${subject}/${encodeURIComponent(chapter)}`);

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
      <div className="mx-auto w-full max-w-7xl px-4 py-8 md:py-10">
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
            {capitalize(topic)}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {chapterDisplayName} • {capitalize(subject)}
          </p>
        </header>

        {/* Stats Cards */}
        <div className="mb-6 grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
          {loadingCounts ? (
            <>
              {/* Total Card Skeleton */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="h-4 w-12 bg-muted animate-pulse rounded"></div>
                    </div>
                    <div className="h-9 w-12 bg-muted animate-pulse rounded"></div>
                  </div>
                </CardContent>
              </Card>

              {/* Unverified Card Skeleton */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="h-4 w-20 bg-muted animate-pulse rounded mb-2"></div>
                      <div className="flex gap-2">
                        <div className="h-3 w-8 bg-muted animate-pulse rounded"></div>
                        <div className="h-3 w-8 bg-muted animate-pulse rounded"></div>
                        <div className="h-3 w-8 bg-muted animate-pulse rounded"></div>
                        <div className="h-3 w-8 bg-muted animate-pulse rounded"></div>
                        <div className="h-3 w-8 bg-muted animate-pulse rounded"></div>
                      </div>
                    </div>
                    <div className="h-9 w-12 bg-muted animate-pulse rounded"></div>
                  </div>
                </CardContent>
              </Card>

              {/* Verified Card Skeleton */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="h-4 w-20 bg-muted animate-pulse rounded mb-2"></div>
                      <div className="flex gap-2">
                        <div className="h-3 w-8 bg-muted animate-pulse rounded"></div>
                        <div className="h-3 w-8 bg-muted animate-pulse rounded"></div>
                        <div className="h-3 w-8 bg-muted animate-pulse rounded"></div>
                        <div className="h-3 w-8 bg-muted animate-pulse rounded"></div>
                        <div className="h-3 w-8 bg-muted animate-pulse rounded"></div>
                      </div>
                    </div>
                    <div className="h-9 w-12 bg-muted animate-pulse rounded"></div>
                  </div>
                </CardContent>
              </Card>

              {/* Discarded Card Skeleton */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="h-4 w-20 bg-muted animate-pulse rounded mb-2"></div>
                      <div className="flex gap-2">
                        <div className="h-3 w-8 bg-muted animate-pulse rounded"></div>
                        <div className="h-3 w-8 bg-muted animate-pulse rounded"></div>
                        <div className="h-3 w-8 bg-muted animate-pulse rounded"></div>
                        <div className="h-3 w-8 bg-muted animate-pulse rounded"></div>
                        <div className="h-3 w-8 bg-muted animate-pulse rounded"></div>
                      </div>
                    </div>
                    <div className="h-9 w-12 bg-muted animate-pulse rounded"></div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : counts ? (
            <>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Total</p>
                    </div>
                    <div className="text-3xl font-bold">{counts.total}</div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Unverified</p>
                      <div className="mt-1 flex gap-2 text-xs">
                        <span>L1: <span className="font-semibold">{counts.pending.level1}</span></span>
                        <span>L2: <span className="font-semibold">{counts.pending.level2}</span></span>
                        <span>L3: <span className="font-semibold">{counts.pending.level3}</span></span>
                        <span>L4: <span className="font-semibold">{counts.pending.level4}</span></span>
                        <span>L5: <span className="font-semibold">{counts.pending.level5}</span></span>
                      </div>
                    </div>
                    <div className="text-3xl font-bold">{counts.pending.total}</div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Verified</p>
                      <div className="mt-1 flex gap-2 text-xs">
                        <span>L1: <span className="font-semibold">{counts.verified.level1}</span></span>
                        <span>L2: <span className="font-semibold">{counts.verified.level2}</span></span>
                        <span>L3: <span className="font-semibold">{counts.verified.level3}</span></span>
                        <span>L4: <span className="font-semibold">{counts.verified.level4}</span></span>
                        <span>L5: <span className="font-semibold">{counts.verified.level5}</span></span>
                      </div>
                    </div>
                    <div className="text-3xl font-bold">{counts.verified.total}</div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Discarded</p>
                      <div className="mt-1 flex gap-2 text-xs">
                        <span>L1: <span className="font-semibold">{counts.discarded.level1}</span></span>
                        <span>L2: <span className="font-semibold">{counts.discarded.level2}</span></span>
                        <span>L3: <span className="font-semibold">{counts.discarded.level3}</span></span>
                        <span>L4: <span className="font-semibold">{counts.discarded.level4}</span></span>
                        <span>L5: <span className="font-semibold">{counts.discarded.level5}</span></span>
                      </div>
                    </div>
                    <div className="text-3xl font-bold">{counts.discarded.total}</div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Status:</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={statusFilter === "all" ? "default" : "outline"}
                onClick={() => setStatusFilter("all")}
              >
                All
              </Button>
              <Button
                size="sm"
                variant={statusFilter === "PENDING" ? "default" : "outline"}
                onClick={() => setStatusFilter("PENDING")}
              >
                Unverified
              </Button>
              <Button
                size="sm"
                variant={statusFilter === "VERIFIED" ? "default" : "outline"}
                onClick={() => setStatusFilter("VERIFIED")}
              >
                Verified
              </Button>
              <Button
                size="sm"
                variant={statusFilter === "DISCARDED" ? "default" : "outline"}
                onClick={() => setStatusFilter("DISCARDED")}
              >
                Discarded
              </Button>
            </div>
          </div>

          <div className="h-8 w-px bg-border" />

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Level:</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={levelFilter === "all" ? "default" : "outline"}
                onClick={() => setLevelFilter("all")}
              >
                All
              </Button>
              <Button
                size="sm"
                variant={levelFilter === "1" ? "default" : "outline"}
                onClick={() => setLevelFilter("1")}
              >
                Level 1
              </Button>
              <Button
                size="sm"
                variant={levelFilter === "2" ? "default" : "outline"}
                onClick={() => setLevelFilter("2")}
              >
                Level 2
              </Button>
              <Button
                size="sm"
                variant={levelFilter === "3" ? "default" : "outline"}
                onClick={() => setLevelFilter("3")}
              >
                Level 3
              </Button>
              <Button
                size="sm"
                variant={levelFilter === "4" ? "default" : "outline"}
                onClick={() => setLevelFilter("4")}
              >
                Level 4
              </Button>
              <Button
                size="sm"
                variant={levelFilter === "5" ? "default" : "outline"}
                onClick={() => setLevelFilter("5")}
              >
                Level 5
              </Button>
            </div>
          </div>

          {pagination && (
            <>
              <div className="h-8 w-px bg-border" />
              <div className="ml-auto">
                <Badge variant="secondary">
                  Showing {questions.length} of {pagination.totalCount}
                </Badge>
              </div>
            </>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Loading questions...</p>
            </div>
          </div>
        ) : questions.length === 0 ? (
          <div className="mx-auto max-w-md rounded-md border bg-card p-6 text-center">
            <h3 className="text-lg font-semibold">No Questions Found</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              No {statusFilter === "all" ? "" : statusFilter.toLowerCase()} questions found for this topic
              {levelFilter !== "all" && ` at level ${levelFilter}`}.
            </p>
          </div>
        ) : (
          <>
            {/* Questions Table */}
            <div className="overflow-hidden rounded-md border">
              <div className="grid grid-cols-12 bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
                <div className="col-span-7">Question</div>
                <div className="col-span-3 text-right">Verified By</div>
                <div className="col-span-2 text-right">Level</div>
              </div>

              <ul role="list" className="divide-y">
                {questions.map((question) => (
                  <li
                    key={question.question_id}
                    className="cursor-pointer px-3 py-3 transition-colors hover:bg-muted/50"
                    onClick={() =>
                      router.push(
                        `/dashboard/${subject}/${encodeURIComponent(chapter)}/${encodeURIComponent(topic)}/${question.question_id}`
                      )
                    }
                  >
                    <div className="grid grid-cols-12 items-center gap-2" style={{ minHeight: '3rem' }}>
                      <div className="col-span-7">
                        <div className="line-clamp-2 text-sm leading-6">
                          <LatexRenderer content={question.question} />
                        </div>
                      </div>
                      <div className="col-span-3 flex items-center justify-end">
                        {question.status === "VERIFIED" && question.verifiedBy ? (
                          <span className="truncate text-sm text-muted-foreground">
                            {question.verifiedBy.name}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground/50">—</span>
                        )}
                      </div>
                      <div className="col-span-2 flex justify-end">
                        <Badge>L{question.difficulty_level}</Badge>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Pagination Controls */}
            {pagination && pagination.totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Page {pagination.page} of {pagination.totalPages}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={!pagination.hasPreviousPage}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={!pagination.hasNextPage}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
