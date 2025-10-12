import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "@/lib/dynamodb";

export const dynamic = "force-dynamic";

interface TopicWithStats {
  name: string;
  display_name: string;
  verified: number;
  pending: number;
  in_progress: number;
  total: number;
  verifiedLevel1?: number;
  verifiedLevel2?: number;
  verifiedLevel3?: number;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    console.log("[Topics API] Request started");

    // Verify user is authenticated
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const subject = searchParams.get("subject");
    const chapter = searchParams.get("chapter");

    if (!subject || !chapter) {
      return NextResponse.json(
        { error: "Both subject and chapter parameters are required" },
        { status: 400 }
      );
    }

    console.log("[Topics API] Fetching topics for:", { subject, chapter });

    // First, get all topics for this chapter from mappings
    const mappingsCommand = new ScanCommand({
      TableName: TABLES.MAPPINGS,
      FilterExpression: "exam = :exam AND subject = :subject AND chapter = :chapter",
      ExpressionAttributeValues: {
        ":exam": "neet",
        ":subject": subject.toLowerCase(),
        ":chapter": chapter.toLowerCase(),
      },
    });

    const mappingsResponse = await docClient.send(mappingsCommand);
    const mappings = mappingsResponse.Items || [];
    console.log("[Topics API] Found", mappings.length, "topics in mappings");

    if (mappings.length === 0) {
      return NextResponse.json({ topics: [] });
    }

    // Now get question counts for all topics in parallel
    // Fetch all questions for this subject/chapter in one query
    const pendingCommand = new ScanCommand({
      TableName: TABLES.QUESTIONS_PENDING,
      FilterExpression: "subject = :subject AND chapter_name = :chapter",
      ExpressionAttributeValues: {
        ":subject": subject.toLowerCase(),
        ":chapter": chapter.toLowerCase(),
      },
    });

    const verifiedCommand = new ScanCommand({
      TableName: TABLES.QUESTIONS_VERIFIED,
      FilterExpression: "subject = :subject AND chapter_name = :chapter",
      ExpressionAttributeValues: {
        ":subject": subject.toLowerCase(),
        ":chapter": chapter.toLowerCase(),
      },
    });

    // Run both queries in parallel
    const [pendingResponse, verifiedResponse] = await Promise.all([
      docClient.send(pendingCommand),
      docClient.send(verifiedCommand),
    ]);

    const pendingQuestions = pendingResponse.Items || [];
    const verifiedQuestions = verifiedResponse.Items || [];

    console.log("[Topics API] Found questions - Pending:", pendingQuestions.length, "Verified:", verifiedQuestions.length);

    // Group questions by topic
    const questionsByTopic = new Map<string, { pending: number; in_progress: number; verified: number }>();

    // Process pending/in-progress questions
    for (const question of pendingQuestions) {
      const topic = question.identified_topic?.toLowerCase().trim();
      if (!topic) continue;

      if (!questionsByTopic.has(topic)) {
        questionsByTopic.set(topic, { pending: 0, in_progress: 0, verified: 0 });
      }

      const counts = questionsByTopic.get(topic)!;
      if (question.status === "PENDING") {
        counts.pending++;
      } else if (question.status === "IN_PROGRESS") {
        counts.in_progress++;
      }
    }

    // Process verified questions
    for (const question of verifiedQuestions) {
      const topic = question.identified_topic?.toLowerCase().trim();
      if (!topic) continue;

      if (!questionsByTopic.has(topic)) {
        questionsByTopic.set(topic, { pending: 0, in_progress: 0, verified: 0 });
      }

      questionsByTopic.get(topic)!.verified++;
    }

    // Build the response
    const topics: TopicWithStats[] = mappings.map((mapping: any) => {
      const topicName = mapping.topic.toLowerCase().trim();
      const counts = questionsByTopic.get(topicName) || { pending: 0, in_progress: 0, verified: 0 };

      return {
        name: mapping.topic,
        display_name: mapping.topic_display_name,
        verified: counts.verified,
        pending: counts.pending,
        in_progress: counts.in_progress,
        total: counts.verified + counts.pending + counts.in_progress,
        verifiedLevel1: mapping.VerifiedLevel1 || 0,
        verifiedLevel2: mapping.VerifiedLevel2 || 0,
        verifiedLevel3: mapping.VerifiedLevel3 || 0,
      };
    });

    console.log("[Topics API] Processed", topics.length, "topics in", Date.now() - startTime, "ms");

    return NextResponse.json({ topics });
  } catch (error) {
    console.error("[Topics API] Error after", Date.now() - startTime, "ms:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch topics",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
