import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ queueId: string }> }
) {
  try {
    // Verify user is authenticated
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { queueId } = await params;

    if (!queueId) {
      return NextResponse.json(
        { error: "Missing queueId parameter" },
        { status: 400 }
      );
    }

    // Call the pipeline queue cancellation endpoint
    const pipelineUrl = process.env.PIPELINE_ENDPOINT_URL || "http://localhost:8000";
    const cancelEndpoint = `${pipelineUrl}/queue/${queueId}/cancel`;

    console.log("[Queue Cancel] Cancelling queue ID:", queueId);

    const response = await fetch(cancelEndpoint, {
      method: "DELETE",
      headers: {
        "accept": "application/json",
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("[Queue Cancel] Failed to cancel:", errorData);

      if (response.status === 404) {
        return NextResponse.json(
          { error: "Queue entry not found" },
          { status: 404 }
        );
      }

      if (response.status === 400) {
        return NextResponse.json(
          { error: errorData.detail || "Cannot cancel this queue entry" },
          { status: 400 }
        );
      }

      throw new Error(errorData.detail || "Failed to cancel queue entry");
    }

    const cancelData = await response.json();
    console.log("[Queue Cancel] Successfully cancelled:", cancelData);

    return NextResponse.json(cancelData, { status: 200 });
  } catch (error) {
    console.error("[Queue Cancel] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to cancel queue entry",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
