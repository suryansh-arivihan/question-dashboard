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

    // Helper function to scan all pages from a table
    const scanAllPages = async (tableName: string) => {
      let allItems: any[] = [];
      let lastEvaluatedKey: Record<string, any> | undefined = undefined;

      do {
        const command: ScanCommand = new ScanCommand({
          TableName: tableName,
          FilterExpression: filterExpression,
          ExpressionAttributeValues: expressionAttributeValues,
          ExclusiveStartKey: lastEvaluatedKey,
        });

        const response = await docClient.send(command);
        allItems = allItems.concat(response.Items || []);
        lastEvaluatedKey = response.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      return allItems;
    };

    // Fetch from both tables
    const [pendingItems, verifiedItems] = await Promise.all([
      scanAllPages(TABLES.QUESTIONS_PENDING),
      scanAllPages(TABLES.QUESTIONS_VERIFIED),
    ]);

    // Check for duplicates by question_id
    const pendingIds = new Set(pendingItems.map(item => item.question_id));
    const verifiedIds = new Set(verifiedItems.map(item => item.question_id));

    const duplicateIds = Array.from(pendingIds).filter(id => verifiedIds.has(id));

    // Get detailed info about questions
    const pendingDetails = pendingItems.map(item => ({
      question_id: item.question_id,
      status: item.status,
      difficulty_level: item.difficulty_level,
      PrimaryKey: item.PrimaryKey,
    }));

    const verifiedDetails = verifiedItems.map(item => ({
      question_id: item.question_id,
      status: item.status,
      difficulty_level: item.difficulty_level,
      PrimaryKey: item.PrimaryKey,
      verified_at: item.verified_at,
    }));

    console.log("\n[Duplicate Check] Results for:", {
      subject: subject.toLowerCase(),
      chapter: chapter.toLowerCase(),
      topic: topic.toLowerCase(),
    });
    console.log("Pending table:", pendingDetails.length, "questions");
    console.log("Verified table:", verifiedDetails.length, "questions");
    console.log("Duplicate IDs:", duplicateIds);
    console.log("\nPending items detail:", JSON.stringify(pendingDetails, null, 2));
    console.log("\nVerified items detail:", JSON.stringify(verifiedDetails, null, 2));

    return NextResponse.json({
      pending: {
        count: pendingItems.length,
        items: pendingDetails,
      },
      verified: {
        count: verifiedItems.length,
        items: verifiedDetails,
      },
      duplicates: {
        count: duplicateIds.length,
        ids: duplicateIds,
      },
    });
  } catch (error) {
    console.error("[Check Duplicates API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to check for duplicates",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
