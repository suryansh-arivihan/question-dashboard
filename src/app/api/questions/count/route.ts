import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "@/lib/dynamodb";

export const dynamic = "force-dynamic";

// Simple in-memory cache with expiration
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(subject: string, chapter: string, topic: string): string {
  return `${subject}:${chapter}:${topic}`;
}

function getFromCache(key: string): any | null {
  const cached = cache.get(key);
  if (!cached) return null;

  const now = Date.now();
  if (now - cached.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }

  return cached.data;
}

function setCache(key: string, data: any): void {
  cache.set(key, { data, timestamp: Date.now() });
}

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

    // Check cache first
    const cacheKey = getCacheKey(subject, chapter, topic);
    const cachedData = getFromCache(cacheKey);
    if (cachedData) {
      console.log(`[Question Count API] Returning cached data for ${subject}/${chapter}/${topic}`);
      return NextResponse.json(cachedData);
    }

    const filterExpression = "subject = :subject AND chapter_name = :chapter AND identified_topic = :topic";
    // For pending table, exclude VERIFIED and DISCARDED questions
    const filterExpressionPending = "subject = :subject AND chapter_name = :chapter AND identified_topic = :topic AND (attribute_not_exists(#status) OR (#status <> :verifiedStatus AND #status <> :discardedStatus))";
    // For discarded questions only
    const filterExpressionDiscarded = "subject = :subject AND chapter_name = :chapter AND identified_topic = :topic AND #status = :discardedStatus";

    const baseAttributeValues: Record<string, any> = {
      ":subject": subject.toLowerCase(),
      ":chapter": chapter.toLowerCase(),
      ":topic": topic.toLowerCase(),
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
    const getLevelCounts = async (tableName: string, filterType: "default" | "pending" | "discarded" = "default") => {
      const counts = { level1: 0, level2: 0, level3: 0, level4: 0, level5: 0 };

      let baseFilter = filterExpression;
      let attrNames = undefined;

      if (filterType === "pending") {
        baseFilter = filterExpressionPending;
        attrNames = expressionAttributeNames;
      } else if (filterType === "discarded") {
        baseFilter = filterExpressionDiscarded;
        attrNames = expressionAttributeNames;
      }

      // Create attribute values based on filter type
      const createAttrValues = (level: number) => {
        if (filterType === "pending") {
          return { ...baseAttributeValues, ":level": level, ":verifiedStatus": "VERIFIED", ":discardedStatus": "DISCARDED" };
        } else if (filterType === "discarded") {
          return { ...baseAttributeValues, ":level": level, ":discardedStatus": "DISCARDED" };
        }
        return { ...baseAttributeValues, ":level": level };
      };

      const [level1, level2, level3, level4, level5] = await Promise.all([
        scanAndCount(tableName, baseFilter + " AND difficulty_level = :level", createAttrValues(1), attrNames),
        scanAndCount(tableName, baseFilter + " AND difficulty_level = :level", createAttrValues(2), attrNames),
        scanAndCount(tableName, baseFilter + " AND difficulty_level = :level", createAttrValues(3), attrNames),
        scanAndCount(tableName, baseFilter + " AND difficulty_level = :level", createAttrValues(4), attrNames),
        scanAndCount(tableName, baseFilter + " AND difficulty_level = :level", createAttrValues(5), attrNames),
      ]);

      counts.level1 = level1;
      counts.level2 = level2;
      counts.level3 = level3;
      counts.level4 = level4;
      counts.level5 = level5;

      return counts;
    };

    // Fetch total counts from all categories in parallel
    const [pendingTotal, verifiedTotal, discardedTotal] = await Promise.all([
      scanAndCount(TABLES.QUESTIONS_PENDING, filterExpressionPending, { ...baseAttributeValues, ":verifiedStatus": "VERIFIED", ":discardedStatus": "DISCARDED" }, expressionAttributeNames),
      scanAndCount(TABLES.QUESTIONS_VERIFIED, filterExpression, baseAttributeValues),
      scanAndCount(TABLES.QUESTIONS_PENDING, filterExpressionDiscarded, { ...baseAttributeValues, ":discardedStatus": "DISCARDED" }, expressionAttributeNames),
    ]);

    const [pendingLevelCounts, verifiedLevelCounts, discardedLevelCounts] = await Promise.all([
      getLevelCounts(TABLES.QUESTIONS_PENDING, "pending"),
      getLevelCounts(TABLES.QUESTIONS_VERIFIED, "default"),
      getLevelCounts(TABLES.QUESTIONS_PENDING, "discarded"),
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
      discarded: {
        total: discardedTotal,
        ...discardedLevelCounts,
      },
      total: pendingTotal + verifiedTotal,
    };

    console.log(`[Question Count API] Counts for ${subject}/${chapter}/${topic}:`, counts);

    // Cache the result
    setCache(cacheKey, counts);

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
