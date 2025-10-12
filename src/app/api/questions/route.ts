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
    const status = searchParams.get("status") || "all"; // all, PENDING, or VERIFIED
    const level = searchParams.get("level"); // 1, 2, or 3
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "7");

    if (!subject || !chapter || !topic) {
      return NextResponse.json(
        { error: "Subject, chapter, and topic parameters are required" },
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

    // Pagination
    const totalCount = allQuestions.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedQuestions = allQuestions.slice(startIndex, endIndex);

    console.log(`[Questions API] Page ${page}/${totalPages}: ${paginatedQuestions.length} of ${totalCount} questions for ${subject}/${chapter}/${topic} (status: ${status}, level: ${level || 'all'})`);

    return NextResponse.json({
      questions: paginatedQuestions,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      }
    });
  } catch (error) {
    console.error("[Questions API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch questions",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
