import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "@/lib/dynamodb";

// In-memory cache for question lists
interface CachedQuestionList {
  questions: any[];
  timestamp: number;
}

const cache = new Map<string, CachedQuestionList>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(
  subject: string,
  chapter: string,
  topic: string,
  status: string,
  level?: string
): string {
  return `${subject}:${chapter}:${topic}:${status}:${level || "all"}`;
}

function getFromCache(key: string): any[] | null {
  const cached = cache.get(key);
  if (!cached) return null;

  const now = Date.now();
  if (now - cached.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }

  return cached.questions;
}

function setCache(key: string, questions: any[]): void {
  cache.set(key, { questions, timestamp: Date.now() });
}

// Helper function to scan all pages from a table
async function scanAllPages(
  tableName: string,
  filterType: "default" | "pending" | "discarded",
  baseAttributeValues: Record<string, any>,
  expressionAttributeNames: Record<string, string>,
  filterExpression: string,
  filterExpressionPending: string,
  filterExpressionDiscarded: string
) {
  let allItems: any[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined = undefined;

  // Create attribute values based on filter type
  let attrValues = baseAttributeValues;
  let filterExpr = filterExpression;
  let needsAttrNames = false;

  if (filterType === "pending") {
    attrValues = {
      ...baseAttributeValues,
      ":verifiedStatus": "VERIFIED",
      ":discardedStatus": "DISCARDED",
    };
    filterExpr = filterExpressionPending;
    needsAttrNames = true;
  } else if (filterType === "discarded") {
    attrValues = { ...baseAttributeValues, ":discardedStatus": "DISCARDED" };
    filterExpr = filterExpressionDiscarded;
    needsAttrNames = true;
  }

  const scanParams: any = {
    TableName: tableName,
    FilterExpression: filterExpr,
    ExpressionAttributeValues: attrValues,
    ExclusiveStartKey: undefined,
  };

  // Add ExpressionAttributeNames only when status filter is used
  if (needsAttrNames) {
    scanParams.ExpressionAttributeNames = expressionAttributeNames;
  }

  do {
    scanParams.ExclusiveStartKey = lastEvaluatedKey;
    const command: ScanCommand = new ScanCommand(scanParams);

    const response = await docClient.send(command);
    allItems = allItems.concat(response.Items || []);
    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return allItems;
}

/**
 * Fetches and caches all questions for a given topic with filters
 * Returns a sorted, deduplicated list of questions
 */
export async function getQuestionsForTopic(
  subject: string,
  chapter: string,
  topic: string,
  status: string,
  level?: string
): Promise<any[]> {
  // Normalize inputs by trimming whitespace
  const normalizedSubject = subject.trim();
  const normalizedChapter = chapter.trim();
  const normalizedTopic = topic.trim();

  const cacheKey = getCacheKey(normalizedSubject, normalizedChapter, normalizedTopic, status, level);

  // Check cache first
  const cachedQuestions = getFromCache(cacheKey);
  if (cachedQuestions) {
    console.log(`[Questions Cache] Cache HIT for ${cacheKey}`);
    return cachedQuestions;
  }

  console.log(`[Questions Cache] Cache MISS for ${cacheKey}, fetching from DB...`);

  // Build filter expressions
  let filterExpression =
    "subject = :subject AND chapter_name = :chapter AND identified_topic = :topic";
  let filterExpressionPending =
    "subject = :subject AND chapter_name = :chapter AND identified_topic = :topic AND (attribute_not_exists(#status) OR (#status <> :verifiedStatus AND #status <> :discardedStatus))";
  let filterExpressionDiscarded =
    "subject = :subject AND chapter_name = :chapter AND identified_topic = :topic AND #status = :discardedStatus";

  const baseAttributeValues: Record<string, any> = {
    ":subject": normalizedSubject.toLowerCase(),
    ":chapter": normalizedChapter.toLowerCase(),
    ":topic": normalizedTopic.toLowerCase(),
  };

  const expressionAttributeNames = {
    "#status": "status",
  };

  // Add level filter if specified
  if (level) {
    filterExpression += " AND difficulty_level = :level";
    filterExpressionPending += " AND difficulty_level = :level";
    filterExpressionDiscarded += " AND difficulty_level = :level";
    baseAttributeValues[":level"] = parseInt(level);
  }

  let allQuestions: any[] = [];

  if (status === "all") {
    // Fetch from both tables in parallel
    const [pendingItems, verifiedItems] = await Promise.all([
      scanAllPages(
        TABLES.QUESTIONS_PENDING,
        "pending",
        baseAttributeValues,
        expressionAttributeNames,
        filterExpression,
        filterExpressionPending,
        filterExpressionDiscarded
      ),
      scanAllPages(
        TABLES.QUESTIONS_VERIFIED,
        "default",
        baseAttributeValues,
        expressionAttributeNames,
        filterExpression,
        filterExpressionPending,
        filterExpressionDiscarded
      ),
    ]);

    allQuestions = [...pendingItems, ...verifiedItems];
  } else if (status === "VERIFIED") {
    allQuestions = await scanAllPages(
      TABLES.QUESTIONS_VERIFIED,
      "default",
      baseAttributeValues,
      expressionAttributeNames,
      filterExpression,
      filterExpressionPending,
      filterExpressionDiscarded
    );
  } else if (status === "DISCARDED") {
    allQuestions = await scanAllPages(
      TABLES.QUESTIONS_PENDING,
      "discarded",
      baseAttributeValues,
      expressionAttributeNames,
      filterExpression,
      filterExpressionPending,
      filterExpressionDiscarded
    );
  } else {
    // PENDING
    allQuestions = await scanAllPages(
      TABLES.QUESTIONS_PENDING,
      "pending",
      baseAttributeValues,
      expressionAttributeNames,
      filterExpression,
      filterExpressionPending,
      filterExpressionDiscarded
    );
  }

  // Deduplicate questions by question_id
  const beforeDeduplication = allQuestions.length;
  const uniqueQuestionsMap = new Map();
  allQuestions.forEach((q) => {
    if (!uniqueQuestionsMap.has(q.question_id)) {
      uniqueQuestionsMap.set(q.question_id, q);
    }
  });
  allQuestions = Array.from(uniqueQuestionsMap.values());

  if (beforeDeduplication !== allQuestions.length) {
    console.log(
      `[Questions Cache] Removed ${
        beforeDeduplication - allQuestions.length
      } duplicate questions`
    );
  }

  // Sort questions by question_id to maintain consistent order
  allQuestions.sort((a, b) => a.question_id.localeCompare(b.question_id));

  console.log(
    `[Questions Cache] Cached ${allQuestions.length} questions for ${cacheKey}`
  );

  // Cache the result
  setCache(cacheKey, allQuestions);

  return allQuestions;
}

/**
 * Clears the cache for a specific topic or all cache
 */
export function clearCache(
  subject?: string,
  chapter?: string,
  topic?: string
): void {
  if (subject && chapter && topic) {
    // Clear cache for specific topic (all status/level combinations)
    const keysToDelete: string[] = [];
    cache.forEach((_, key) => {
      if (key.startsWith(`${subject}:${chapter}:${topic}:`)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach((key) => cache.delete(key));
    console.log(`[Questions Cache] Cleared ${keysToDelete.length} cache entries for ${subject}/${chapter}/${topic}`);
  } else {
    // Clear all cache
    cache.clear();
    console.log("[Questions Cache] Cleared all cache");
  }
}
