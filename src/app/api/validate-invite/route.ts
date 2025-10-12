import { NextRequest, NextResponse } from "next/server";
import { validateInviteCode } from "@/lib/queries";
import { InviteCodeRequest, InviteCodeResponse } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body: InviteCodeRequest = await request.json();
    const { inviteCode } = body;

    if (!inviteCode) {
      return NextResponse.json(
        { error: "Invite code is required" },
        { status: 400 }
      );
    }

    const valid = validateInviteCode(inviteCode);

    const response: InviteCodeResponse = {
      valid,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error validating invite code:", error);
    return NextResponse.json(
      { error: "Failed to validate invite code" },
      { status: 500 }
    );
  }
}
