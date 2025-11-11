import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getQuestionsForTopic } from "@/lib/questions-cache";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const subject = searchParams.get("subject");
    const chapter = searchParams.get("chapter");
    const topic = searchParams.get("topic");
    const currentQuestionId = searchParams.get("questionId");
    const status = searchParams.get("status") || "all";
    const level = searchParams.get("level");

    if (!subject || !chapter || !topic || !currentQuestionId) {
      return NextResponse.json(
        { error: "Subject, chapter, topic, and questionId parameters are required" },
        { status: 400 }
      );
    }

    console.log("[Navigation API] Fetching navigation for:", {
      subject: subject.toLowerCase(),
      chapter: chapter.toLowerCase(),
      topic: topic.toLowerCase(),
      currentQuestionId,
      status,
      level: level || "all",
    });

    // Use cached question list
    const allQuestions = await getQuestionsForTopic(
      subject,
      chapter,
      topic,
      status,
      level || undefined
    );

    console.log(`[Navigation API] Found ${allQuestions.length} questions for ${subject}/${chapter}/${topic} (status: ${status}, level: ${level || 'all'})`);

    // Find current question index
    const currentIndex = allQuestions.findIndex(
      (q) => q.question_id === currentQuestionId
    );

    if (currentIndex === -1) {
      console.error(`[Navigation API] Current question ${currentQuestionId} not found in ${allQuestions.length} questions`);
      console.error(`[Navigation API] First few question IDs:`, allQuestions.slice(0, 5).map(q => q.question_id));
      return NextResponse.json(
        { error: "Current question not found" },
        { status: 404 }
      );
    }

    // Get previous and next question IDs
    const previousQuestion = currentIndex > 0 ? allQuestions[currentIndex - 1] : null;
    const nextQuestion = currentIndex < allQuestions.length - 1 ? allQuestions[currentIndex + 1] : null;

    console.log(`[Navigation API] Current: ${currentIndex + 1}/${allQuestions.length}, Has Previous: ${!!previousQuestion}, Has Next: ${!!nextQuestion}`);

    return NextResponse.json({
      previous: previousQuestion ? {
        questionId: previousQuestion.question_id,
        question: previousQuestion.question,
        difficulty_level: previousQuestion.difficulty_level,
      } : null,
      next: nextQuestion ? {
        questionId: nextQuestion.question_id,
        question: nextQuestion.question,
        difficulty_level: nextQuestion.difficulty_level,
      } : null,
      currentIndex: currentIndex + 1,
      totalQuestions: allQuestions.length,
    });
  } catch (error) {
    console.error("[Navigation API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch navigation data",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
