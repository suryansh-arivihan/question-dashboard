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

    console.log("\n[DEBUG] Searching for:");
    console.log("  subject:", subject.toLowerCase());
    console.log("  chapter:", chapter.toLowerCase());
    console.log("  topic:", topic.toLowerCase());

    // First, let's get a sample of ALL items from the pending table (limited to 10)
    const allItemsResponse = await docClient.send(
      new ScanCommand({
        TableName: TABLES.QUESTIONS_PENDING,
        Limit: 20,
      })
    );

    console.log("\n[DEBUG] Sample items from NEETAdaptiveQuestionGeneratorData:");
    console.log(`Total items scanned: ${allItemsResponse.Items?.length || 0}`);

    // Show ALL fields from first item to understand structure
    if (allItemsResponse.Items && allItemsResponse.Items.length > 0) {
      console.log("\n[DEBUG] Complete structure of first item:");
      console.log(JSON.stringify(allItemsResponse.Items[0], null, 2));
    }

    const sampleItems = (allItemsResponse.Items || []).map((item) => ({
      question_id: item.question_id,
      subject: item.subject,
      chapter_name: item.chapter_name,
      identified_topic: item.identified_topic,
      difficulty_level: item.difficulty_level,
      status: item.status, // Check if this field exists
      hasStatus: item.status !== undefined,
    }));
    console.log("\n[DEBUG] Simplified sample items:");
    console.log(JSON.stringify(sampleItems, null, 2));

    // Now try to find matching items with the filter
    const filterExpression = "subject = :subject AND chapter_name = :chapter AND identified_topic = :topic";
    const expressionAttributeValues = {
      ":subject": subject.toLowerCase(),
      ":chapter": chapter.toLowerCase(),
      ":topic": topic.toLowerCase(),
    };

    const filteredResponse = await docClient.send(
      new ScanCommand({
        TableName: TABLES.QUESTIONS_PENDING,
        FilterExpression: filterExpression,
        ExpressionAttributeValues: expressionAttributeValues,
      })
    );

    console.log(`\n[DEBUG] Found ${filteredResponse.Items?.length || 0} matching items with exact filter`);

    // Try partial matches to see what's close
    const subjectOnlyResponse = await docClient.send(
      new ScanCommand({
        TableName: TABLES.QUESTIONS_PENDING,
        FilterExpression: "subject = :subject",
        ExpressionAttributeValues: {
          ":subject": subject.toLowerCase(),
        },
        Limit: 50,
      })
    );

    const subjectMatches = (subjectOnlyResponse.Items || []).map((item) => ({
      subject: item.subject,
      chapter_name: item.chapter_name,
      identified_topic: item.identified_topic,
    }));

    // Get unique combinations
    const uniqueCombinations = Array.from(
      new Set(subjectMatches.map((item) => JSON.stringify(item)))
    ).map((str) => JSON.parse(str));

    console.log(`\n[DEBUG] Unique subject/chapter/topic combinations for subject="${subject.toLowerCase()}":`);
    console.log(JSON.stringify(uniqueCombinations, null, 2));

    return NextResponse.json({
      searchedFor: {
        subject: subject.toLowerCase(),
        chapter: chapter.toLowerCase(),
        topic: topic.toLowerCase(),
      },
      exactMatches: filteredResponse.Items?.length || 0,
      sampleItems: sampleItems.slice(0, 10),
      subjectMatches: uniqueCombinations.slice(0, 20),
      message: "Check server console logs for detailed output",
    });
  } catch (error) {
    console.error("[Debug API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to debug questions",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
