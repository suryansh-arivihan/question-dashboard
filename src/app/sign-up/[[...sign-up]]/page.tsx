"use client";

import { SignUp } from "@clerk/nextjs";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function SignUpPage() {
  const [inviteCode, setInviteCode] = useState("");
  const [isValidated, setIsValidated] = useState(false);
  const [error, setError] = useState("");
  const [isValidating, setIsValidating] = useState(false);

  const validateInviteCode = async () => {
    if (!inviteCode.trim()) {
      setError("Please enter an invite code");
      return;
    }

    setIsValidating(true);
    setError("");

    try {
      const response = await fetch("/api/validate-invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inviteCode }),
      });

      const data = await response.json();

      if (data.valid) {
        setIsValidated(true);
      } else {
        setError("Invalid invite code");
      }
    } catch (err) {
      setError("Failed to validate invite code");
    } finally {
      setIsValidating(false);
    }
  };

  if (!isValidated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-full max-w-md space-y-6 rounded-lg border border-border bg-card p-8 shadow-lg">
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-bold text-foreground">Admin Dashboard</h1>
            <p className="text-muted-foreground">Enter your invite code to continue</p>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="inviteCode" className="text-sm font-medium text-foreground">
                Invite Code
              </label>
              <Input
                id="inviteCode"
                type="text"
                placeholder="ADMIN2025"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && validateInviteCode()}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <Button
              onClick={validateInviteCode}
              disabled={isValidating}
              className="w-full"
            >
              {isValidating ? "Validating..." : "Continue"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <SignUp
        appearance={{
          baseTheme: undefined,
          variables: {
            colorBackground: "hsl(var(--background))",
            colorText: "hsl(var(--foreground))",
            colorPrimary: "hsl(var(--primary))",
            colorInputBackground: "hsl(var(--background))",
            colorInputText: "hsl(var(--foreground))",
          },
          elements: {
            rootBox: "mx-auto",
            card: "shadow-lg border border-border bg-card",
            headerTitle: "text-foreground",
            headerSubtitle: "text-muted-foreground",
            socialButtonsBlockButton: "border-border hover:bg-muted",
            formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90",
            formFieldInput: "border-input bg-background",
            footerActionLink: "text-primary hover:text-primary/90",
          },
        }}
        unsafeMetadata={{
          inviteCode,
        }}
      />
    </div>
  );
}
