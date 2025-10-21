import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { queueId: string } }
) {
  try {
    // Verify user is authenticated
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { queueId } = params;

    if (!queueId) {
      return NextResponse.json(
        { error: "Missing queueId parameter" },
        { status: 400 }
      );
    }

    // Call the pipeline queue status endpoint
    const pipelineUrl = process.env.PIPELINE_ENDPOINT_URL || "http://localhost:8000";
    const statusEndpoint = `${pipelineUrl}/queue-status/${queueId}`;

    console.log("[Queue Status] Checking status for queue ID:", queueId);

    const response = await fetch(statusEndpoint, {
      method: "GET",
      headers: {
        "accept": "application/json",
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("[Queue Status] Failed to fetch status:", errorData);

      if (response.status === 404) {
        return NextResponse.json(
          { error: "Queue entry not found" },
          { status: 404 }
        );
      }

      throw new Error(errorData.detail || "Failed to fetch queue status");
    }

    const statusData = await response.json();
    console.log("[Queue Status] Status retrieved:", statusData);

    return NextResponse.json(statusData, { status: 200 });
  } catch (error) {
    console.error("[Queue Status] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch queue status",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
