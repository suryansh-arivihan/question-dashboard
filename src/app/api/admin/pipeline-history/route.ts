import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "@/lib/dynamodb";
import { GenerationQueueEntry } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // Verify user is authenticated
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get topicId from query params
    const searchParams = request.nextUrl.searchParams;
    const topicId = searchParams.get("topicId");

    if (!topicId) {
      return NextResponse.json(
        { error: "Missing required parameter: topicId" },
        { status: 400 }
      );
    }

    // Scan DynamoDB for all entries with this topic_id
    // Note: Using scan with filter expression. For better performance,
    // consider creating a GSI on topic_id in the future
    const scanCommand = new ScanCommand({
      TableName: TABLES.GENERATION_QUEUE,
      FilterExpression: "topic_id = :topicId",
      ExpressionAttributeValues: {
        ":topicId": topicId,
      },
    });

    const result = await docClient.send(scanCommand);
    let entries = (result.Items || []) as GenerationQueueEntry[];

    // Sort by timestamp descending (newest first)
    entries = entries.sort((a, b) => b.timestamp - a.timestamp);

    return NextResponse.json({
      success: true,
      entries,
      count: entries.length,
    });
  } catch (error) {
    console.error("Error fetching pipeline history:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch pipeline history",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
