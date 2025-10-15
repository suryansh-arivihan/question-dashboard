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
    const filterExpressionPending = "subject = :subject AND chapter_name = :chapter AND identified_topic = :topic AND (attribute_not_exists(#status) OR #status <> :verifiedStatus)";
    const expressionAttributeValues = {
      ":subject": subject.toLowerCase(),
      ":chapter": chapter.toLowerCase(),
      ":topic": topic.toLowerCase(),
      ":verifiedStatus": "VERIFIED",
    };
    const expressionAttributeNames = {
      "#status": "status",
    };

    // Helper function to scan all pages and count items
    const scanAndCount = async (tableName: string, filterExpr: string, attrValues: Record<string, any>, attrNames?: Record<string, string>) => {
      let count = 0;
      let lastEvaluatedKey: Record<string, any> | undefined = undefined;

      do {
        const scanParams: any = {
          TableName: tableName,
          FilterExpression: filterExpr,
          ExpressionAttributeValues: attrValues,
          Select: "COUNT",
          ExclusiveStartKey: lastEvaluatedKey,
        };

        if (attrNames) {
          scanParams.ExpressionAttributeNames = attrNames;
        }

        const command: ScanCommand = new ScanCommand(scanParams);

        const response = await docClient.send(command);
        count += response.Count || 0;
        lastEvaluatedKey = response.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      return count;
    };

    // Get counts by level for a table
    const getLevelCounts = async (tableName: string, isPendingTable: boolean) => {
      const counts = { level1: 0, level2: 0, level3: 0 };

      const baseFilter = isPendingTable ? filterExpressionPending : filterExpression;
      const attrNames = isPendingTable ? expressionAttributeNames : undefined;

      const [level1, level2, level3] = await Promise.all([
        scanAndCount(tableName, baseFilter + " AND difficulty_level = :level", {
          ...expressionAttributeValues,
          ":level": 1,
        }, attrNames),
        scanAndCount(tableName, baseFilter + " AND difficulty_level = :level", {
          ...expressionAttributeValues,
          ":level": 2,
        }, attrNames),
        scanAndCount(tableName, baseFilter + " AND difficulty_level = :level", {
          ...expressionAttributeValues,
          ":level": 3,
        }, attrNames),
      ]);

      counts.level1 = level1;
      counts.level2 = level2;
      counts.level3 = level3;

      return counts;
    };

    // Fetch total counts from both tables in parallel
    // For pending table, exclude questions with status=VERIFIED
    const [pendingTotal, verifiedTotal] = await Promise.all([
      scanAndCount(TABLES.QUESTIONS_PENDING, filterExpressionPending, expressionAttributeValues, expressionAttributeNames),
      scanAndCount(TABLES.QUESTIONS_VERIFIED, filterExpression, expressionAttributeValues),
    ]);

    const [pendingLevelCounts, verifiedLevelCounts] = await Promise.all([
      getLevelCounts(TABLES.QUESTIONS_PENDING, true),
      getLevelCounts(TABLES.QUESTIONS_VERIFIED, false),
    ]);

    const counts = {
      pending: {
        total: pendingTotal,
        ...pendingLevelCounts,
      },
      verified: {
        total: verifiedTotal,
        ...verifiedLevelCounts,
      },
      total: pendingTotal + verifiedTotal,
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
