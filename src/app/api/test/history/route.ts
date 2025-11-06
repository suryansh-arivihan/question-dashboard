import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "@/lib/dynamodb";
import { TestGenerationQueueEntry, TestHistoryResponse } from "@/types";
import { generateDownloadUrl } from "@/lib/s3";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
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
        { error: "Missing required parameters: subject and chapter" },
        { status: 400 }
      );
    }

    // Query DynamoDB using GSI
    const subjectChapter = `${subject}#${chapter}`;
    const queryCommand = new QueryCommand({
      TableName: TABLES.TEST_GENERATION_QUEUE,
      IndexName: "subject-chapter-index",
      KeyConditionExpression: "subject_chapter = :subjectChapter",
      ExpressionAttributeValues: {
        ":subjectChapter": subjectChapter,
      },
      ScanIndexForward: false, // Sort descending (newest first)
    });

    const result = await docClient.send(queryCommand);
    let entries = (result.Items || []) as TestGenerationQueueEntry[];

    // Generate fresh pre-signed URLs for completed tests
    entries = await Promise.all(
      entries.map(async (entry) => {
        if (entry.status === "COMPLETED" && entry.s3_file_path) {
          try {
            const downloadUrl = await generateDownloadUrl(entry.s3_file_path);
            return { ...entry, s3_file_url: downloadUrl };
          } catch (error) {
            console.error("Error generating download URL:", error);
            return entry;
          }
        }
        return entry;
      })
    );

    const response: TestHistoryResponse = {
      success: true,
      entries,
      count: entries.length,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching test history:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch test history",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}