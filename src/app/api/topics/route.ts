import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "@/lib/dynamodb";

export const dynamic = "force-dynamic";

interface TopicWithStats {
  name: string;
  display_name: string;
  topic_id: string;
  verified: number;
  pending: number;
  in_progress: number;
  total: number;
  verifiedLevel1?: number;
  verifiedLevel2?: number;
  verifiedLevel3?: number;
  verifiedLevel4?: number;
  verifiedLevel5?: number;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    console.log("[Topics API] Request started");

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
        { error: "Both subject and chapter parameters are required" },
        { status: 400 }
      );
    }

    console.log("[Topics API] Fetching topics for:", { subject, chapter });

    // Get all topics for this chapter from mappings
    // The mappings table contains up-to-date counts maintained by Lambda
    const mappingsCommand = new ScanCommand({
      TableName: TABLES.MAPPINGS,
      FilterExpression: "exam = :exam AND subject = :subject AND chapter = :chapter",
      ExpressionAttributeValues: {
        ":exam": "neet",
        ":subject": subject.toLowerCase(),
        ":chapter": chapter.toLowerCase(),
      },
    });

    const mappingsResponse = await docClient.send(mappingsCommand);
    const mappings = mappingsResponse.Items || [];
    console.log("[Topics API] Found", mappings.length, "topics in mappings");

    if (mappings.length === 0) {
      return NextResponse.json({ topics: [] });
    }

    // Build the response using the counts from the mapping table
    // These are kept up-to-date by a Lambda function
    const topics: TopicWithStats[] = mappings.map((mapping: any) => {
      // Sum up all unverified levels to get total pending count
      const unverifiedTotal = (mapping.UnverifiedLevel1 || 0) +
                             (mapping.UnverifiedLevel2 || 0) +
                             (mapping.UnverifiedLevel3 || 0) +
                             (mapping.UnverifiedLevel4 || 0) +
                             (mapping.UnverifiedLevel5 || 0);

      // Sum up all verified levels to get total verified count
      const verifiedTotal = (mapping.VerifiedLevel1 || 0) +
                           (mapping.VerifiedLevel2 || 0) +
                           (mapping.VerifiedLevel3 || 0) +
                           (mapping.VerifiedLevel4 || 0) +
                           (mapping.VerifiedLevel5 || 0);

      return {
        name: mapping.topic,
        display_name: mapping.topic_display_name,
        topic_id: mapping.topic_id,
        verified: verifiedTotal,
        pending: unverifiedTotal,
        in_progress: 0, // Not tracked separately in mappings
        total: verifiedTotal + unverifiedTotal,
        verifiedLevel1: mapping.VerifiedLevel1 || 0,
        verifiedLevel2: mapping.VerifiedLevel2 || 0,
        verifiedLevel3: mapping.VerifiedLevel3 || 0,
        verifiedLevel4: mapping.VerifiedLevel4 || 0,
        verifiedLevel5: mapping.VerifiedLevel5 || 0,
      };
    });

    console.log("[Topics API] Processed", topics.length, "topics in", Date.now() - startTime, "ms");

    return NextResponse.json({ topics });
  } catch (error) {
    console.error("[Topics API] Error after", Date.now() - startTime, "ms:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch topics",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
