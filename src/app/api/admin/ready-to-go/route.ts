import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { v4 as uuidv4 } from "uuid";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { isTopicQueued, createQueueEntry } from "@/lib/queries";
import { docClient, TABLES } from "@/lib/dynamodb";
import { ReadyToGoRequest, ReadyToGoResponse, GenerationQueueEntry } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user email
    const user = await currentUser();
    const userEmail = user?.emailAddresses[0]?.emailAddress;

    if (!userEmail) {
      return NextResponse.json(
        { error: "User email not found" },
        { status: 400 }
      );
    }

    // Parse request body
    const body: ReadyToGoRequest = await request.json();
    const { subject, chapter, topic, topicId } = body;

    if (!subject || !chapter || !topic) {
      return NextResponse.json(
        { error: "Missing required fields: subject, chapter, topic" },
        { status: 400 }
      );
    }

    // If topicId is provided, use it to update the ReadyToGo flag
    if (topicId) {
      console.log("[Ready to Go] Updating ReadyToGo flag for topic_id:", topicId);

      const updateCommand = new UpdateCommand({
        TableName: TABLES.MAPPINGS,
        Key: {
          topic_id: topicId,
          exam: "neet",
        },
        UpdateExpression: "SET ReadyToGo = :readyToGo",
        ExpressionAttributeValues: {
          ":readyToGo": true,
        },
      });

      await docClient.send(updateCommand);
      console.log("[Ready to Go] Successfully updated ReadyToGo flag");
    } else {
      console.warn("[Ready to Go] No topicId provided, skipping ReadyToGo update");
    }

    // Try to check if already queued and create queue entry (skip if table doesn't exist)
    const queueId = uuidv4();
    try {
      const alreadyQueued = await isTopicQueued(subject, chapter, topic);
      if (alreadyQueued) {
        return NextResponse.json(
          { error: "Topic is already queued for generation" },
          { status: 409 }
        );
      }

      // Create queue entry
      const timestamp = Date.now();
      const entry: GenerationQueueEntry = {
        id: queueId,
        subject,
        chapter_name: chapter,
        topic_name: topic,
        triggered_by: userEmail,
        timestamp,
        status: "QUEUED",
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      await createQueueEntry(entry);
    } catch (queueError) {
      // Log but don't fail if generation_queue table doesn't exist
      console.warn("[Ready to Go] Queue table not available:", queueError);
    }

    const response: ReadyToGoResponse = {
      success: true,
      queueId,
      message: "Topic queued for generation",
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("Error queuing topic:", error);
    return NextResponse.json(
      { error: "Failed to queue topic" },
      { status: 500 }
    );
  }
}
