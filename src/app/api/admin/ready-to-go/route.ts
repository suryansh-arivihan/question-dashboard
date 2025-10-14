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

    if (!topicId) {
      return NextResponse.json(
        { error: "Missing topicId - required for tracking pipeline history" },
        { status: 400 }
      );
    }

    // Generate unique queue ID
    const queueId = uuidv4();

    // Check if already queued and create queue entry
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
        topic_id: topicId,
        triggered_by: userEmail,
        timestamp,
        status: "QUEUED",
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      await createQueueEntry(entry);
      console.log("[Ready to Go] Created queue entry with id:", queueId);
    } catch (queueError) {
      console.error("[Ready to Go] Failed to create queue entry:", queueError);
      return NextResponse.json(
        { error: "Failed to create queue entry" },
        { status: 500 }
      );
    }

    // Call the generate-questions-pipeline endpoint
    const pipelineUrl = process.env.PIPELINE_ENDPOINT_URL || "http://localhost:8000";
    const pipelineEndpoint = `${pipelineUrl}/generate-questions-pipeline`;

    try {
      console.log("[Ready to Go] Calling pipeline endpoint:", pipelineEndpoint);

      const pipelineResponse = await fetch(pipelineEndpoint, {
        method: "POST",
        headers: {
          "accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: queueId,
          identified_topic: topic,
          chapter_name: chapter,
          subject: subject.toLowerCase(),
        }),
      });

      if (!pipelineResponse.ok) {
        const errorData = await pipelineResponse.json().catch(() => ({}));
        console.error("[Ready to Go] Pipeline request failed:", errorData);
        throw new Error(errorData.detail || "Pipeline request failed");
      }

      const pipelineData = await pipelineResponse.json();
      console.log("[Ready to Go] Pipeline triggered successfully:", pipelineData);
    } catch (pipelineError) {
      console.error("[Ready to Go] Error calling pipeline:", pipelineError);
      return NextResponse.json(
        {
          error: "Failed to trigger pipeline",
          details: pipelineError instanceof Error ? pipelineError.message : "Unknown error"
        },
        { status: 500 }
      );
    }

    const response: ReadyToGoResponse = {
      success: true,
      queueId,
      message: "Topic queued for generation and pipeline triggered",
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
