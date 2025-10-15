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
    const status = searchParams.get("status") || "all"; // all, PENDING, or VERIFIED
    const level = searchParams.get("level"); // 1, 2, or 3
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "7");

    if (!subject || !chapter || !topic) {
      return NextResponse.json(
        { error: "Subject, chapter, and topic parameters are required" },
        { status: 400 }
      );
    }

    // Build filter expression
    let filterExpression = "subject = :subject AND chapter_name = :chapter AND identified_topic = :topic";
    let filterExpressionPending = "subject = :subject AND chapter_name = :chapter AND identified_topic = :topic AND (attribute_not_exists(#status) OR #status <> :verifiedStatus)";
    const expressionAttributeValues: Record<string, any> = {
      ":subject": subject.toLowerCase(),
      ":chapter": chapter.toLowerCase(),
      ":topic": topic.toLowerCase(),
      ":verifiedStatus": "VERIFIED",
    };
    const expressionAttributeNames = {
      "#status": "status",
    };

    console.log("[Questions API] Searching for:", {
      subject: subject.toLowerCase(),
      chapter: chapter.toLowerCase(),
      topic: topic.toLowerCase(),
      topicCharCodes: Array.from(topic.toLowerCase()).map(c => `${c}(${c.charCodeAt(0)})`).join(' '),
      status,
    });

    // Add level filter if specified
    if (level) {
      filterExpression += " AND difficulty_level = :level";
      filterExpressionPending += " AND difficulty_level = :level";
      expressionAttributeValues[":level"] = parseInt(level);
    }

    // Helper function to scan all pages from a table
    const scanAllPages = async (tableName: string, useStatusFilter: boolean = false) => {
      let allItems: any[] = [];
      let lastEvaluatedKey: Record<string, any> | undefined = undefined;

      const scanParams: any = {
        TableName: tableName,
        FilterExpression: useStatusFilter ? filterExpressionPending : filterExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ExclusiveStartKey: undefined,
      };

      // Add ExpressionAttributeNames only for pending table (when status filter is needed)
      if (useStatusFilter) {
        scanParams.ExpressionAttributeNames = expressionAttributeNames;
      }

      do {
        scanParams.ExclusiveStartKey = lastEvaluatedKey;
        const command: ScanCommand = new ScanCommand(scanParams);

        const response = await docClient.send(command);
        allItems = allItems.concat(response.Items || []);
        lastEvaluatedKey = response.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      return allItems;
    };

    let allQuestions: any[] = [];

    if (status === "all") {
      // Fetch from both tables in parallel with full pagination
      // For pending table, filter out questions with status=VERIFIED
      const [pendingItems, verifiedItems] = await Promise.all([
        scanAllPages(TABLES.QUESTIONS_PENDING, true), // useStatusFilter=true
        scanAllPages(TABLES.QUESTIONS_VERIFIED, false),
      ]);

      console.log("[Questions API] Results:", {
        pending: pendingItems.length,
        verified: verifiedItems.length,
        tablePending: TABLES.QUESTIONS_PENDING,
        tableVerified: TABLES.QUESTIONS_VERIFIED,
      });

      allQuestions = [
        ...pendingItems,
        ...verifiedItems,
      ];
    } else {
      // Fetch from specific table based on status with full pagination
      const tableName = status === "VERIFIED"
        ? TABLES.QUESTIONS_VERIFIED
        : TABLES.QUESTIONS_PENDING;

      // For pending table, filter out questions with status=VERIFIED
      const useStatusFilter = status === "PENDING";
      allQuestions = await scanAllPages(tableName, useStatusFilter);
    }

    // Pagination
    const totalCount = allQuestions.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedQuestions = allQuestions.slice(startIndex, endIndex);

    console.log(`[Questions API] Page ${page}/${totalPages}: ${paginatedQuestions.length} of ${totalCount} questions for ${subject}/${chapter}/${topic} (status: ${status}, level: ${level || 'all'})`);

    return NextResponse.json({
      questions: paginatedQuestions,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      }
    });
  } catch (error) {
    console.error("[Questions API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch questions",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
