import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "@/lib/dynamodb";
import { v4 as uuidv4 } from "uuid";
import { TestGenerationRequest, TestGenerationResponse } from "@/types";

export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user email
    const user = await currentUser();
    const userEmail = user?.emailAddresses[0]?.emailAddress || userId;

    // Parse request body
    const body: TestGenerationRequest = await request.json();
    const { subject, chapter, chapterDisplayName, numTests, testData } = body;

    // Filter out empty or whitespace-only topic keys from testData
    const filteredTestData = testData
      ? Object.fromEntries(
          Object.entries(testData).filter(([key]) => key.trim() !== "")
        )
      : testData;

    // Validate required fields
    if (!subject || !chapter || !chapterDisplayName || !numTests || !testData) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Generate unique queue ID
    const queueId = uuidv4();
    const timestamp = Date.now();
    const subjectChapter = `${subject}#${chapter}`;

    // Create queue entry
    const queueEntry = {
      id: queueId,
      subject,
      chapter_name: chapter,
      chapter_display_name: chapterDisplayName,
      status: "QUEUED" as const,
      triggered_by: userEmail,
      createdAt: timestamp,
      updatedAt: timestamp,
      numTests,
      testData: filteredTestData,
      subject_chapter: subjectChapter,
    };

    // Save to DynamoDB
    const putCommand = new PutCommand({
      TableName: TABLES.TEST_GENERATION_QUEUE,
      Item: queueEntry,
    });

    await docClient.send(putCommand);

    // Trigger background processing (fire and forget)
    // We'll call the process-queue endpoint asynchronously
    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const host = request.headers.get('host') || 'localhost:3000';
    const baseUrl = `${protocol}://${host}`;

    fetch(`${baseUrl}/api/test/process-queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queueId }),
    }).catch((err) => {
      console.error("Error triggering background processing:", err);
    });

    const response: TestGenerationResponse = {
      success: true,
      queueId,
      message: "Test generation queued successfully",
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error enqueueing test generation:", error);
    return NextResponse.json(
      {
        error: "Failed to enqueue test generation",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}