"use client";

import Link from "next/link";
import Image from "next/image";
import { UserButton, useUser } from "@clerk/nextjs";

export function Navbar() {
  const { user } = useUser();

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
