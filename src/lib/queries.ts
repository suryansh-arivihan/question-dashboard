import { ScanCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "./dynamodb";
import { RateLimiter, retryWithBackoff } from "./rate-limiter";
import {
  ExamChapterTopicMapping,
  QuestionRecord,
  SubjectStats,
  ChapterStats,
  TopicStats,
  GenerationQueueEntry,
} from "@/types";

// Create a rate limiter for DynamoDB operations (max 10 concurrent operations)
const rateLimiter = new RateLimiter(10);

/**
 * Get all topic mappings for NEET exam
 */
export async function getTopicMappings(
  subject?: string,
  chapter?: string
): Promise<ExamChapterTopicMapping[]> {
  const command: ScanCommand = new ScanCommand({
    TableName: TABLES.MAPPINGS,
    FilterExpression: subject
      ? chapter
        ? "exam = :exam AND subject = :subject AND chapter = :chapter"
        : "exam = :exam AND subject = :subject"
      : "exam = :exam",
    ExpressionAttributeValues: {
      ":exam": "neet",
      ...(subject && { ":subject": subject }),
      ...(chapter && { ":chapter": chapter }),
    },
  });

  const response = await docClient.send(command);
  return (response.Items || []) as ExamChapterTopicMapping[];
}

/**
 * Get question counts by status for a specific topic
 */
export async function getTopicQuestionCounts(
  subject: string,
  chapter: string,
  topic: string
): Promise<{ verified: number; pending: number; in_progress: number }> {
  const queryStart = Date.now();
  const normalizedTopic = topic.toLowerCase().trim();
  const normalizedChapter = chapter.toLowerCase().trim();
  const normalizedSubject = subject.toLowerCase().trim();

  try {
    // Scan PENDING and IN_PROGRESS questions with filters
    const pendingCommand = new ScanCommand({
      TableName: TABLES.QUESTIONS_PENDING,
      FilterExpression: "subject = :subject AND chapter_name = :chapter AND identified_topic = :topic",
      ExpressionAttributeValues: {
        ":subject": normalizedSubject,
        ":chapter": normalizedChapter,
        ":topic": normalizedTopic,
      },
    });

    const pendingResponse = await docClient.send(pendingCommand);
    const pendingQuestions = (pendingResponse.Items || []) as QuestionRecord[];

    const pending = pendingQuestions.filter((q) => q.status === "PENDING").length;
    const in_progress = pendingQuestions.filter(
      (q) => q.status === "IN_PROGRESS"
    ).length;

    // Scan VERIFIED questions with filters
    const verifiedCommand = new ScanCommand({
      TableName: TABLES.QUESTIONS_VERIFIED,
      FilterExpression: "subject = :subject AND chapter_name = :chapter AND identified_topic = :topic",
      ExpressionAttributeValues: {
        ":subject": normalizedSubject,
        ":chapter": normalizedChapter,
        ":topic": normalizedTopic,
      },
    });

    const verifiedResponse = await docClient.send(verifiedCommand);
    const verified = (verifiedResponse.Items || []).length;

    const duration = Date.now() - queryStart;
    if (duration > 1000) {
      console.log(`[getTopicQuestionCounts] SLOW QUERY (${duration}ms):`, { subject, chapter, topic });
    }

    return { verified, pending, in_progress };
  } catch (error) {
    console.error(`[getTopicQuestionCounts] Error for ${subject}/${chapter}/${topic}:`, error);
    // Return zeros on error to prevent complete failure
    return { verified: 0, pending: 0, in_progress: 0 };
  }
}

/**
 * Get aggregated stats for all subjects, chapters, and topics
 */
export async function getAggregatedStats(
  subjectFilter?: string,
  chapterFilter?: string
): Promise<SubjectStats[]> {
  const startTime = Date.now();
  console.log("[getAggregatedStats] Starting with filters:", { subjectFilter, chapterFilter });

  // Get all topic mappings
  console.log("[getAggregatedStats] Fetching topic mappings...");
  const mappings = await getTopicMappings(subjectFilter, chapterFilter);
  console.log("[getAggregatedStats] Found", mappings.length, "topic mappings in", Date.now() - startTime, "ms");

  if (mappings.length === 0) {
    console.log("[getAggregatedStats] No mappings found, returning empty array");
    return [];
  }

  // Group by subject, chapter, topic
  const subjectMap = new Map<string, Map<string, Map<string, ExamChapterTopicMapping>>>();

  for (const mapping of mappings) {
    if (!subjectMap.has(mapping.subject)) {
      subjectMap.set(mapping.subject, new Map());
    }
    const chapterMap = subjectMap.get(mapping.subject)!;

    if (!chapterMap.has(mapping.chapter)) {
      chapterMap.set(mapping.chapter, new Map());
    }
    const topicMap = chapterMap.get(mapping.chapter)!;

    topicMap.set(mapping.topic, mapping);
  }

  console.log("[getAggregatedStats] Grouped into", subjectMap.size, "subjects");

  // Build stats for each level
  const subjects: SubjectStats[] = [];

  for (const [subjectName, chapterMap] of subjectMap.entries()) {
    const chapters: ChapterStats[] = [];

    for (const [chapterName, topicMap] of chapterMap.entries()) {
      const topics: TopicStats[] = [];

      // Batch process all topics in parallel for this chapter
      console.log("[getAggregatedStats] Processing", topicMap.size, "topics for", subjectName, "/", chapterName);
      const topicQueries = Array.from(topicMap.entries()).map(async ([topicName, mapping]) => {
        const counts = await getTopicQuestionCounts(
          subjectName,
          chapterName,
          topicName
        );

        return {
          name: topicName,
          display_name: mapping.topic_display_name,
          total: counts.verified + counts.pending + counts.in_progress,
          verified: counts.verified,
          pending: counts.pending,
          in_progress: counts.in_progress,
        };
      });

      // Wait for all topic queries to complete in parallel
      const topicResults = await Promise.all(topicQueries);
      topics.push(...topicResults);

      // Aggregate chapter stats
      const chapterStats = topics.reduce(
        (acc, topic) => ({
          verified: acc.verified + topic.verified,
          pending: acc.pending + topic.pending,
          in_progress: acc.in_progress + topic.in_progress,
          total: acc.total + topic.total,
        }),
        { verified: 0, pending: 0, in_progress: 0, total: 0 }
      );

      chapters.push({
        name: chapterName,
        display_name: topics[0]?.display_name.split("–")[0].trim() || chapterName,
        total: chapterStats.total,
        verified: chapterStats.verified,
        pending: chapterStats.pending,
        in_progress: chapterStats.in_progress,
        topics,
      });
    }

    // Aggregate subject stats
    const subjectStats = chapters.reduce(
      (acc, chapter) => ({
        verified: acc.verified + chapter.verified,
        pending: acc.pending + chapter.pending,
        in_progress: acc.in_progress + chapter.in_progress,
        total: acc.total + chapter.total,
      }),
      { verified: 0, pending: 0, in_progress: 0, total: 0 }
    );

    subjects.push({
      name: subjectName,
      total: subjectStats.total,
      verified: subjectStats.verified,
      pending: subjectStats.pending,
      in_progress: subjectStats.in_progress,
      chapters,
    });
  }

  return subjects;
}

/**
 * Check if a topic is already queued
 */
export async function isTopicQueued(
  subject: string,
  chapter: string,
  topic: string
): Promise<boolean> {
  const command: ScanCommand = new ScanCommand({
    TableName: TABLES.GENERATION_QUEUE,
    FilterExpression:
      "subject = :subject AND chapter_name = :chapter AND topic_name = :topic AND #status = :status",
    ExpressionAttributeNames: {
      "#status": "status",
    },
    ExpressionAttributeValues: {
      ":subject": subject,
      ":chapter": chapter,
      ":topic": topic,
      ":status": "QUEUED",
    },
  });

  const response = await docClient.send(command);
  return (response.Items?.length || 0) > 0;
}

/**
 * Create a queue entry for topic generation
 */
export async function createQueueEntry(
  entry: GenerationQueueEntry
): Promise<void> {
  const command = new PutCommand({
    TableName: TABLES.GENERATION_QUEUE,
    Item: entry,
  });

  await docClient.send(command);
}

/**
 * Validate invite code
 */
export function validateInviteCode(code: string): boolean {
  const validCodes = (process.env.VALID_INVITE_CODES || "").split(",");
  return validCodes.includes(code);
}

/**
 * Check if user is admin
 */
export function isAdmin(email: string): boolean {
  const adminEmails = (process.env.ADMIN_EMAILS || "").split(",");
  return adminEmails.includes(email);
}
