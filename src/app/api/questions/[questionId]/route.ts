import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "@/lib/dynamodb";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ questionId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { questionId } = await params;

    if (!questionId) {
      return NextResponse.json(
        { error: "Question ID is required" },
        { status: 400 }
      );
    }

    // Try to find the question by scanning both tables with question_id filter
    const scanWithQuestionId = async (tableName: string) => {
      let lastEvaluatedKey: Record<string, any> | undefined = undefined;

      // Scan until we find the question or exhaust all items
      do {
        const command: ScanCommand = new ScanCommand({
          TableName: tableName,
          FilterExpression: "question_id = :questionId",
          ExpressionAttributeValues: {
            ":questionId": questionId,
          },
          ExclusiveStartKey: lastEvaluatedKey,
        });

        const response = await docClient.send(command);
        if (response.Items && response.Items.length > 0) {
          return response.Items[0]; // Return immediately when found
        }
        lastEvaluatedKey = response.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      return undefined;
    };

    // Try PENDING table first, then VERIFIED
    let question = await scanWithQuestionId(TABLES.QUESTIONS_PENDING);

    if (!question) {
      question = await scanWithQuestionId(TABLES.QUESTIONS_VERIFIED);
    }

    if (!question) {
      return NextResponse.json(
        { error: "Question not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ question });
  } catch (error) {
    console.error("[Question By ID API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch question",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
