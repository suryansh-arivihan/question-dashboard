"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SUBJECTS } from "@/data/subject-chapter-mappings";
import { capitalize } from "@/lib/utils";

const SUBJECT_DESCRIPTIONS: Record<string, string> = {
  physics: "Kinematics, dynamics, and waves",
  chemistry: "Atoms, molecules, and reactions",
  biology: "Life processes and systems",
};

export default function DashboardPage() {
  const router = useRouter();

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 md:py-10">
        <header className="mb-8">
          <h1 className="text-balance text-2xl font-semibold tracking-tight">Subjects</h1>
        </header>

        <section aria-labelledby="subjects-title">
          <h2 id="subjects-title" className="sr-only">
            Subjects
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {SUBJECTS.map((subject) => (
              <Card
                key={subject}
                className="hover:border-primary focus-within:border-primary transition-colors"
              >
                <CardHeader>
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
                    {capitalize(subject).slice(0, 1)}
                  </div>
                  <CardTitle className="mt-3">{capitalize(subject)}</CardTitle>
                  <CardDescription className="text-pretty leading-relaxed">
                    {SUBJECT_DESCRIPTIONS[subject] || "Explore this subject"}
                  </CardDescription>
                </CardHeader>
                <CardFooter className="pt-0">
                  <Button
                    className="w-full"
                    onClick={() => router.push(`/dashboard/${subject}`)}
                  >
                    Explore {capitalize(subject)}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
