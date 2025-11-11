import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { PutCommand, DeleteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "@/lib/dynamodb";
import { clearCache } from "@/lib/questions-cache";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { primaryKey, questionId } = body;

    if (!primaryKey || !questionId) {
      return NextResponse.json(
        { error: "Primary key and question ID are required" },
        { status: 400 }
      );
    }

    // 1. Get the question from PENDING table
    const getCommand = new GetCommand({
      TableName: TABLES.QUESTIONS_PENDING,
      Key: {
        PrimaryKey: primaryKey,
        question_id: questionId,
      },
    });

    const getResponse = await docClient.send(getCommand);

    if (!getResponse.Item) {
      return NextResponse.json(
        { error: "Question not found in pending table" },
        { status: 404 }
      );
    }

    const question = getResponse.Item;

    // 2. Update status to VERIFIED and add to VERIFIED table
    const verifiedQuestion = {
      ...question,
      status: "VERIFIED",
      verified_at: new Date().toISOString(),
      verified_by: userId,
    };

    const putCommand = new PutCommand({
      TableName: TABLES.QUESTIONS_VERIFIED,
      Item: verifiedQuestion,
    });

    await docClient.send(putCommand);

    // 3. Delete from PENDING table
    const deleteCommand = new DeleteCommand({
      TableName: TABLES.QUESTIONS_PENDING,
      Key: {
        PrimaryKey: primaryKey,
        question_id: questionId,
      },
    });

    await docClient.send(deleteCommand);

    // Clear cache for this topic since counts have changed
    clearCache(question.subject, question.chapter_name, question.identified_topic);

    console.log(`[Verify API] Question ${questionId} moved to verified table and cache cleared`);

    return NextResponse.json({
      success: true,
      message: "Question verified successfully",
    });
  } catch (error) {
    console.error("[Verify API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to verify question",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
