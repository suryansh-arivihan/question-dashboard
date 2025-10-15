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

    // Build filter expressions
    let filterExpression = "subject = :subject AND chapter_name = :chapter AND identified_topic = :topic";
    // For pending table, exclude VERIFIED and DISCARDED questions
    let filterExpressionPending = "subject = :subject AND chapter_name = :chapter AND identified_topic = :topic AND (attribute_not_exists(#status) OR (#status <> :verifiedStatus AND #status <> :discardedStatus))";
    // For discarded questions only
    let filterExpressionDiscarded = "subject = :subject AND chapter_name = :chapter AND identified_topic = :topic AND #status = :discardedStatus";

    const baseAttributeValues: Record<string, any> = {
      ":subject": subject.toLowerCase(),
      ":chapter": chapter.toLowerCase(),
      ":topic": topic.toLowerCase(),
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
      filterExpressionDiscarded += " AND difficulty_level = :level";
      baseAttributeValues[":level"] = parseInt(level);
    }

    // Helper function to scan all pages from a table
    const scanAllPages = async (tableName: string, filterType: "default" | "pending" | "discarded" = "default") => {
      let allItems: any[] = [];
      let lastEvaluatedKey: Record<string, any> | undefined = undefined;

      // Create attribute values based on filter type
      let attrValues = baseAttributeValues;
      let filterExpr = filterExpression;
      let needsAttrNames = false;

      if (filterType === "pending") {
        attrValues = { ...baseAttributeValues, ":verifiedStatus": "VERIFIED", ":discardedStatus": "DISCARDED" };
        filterExpr = filterExpressionPending;
        needsAttrNames = true;
      } else if (filterType === "discarded") {
        attrValues = { ...baseAttributeValues, ":discardedStatus": "DISCARDED" };
        filterExpr = filterExpressionDiscarded;
        needsAttrNames = true;
      }

      const scanParams: any = {
        TableName: tableName,
        FilterExpression: filterExpr,
        ExpressionAttributeValues: attrValues,
        ExclusiveStartKey: undefined,
      };

      // Add ExpressionAttributeNames only when status filter is used
      if (needsAttrNames) {
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
      // For pending table, filter out VERIFIED and DISCARDED questions
      const [pendingItems, verifiedItems] = await Promise.all([
        scanAllPages(TABLES.QUESTIONS_PENDING, "pending"),
        scanAllPages(TABLES.QUESTIONS_VERIFIED, "default"),
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
    } else if (status === "VERIFIED") {
      // Fetch only verified questions
      allQuestions = await scanAllPages(TABLES.QUESTIONS_VERIFIED, "default");
    } else if (status === "DISCARDED") {
      // Fetch only discarded questions from pending table
      allQuestions = await scanAllPages(TABLES.QUESTIONS_PENDING, "discarded");
    } else {
      // PENDING - fetch from pending table, excluding VERIFIED and DISCARDED
      allQuestions = await scanAllPages(TABLES.QUESTIONS_PENDING, "pending");
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
