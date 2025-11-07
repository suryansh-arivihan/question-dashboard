import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { fixLatexDelimiters, quickFixLatexDelimiters } from "@/lib/latex-utils";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { text, mode = 'ai' } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: "Text is required" },
        { status: 400 }
      );
    }

    let fixedText: string;

    if (mode === 'quick') {
      // Use quick pattern-based fix
      fixedText = quickFixLatexDelimiters(text);
    } else {
      // Use AI-powered fix
      fixedText = await fixLatexDelimiters(text);
    }

    return NextResponse.json({
      success: true,
      fixedText,
      mode,
    });
  } catch (error) {
    console.error("[LaTeX Fix API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fix LaTeX",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
