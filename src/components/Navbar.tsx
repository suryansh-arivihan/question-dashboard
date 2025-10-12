"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { UserButton, useUser } from "@clerk/nextjs";

export function Navbar() {
  const { theme, setTheme } = useTheme();
  const { user } = useUser();
  const [mounted, setMounted] = useState(false);

  // useEffect only runs on the client, so now we can safely show the UI
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <nav className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2">
              <Image
                src="/arivihan.jpeg"
                alt="Arivihan Logo"
                width={32}
                height={32}
                className="rounded-md"
              />
              <span className="text-lg font-semibold">Question Dashboard</span>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <span className="text-sm font-medium">{user.fullName || user.firstName}</span>
            )}
            <UserButton />
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image
              src="/arivihan.jpeg"
              alt="Arivihan Logo"
              width={32}
              height={32}
              className="rounded-md"
            />
            <span className="text-lg font-semibold">Question Dashboard</span>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          {/* Theme toggle - temporarily hidden */}
          {/* <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            aria-label="Toggle theme"
          >
            {theme === "light" ? (
              <Moon className="h-5 w-5" />
            ) : (
              <Sun className="h-5 w-5" />
            )}
          </Button> */}
          {user && (
            <span className="text-sm font-medium">{user.fullName || user.firstName}</span>
          )}
          <UserButton />
        </div>
      </div>
    </nav>
  );
}
