"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LatexRenderer } from "@/components/LatexRenderer";
import { capitalize } from "@/lib/utils";
import { Loader2, CheckCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";
import Link from "next/link";

interface Option {
  label: string;
  text: string;
  image?: string;
  description?: string;
}

interface Question {
  PrimaryKey: string;
  question_id: string;
  question: string;
  question_images?: string[];
  question_image_description?: string;
  options: Option[];
  answer: string;
  solution?: string;
  solution_images?: string[];
  solution_image_descriptions?: string[];
  difficulty_level: number;
  status: string;
  subject: string;
  chapter_name: string;
  identified_topic: string;
  exam: string;
}

interface NavigationData {
  previous: {
    questionId: string;
    question: string;
    difficulty_level: number;
  } | null;
  next: {
    questionId: string;
    question: string;
    difficulty_level: number;
  } | null;
  currentIndex: number;
  totalQuestions: number;
}

export default function QuestionReviewPage() {
  const router = useRouter();
  const params = useParams();
  const subject = params.subject as string;
  const chapter = decodeURIComponent(params.chapter as string);
  const topic = decodeURIComponent(params.topic as string);
  const questionId = params.questionId as string;

  const [question, setQuestion] = useState<Question | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [navigation, setNavigation] = useState<NavigationData | null>(null);

  useEffect(() => {
    fetchQuestion();
    fetchNavigation();
  }, [subject, chapter, topic, questionId]);

  const fetchQuestion = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/questions/${questionId}`);

      if (!response.ok) {
        throw new Error("Question not found");
      }

      const data = await response.json();
      setQuestion(data.question);
    } catch (err) {
      console.error("Error fetching question:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const fetchNavigation = async () => {
    try {
      const response = await fetch(
        `/api/questions/navigation?subject=${subject}&chapter=${chapter}&topic=${topic}&questionId=${questionId}&status=all`
      );

      if (response.ok) {
        const data = await response.json();
        setNavigation(data);
      }
    } catch (err) {
      console.error("Error fetching navigation:", err);
    }
  };

  const handleVerify = async () => {
    if (!question) return;

    setVerifying(true);
    try {
      const response = await fetch("/api/questions/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          primaryKey: question.PrimaryKey,
          questionId: question.question_id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to verify question");
      }

      toast.success("Question verified successfully!");
      // Navigate back to questions list
      router.push(
        `/dashboard/${subject}/${encodeURIComponent(chapter)}/${encodeURIComponent(topic)}`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to verify question"
      );
    } finally {
      setVerifying(false);
    }
  };

  const goBack = () =>
    router.push(
      `/dashboard/${subject}/${encodeURIComponent(chapter)}/${encodeURIComponent(topic)}`
    );

  if (loading) {
    return (
      <main className="min-h-dvh bg-background text-foreground">
        <div className="flex min-h-dvh items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Loading question...</p>
          </div>
        </div>
      </main>
    );
  }

  if (error || !question) {
    return (
      <main className="min-h-dvh bg-background text-foreground">
        <div className="flex min-h-dvh items-center justify-center">
          <div className="mx-auto max-w-md rounded-md border bg-card p-6 text-center">
            <h3 className="text-lg font-semibold">Error</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {error || "Question not found"}
            </p>
            <div className="mt-4">
              <Button variant="outline" onClick={goBack}>
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
      <div className="mx-auto w-full max-w-5xl px-4 py-8 md:py-10">
        {/* Prefetch links for adjacent questions */}
        {navigation?.previous && (
          <Link
            href={`/dashboard/${subject}/${encodeURIComponent(chapter)}/${encodeURIComponent(topic)}/${navigation.previous.questionId}`}
            prefetch={true}
            style={{ display: 'none' }}
            aria-hidden="true"
          />
        )}
        {navigation?.next && (
          <Link
            href={`/dashboard/${subject}/${encodeURIComponent(chapter)}/${encodeURIComponent(topic)}/${navigation.next.questionId}`}
            prefetch={true}
            style={{ display: 'none' }}
            aria-hidden="true"
          />
        )}

        <header className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              className="rounded-md px-3 py-1"
              onClick={goBack}
              aria-label="Go back"
            >
              ← Back
            </Button>
            {navigation && (
              <div className="text-sm text-muted-foreground">
                Question {navigation.currentIndex} of {navigation.totalQuestions}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-balance text-2xl font-semibold tracking-tight">
                Question Review
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {capitalize(topic)} • {capitalize(subject)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge>Level {question.difficulty_level}</Badge>
              <Badge variant={question.status === "VERIFIED" ? "verified" : "pending"}>
                {question.status}
              </Badge>
            </div>
          </div>
        </header>

        <div className="space-y-6">
          {/* Question */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Question</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <LatexRenderer
                content={question.question}
                className="text-base leading-relaxed"
              />
              {question.question_images && question.question_images.length > 0 && (
                <div className="space-y-2">
                  {question.question_images.map((imageUrl, idx) => (
                    <div key={idx} className="rounded-lg border p-2">
                      <Image
                        src={imageUrl}
                        alt={`Question image ${idx + 1}`}
                        width={400}
                        height={300}
                        className="rounded"
                      />
                      {question.question_image_description && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {question.question_image_description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Options */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Options</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {question.options.map((option) => (
                  <div
                    key={option.label}
                    className={`rounded-lg border-2 p-4 transition-colors ${
                      option.label === question.answer
                        ? "border-[#26c6da] bg-[#26c6da]/10"
                        : "border-border"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Badge
                        variant={option.label === question.answer ? "verified" : "default"}
                        className={`mt-0.5 ${
                          option.label === question.answer
                            ? "bg-[#26c6da] hover:bg-[#26c6da]/90 border-[#26c6da]"
                            : ""
                        }`}
                      >
                        {option.label}
                      </Badge>
                      <div className="flex-1">
                        <LatexRenderer content={option.text} />
                        {option.image && (
                          <div className="mt-2">
                            <Image
                              src={option.image}
                              alt={`Option ${option.label}`}
                              width={200}
                              height={150}
                              className="rounded"
                            />
                          </div>
                        )}
                        {option.description && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {option.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Solution */}
          {question.solution && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Solution</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <LatexRenderer
                  content={question.solution}
                  className="text-base leading-relaxed"
                />
                {question.solution_images && question.solution_images.length > 0 && (
                  <div className="space-y-2">
                    {question.solution_images.map((imageUrl, idx) => (
                      <div key={idx} className="rounded-lg border p-2">
                        <Image
                          src={imageUrl}
                          alt={`Solution image ${idx + 1}`}
                          width={400}
                          height={300}
                          className="rounded"
                        />
                        {question.solution_image_descriptions?.[idx] && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {question.solution_image_descriptions[idx]}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Navigation and Action Buttons */}
          <div className="flex items-center justify-between gap-4">
            {/* Previous Button */}
            <div className="flex-1">
              {navigation?.previous ? (
                <Link
                  href={`/dashboard/${subject}/${encodeURIComponent(chapter)}/${encodeURIComponent(topic)}/${navigation.previous.questionId}`}
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span className="truncate">Previous Question</span>
                  </Button>
                </Link>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  className="w-full justify-start"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Previous Question</span>
                </Button>
              )}
            </div>

            {/* Verify Button (if pending) */}
            {question.status === "PENDING" && (
              <Button
                onClick={handleVerify}
                disabled={verifying}
                className="min-w-[140px]"
              >
                {verifying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    Verify Question
                  </>
                )}
              </Button>
            )}

            {/* Next Button */}
            <div className="flex-1">
              {navigation?.next ? (
                <Link
                  href={`/dashboard/${subject}/${encodeURIComponent(chapter)}/${encodeURIComponent(topic)}/${navigation.next.questionId}`}
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-end"
                  >
                    <span className="truncate">Next Question</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  className="w-full justify-end"
                >
                  <span>Next Question</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
