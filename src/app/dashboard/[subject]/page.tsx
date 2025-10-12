"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";
import { SUBJECT_CHAPTER_MAPPINGS } from "@/data/subject-chapter-mappings";
import { capitalize } from "@/lib/utils";

export default function SubjectPage() {
  const router = useRouter();
  const params = useParams();
  const subject = params.subject as string;
  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>({});

  const subjectData = SUBJECT_CHAPTER_MAPPINGS.find((s) => s.subject === subject);
  const chapters = subjectData?.chapters || [];

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
                <div className="col-span-8">Chapter</div>
                <div className="col-span-4 text-right">Actions</div>
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
