import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { fixLatexDelimiters } from "@/lib/latex-utils";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { text } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: "Text is required" },
        { status: 400 }
      );
    }

    // Use AI-powered fix
    const fixedText = await fixLatexDelimiters(text);

    return NextResponse.json({
      success: true,
      fixedText,
    });
  } catch (error) {
    console.error("[LaTeX AI Fix API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fix LaTeX with AI",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
