import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAggregatedStats } from "@/lib/queries";
import { StatsResponse } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  try {
    console.log("[Stats API] Request started");

    // Verify user is authenticated
    const { userId } = await auth();
    console.log("[Stats API] Auth check:", userId ? "authenticated" : "not authenticated");

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const subject = searchParams.get("subject") || undefined;
    const chapter = searchParams.get("chapter") || undefined;
    console.log("[Stats API] Params:", { subject, chapter });

    // Validate chapter requires subject
    if (chapter && !subject) {
      return NextResponse.json(
        { error: "Chapter filter requires subject parameter" },
        { status: 400 }
      );
    }

    // Fetch aggregated stats with timeout
    console.log("[Stats API] Fetching aggregated stats...");
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Stats query timeout after 30s")), 30000)
    );

    const statsPromise = getAggregatedStats(subject, chapter);
    const subjects = await Promise.race([statsPromise, timeoutPromise]) as any;

    console.log("[Stats API] Stats fetched successfully");
    console.log("[Stats API] Found subjects:", subjects.length);
    console.log("[Stats API] Duration:", Date.now() - startTime, "ms");

    const response: StatsResponse = {
      subjects,
    };

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "s-maxage=60, stale-while-revalidate=30",
      },
    });
  } catch (error) {
    console.error("[Stats API] Error after", Date.now() - startTime, "ms:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch stats",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
