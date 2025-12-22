import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

export const dynamic = "force-dynamic";

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const VERIFIED_QUESTIONS_TABLE = "NEETAdaptiveQuestionGeneratorDataVerified";

async function getQuestionCount(
  subject: string,
  chapter: string,
  topic: string,
  level: number
): Promise<number> {
  let count = 0;
  let lastEvaluatedKey: Record<string, any> | undefined = undefined;

  // Normalize inputs by trimming whitespace
  const normalizedSubject = subject.trim().toLowerCase();
  const normalizedChapter = chapter.trim().toLowerCase();
  const normalizedTopic = topic.trim().toLowerCase();

  try {
    do {
      const command: ScanCommand = new ScanCommand({
        TableName: VERIFIED_QUESTIONS_TABLE,
        FilterExpression:
          "subject = :subject AND chapter_name = :chapter AND identified_topic = :topic AND difficulty_level = :level",
        ExpressionAttributeValues: {
          ":subject": { S: normalizedSubject },
          ":chapter": { S: normalizedChapter },
          ":topic": { S: normalizedTopic },
          ":level": { N: level.toString() },
        },
        Select: "COUNT",
        ExclusiveStartKey: lastEvaluatedKey,
      });

      const response = await dynamoClient.send(command);
      count += response.Count || 0;
      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return count;
  } catch (error) {
    console.error(`Error counting questions for ${topic} level ${level}:`, error);
    return 0;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { subject, chapter, numTests, testData, topicDisplayNames = {} } = body;

    if (!subject || !chapter || !numTests || !testData) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    // Calculate total needed per topic-level across all tests
    const requirements: Record<string, Record<number, number>> = {};
    const insufficientTopics: Array<{
      topic: string;
      topicDisplay: string;
      level: number;
      needed: number;
      available: number;
    }> = [];

    // Calculate requirements
    for (const topic of Object.keys(testData)) {
      requirements[topic] = { 1: 0, 2: 0, 3: 0 };

      for (let testNum = 1; testNum <= numTests; testNum++) {
        for (const level of [1, 2, 3]) {
          requirements[topic][level] += testData[topic][testNum]?.[level] || 0;
        }
      }
    }

    // Check availability for each topic-level
    for (const topic of Object.keys(requirements)) {
      for (const level of [1, 2, 3]) {
        const needed = requirements[topic][level];

        if (needed > 0) {
          const available = await getQuestionCount(subject, chapter, topic, level);

          if (available < needed) {
            insufficientTopics.push({
              topic,
              topicDisplay: topicDisplayNames[topic] || topic,
              level,
              needed,
              available,
            });
          }
        }
      }
    }

    if (insufficientTopics.length > 0) {
      return NextResponse.json(
        {
          valid: false,
          insufficientTopics,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        valid: true,
        message: "All topics have sufficient questions",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error validating test configuration:", error);
    return NextResponse.json(
      {
        error: "Failed to validate test configuration",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
