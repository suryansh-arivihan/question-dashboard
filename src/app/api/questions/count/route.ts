import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ScanCommand, ScanCommandOutput } from "@aws-sdk/lib-dynamodb";
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

    // Step 1: Get verified counts from the mappings table (fast!)
    const mappingCommand = new ScanCommand({
      TableName: TABLES.MAPPINGS,
      FilterExpression: "exam = :exam AND subject = :subject AND chapter = :chapter AND topic = :topic",
      ExpressionAttributeValues: {
        ":exam": "neet",
        ":subject": subject.toLowerCase(),
        ":chapter": chapter.toLowerCase(),
        ":topic": topic.toLowerCase(),
      },
    });

    const mappingResponse = await docClient.send(mappingCommand);
    const mapping = mappingResponse.Items?.[0];

    // Extract verified counts from mapping (or default to 0)
    const verifiedLevelCounts = {
      level1: mapping?.VerifiedLevel1 || 0,
      level2: mapping?.VerifiedLevel2 || 0,
      level3: mapping?.VerifiedLevel3 || 0,
      level4: mapping?.VerifiedLevel4 || 0,
      level5: mapping?.VerifiedLevel5 || 0,
    };

    const verifiedTotal = verifiedLevelCounts.level1 + verifiedLevelCounts.level2 +
                          verifiedLevelCounts.level3 + verifiedLevelCounts.level4 +
                          verifiedLevelCounts.level5;

    // Step 2: Scan pending table ONCE and filter in memory by level
    const pendingCommand = new ScanCommand({
      TableName: TABLES.QUESTIONS_PENDING,
      FilterExpression: "subject = :subject AND chapter_name = :chapter AND identified_topic = :topic AND (attribute_not_exists(#status) OR (#status <> :verifiedStatus AND #status <> :discardedStatus))",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":subject": subject.toLowerCase(),
        ":chapter": chapter.toLowerCase(),
        ":topic": topic.toLowerCase(),
        ":verifiedStatus": "VERIFIED",
        ":discardedStatus": "DISCARDED",
      },
    });

    let pendingQuestions: any[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined = undefined;

    do {
      const command: ScanCommand = new ScanCommand({
        ...pendingCommand.input,
        ExclusiveStartKey: lastEvaluatedKey,
      });
      const response: ScanCommandOutput = await docClient.send(command);
      pendingQuestions.push(...(response.Items || []));
      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    // Count by level in memory
    const pendingLevelCounts = {
      level1: pendingQuestions.filter(q => q.difficulty_level === 1).length,
      level2: pendingQuestions.filter(q => q.difficulty_level === 2).length,
      level3: pendingQuestions.filter(q => q.difficulty_level === 3).length,
      level4: pendingQuestions.filter(q => q.difficulty_level === 4).length,
      level5: pendingQuestions.filter(q => q.difficulty_level === 5).length,
    };

    // Step 3: Scan for discarded ONCE and filter in memory
    const discardedCommand = new ScanCommand({
      TableName: TABLES.QUESTIONS_PENDING,
      FilterExpression: "subject = :subject AND chapter_name = :chapter AND identified_topic = :topic AND #status = :discardedStatus",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":subject": subject.toLowerCase(),
        ":chapter": chapter.toLowerCase(),
        ":topic": topic.toLowerCase(),
        ":discardedStatus": "DISCARDED",
      },
    });

    let discardedQuestions: any[] = [];
    lastEvaluatedKey = undefined;

    do {
      const command: ScanCommand = new ScanCommand({
        ...discardedCommand.input,
        ExclusiveStartKey: lastEvaluatedKey,
      });
      const response: ScanCommandOutput = await docClient.send(command);
      discardedQuestions.push(...(response.Items || []));
      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    // Count by level in memory
    const discardedLevelCounts = {
      level1: discardedQuestions.filter(q => q.difficulty_level === 1).length,
      level2: discardedQuestions.filter(q => q.difficulty_level === 2).length,
      level3: discardedQuestions.filter(q => q.difficulty_level === 3).length,
      level4: discardedQuestions.filter(q => q.difficulty_level === 4).length,
      level5: discardedQuestions.filter(q => q.difficulty_level === 5).length,
    };

    const counts = {
      pending: {
        total: pendingQuestions.length,
        ...pendingLevelCounts,
      },
      verified: {
        total: verifiedTotal,
        ...verifiedLevelCounts,
      },
      discarded: {
        total: discardedQuestions.length,
        ...discardedLevelCounts,
      },
      total: pendingQuestions.length + verifiedTotal,
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
