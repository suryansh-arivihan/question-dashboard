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

    if (!subject || !chapter || !topic) {
      return NextResponse.json(
        { error: "Subject, chapter, and topic parameters are required" },
        { status: 400 }
      );
    }

    const filterExpression = "subject = :subject AND chapter_name = :chapter AND identified_topic = :topic";
    const expressionAttributeValues = {
      ":subject": subject.toLowerCase(),
      ":chapter": chapter.toLowerCase(),
      ":topic": topic.toLowerCase(),
    };

    // Fetch counts from both tables in parallel
    const [pendingResponse, verifiedResponse] = await Promise.all([
      docClient.send(
        new ScanCommand({
          TableName: TABLES.QUESTIONS_PENDING,
          FilterExpression: filterExpression,
          ExpressionAttributeValues: expressionAttributeValues,
          Select: "COUNT",
        })
      ),
      docClient.send(
        new ScanCommand({
          TableName: TABLES.QUESTIONS_VERIFIED,
          FilterExpression: filterExpression,
          ExpressionAttributeValues: expressionAttributeValues,
          Select: "COUNT",
        })
      ),
    ]);

    // Get counts by level for both tables
    const getLevelCounts = async (tableName: string) => {
      const counts = { level1: 0, level2: 0, level3: 0 };

      for (let level = 1; level <= 3; level++) {
        const response = await docClient.send(
          new ScanCommand({
            TableName: tableName,
            FilterExpression: filterExpression + " AND difficulty_level = :level",
            ExpressionAttributeValues: {
              ...expressionAttributeValues,
              ":level": level,
            },
            Select: "COUNT",
          })
        );

        if (level === 1) counts.level1 = response.Count || 0;
        if (level === 2) counts.level2 = response.Count || 0;
        if (level === 3) counts.level3 = response.Count || 0;
      }

      return counts;
    };

    const [pendingLevelCounts, verifiedLevelCounts] = await Promise.all([
      getLevelCounts(TABLES.QUESTIONS_PENDING),
      getLevelCounts(TABLES.QUESTIONS_VERIFIED),
    ]);

    const counts = {
      pending: {
        total: pendingResponse.Count || 0,
        ...pendingLevelCounts,
      },
      verified: {
        total: verifiedResponse.Count || 0,
        ...verifiedLevelCounts,
      },
      total: (pendingResponse.Count || 0) + (verifiedResponse.Count || 0),
    };

    console.log(`[Question Count API] Counts for ${subject}/${chapter}/${topic}:`, counts);

    return NextResponse.json(counts);
  } catch (error) {
    console.error("[Question Count API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch question counts",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
