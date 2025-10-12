import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { v4 as uuidv4 } from "uuid";
import { isAdmin, isTopicQueued, createQueueEntry } from "@/lib/queries";
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

    // Check if user is admin
    if (!isAdmin(userEmail)) {
      return NextResponse.json(
        { error: "Forbidden: Admin access required" },
        { status: 403 }
      );
    }

    // Parse request body
    const body: ReadyToGoRequest = await request.json();
    const { subject, chapter, topic } = body;

    if (!subject || !chapter || !topic) {
      return NextResponse.json(
        { error: "Missing required fields: subject, chapter, topic" },
        { status: 400 }
      );
    }

    // Check if already queued
    const alreadyQueued = await isTopicQueued(subject, chapter, topic);
    if (alreadyQueued) {
      return NextResponse.json(
        { error: "Topic is already queued for generation" },
        { status: 409 }
      );
    }

    // Create queue entry
    const queueId = uuidv4();
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
