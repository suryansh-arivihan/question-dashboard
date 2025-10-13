import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "@/lib/dynamodb";

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

    // Build filter expression
    let filterExpression = "subject = :subject AND chapter_name = :chapter AND identified_topic = :topic";
    const expressionAttributeValues: Record<string, any> = {
      ":subject": subject.toLowerCase(),
      ":chapter": chapter.toLowerCase(),
      ":topic": topic.toLowerCase(),
    };

    // Add level filter if specified
    if (level) {
      filterExpression += " AND difficulty_level = :level";
      expressionAttributeValues[":level"] = parseInt(level);
    }

    let allQuestions: any[] = [];

    if (status === "all") {
      // Fetch from both tables in parallel
      const [pendingResponse, verifiedResponse] = await Promise.all([
        docClient.send(
          new ScanCommand({
            TableName: TABLES.QUESTIONS_PENDING,
            FilterExpression: filterExpression,
            ExpressionAttributeValues: expressionAttributeValues,
          })
        ),
        docClient.send(
          new ScanCommand({
            TableName: TABLES.QUESTIONS_VERIFIED,
            FilterExpression: filterExpression,
            ExpressionAttributeValues: expressionAttributeValues,
          })
        ),
      ]);

      allQuestions = [
        ...(pendingResponse.Items || []),
        ...(verifiedResponse.Items || []),
      ];
    } else {
      // Fetch from specific table based on status
      const tableName = status === "VERIFIED"
        ? TABLES.QUESTIONS_VERIFIED
        : TABLES.QUESTIONS_PENDING;

      const command = new ScanCommand({
        TableName: tableName,
        FilterExpression: filterExpression,
        ExpressionAttributeValues: expressionAttributeValues,
      });

      const response = await docClient.send(command);
      allQuestions = response.Items || [];
    }

    // Sort questions by question_id to maintain consistent order
    allQuestions.sort((a, b) => a.question_id.localeCompare(b.question_id));

    // Find current question index
    const currentIndex = allQuestions.findIndex(
      (q) => q.question_id === currentQuestionId
    );

    if (currentIndex === -1) {
      return NextResponse.json(
        { error: "Current question not found" },
        { status: 404 }
      );
    }

    // Get previous and next question IDs
    const previousQuestion = currentIndex > 0 ? allQuestions[currentIndex - 1] : null;
    const nextQuestion = currentIndex < allQuestions.length - 1 ? allQuestions[currentIndex + 1] : null;

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
