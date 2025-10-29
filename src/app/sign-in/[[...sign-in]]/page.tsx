"use client";

import { SignIn } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";

export default function SignInPage() {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (isSignedIn) {
      const redirectUrl = searchParams.get("redirect_url") || "/dashboard";
      router.push(redirectUrl);
    }
  }, [isSignedIn, router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <SignIn
        fallbackRedirectUrl="/dashboard"
        signUpUrl="/sign-up"
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
      />
    </div>
  );
}
