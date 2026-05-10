// frontend/app/_components/AuthNav.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { subscribeAuth, type AuthUser } from "@/lib/authClient";
import { fullLogout } from "@/lib/logout";

function initialsFromLabel(label: string) {
  const parts = label.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "U";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
  return (a + b).toUpperCase();
}

export default function AuthNav({ initialAuthed }: { initialAuthed: boolean }) {
  const router = useRouter();

  // null means "firebase not loaded yet"
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checked, setChecked] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const unsub = subscribeAuth((u) => {
      setUser(u);
      setChecked(true);
    });
    return () => unsub();
  }, []);

  const label = useMemo(() => {
    if (!user) return "";
    return user.displayName || user.email || "Account";
  }, [user]);

  async function handleLogout() {
    setOpen(false);
    await fullLogout();
    router.push("/");
    router.refresh();
  }

  // ✅ 1) If we have a real Firebase user, ALWAYS show the account menu.
  if (user) {
    return (
      <div className="relative flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="btn btn-outline py-2 px-3 flex items-center gap-2"
        >
          <span className="h-7 w-7 rounded-full bg-primary text-[color:var(--primary-foreground)] flex items-center justify-center text-xs font-extrabold">
            {initialsFromLabel(label)}
          </span>
          <span className="hidden sm:inline text-sm font-medium">{label}</span>
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-2 w-56 card p-2">
            <div className="px-2 py-2">
              <div className="text-sm font-semibold">
                {user.displayName || "Account"}
              </div>
              <div className="text-xs text-muted">{user.email}</div>
            </div>
            <div className="h-px bg-border my-2" />
            <Link
              className="btn btn-outline w-full justify-start"
              href="/library"
              onClick={() => setOpen(false)}
            >
              Library
            </Link>
            <Link
              className="btn btn-outline w-full justify-start mt-2"
              href="/job"
              onClick={() => setOpen(false)}
            >
              Jobs
            </Link>
            <button
              className="btn btn-outline w-full justify-start mt-2"
              onClick={handleLogout}
            >
              Log out
            </button>
          </div>
        )}
      </div>
    );
  }

  // ✅ 2) If Firebase has finished checking and there is NO user,
  // show Login / Sign up (regardless of initialAuthed).
  if (checked && !user) {
    return (
      <div className="flex items-center gap-2">
        <Link href="/login" className="btn btn-outline py-2 px-3">
          Login
        </Link>
        <Link href="/signup" className="btn btn-primary py-2 px-3">
          Sign up
        </Link>
      </div>
    );
  }

  // ✅ 3) While Firebase is still loading:
  // - If server cookie says authed: show placeholder (prevents flash)
  // - Else: show Login/Signup (so logged-out users don't see Account)
  if (initialAuthed) {
    return (
      <div className="flex items-center gap-2">
        <div className="btn btn-outline py-2 px-3 flex items-center gap-2">
          <span className="h-7 w-7 rounded-full bg-primary text-[color:var(--primary-foreground)] flex items-center justify-center text-xs font-extrabold">
            A
          </span>
          <span className="hidden sm:inline text-sm font-medium">Account</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link href="/login" className="btn btn-outline py-2 px-3">
        Login
      </Link>
      <Link href="/signup" className="btn btn-primary py-2 px-3">
        Sign up
      </Link>
    </div>
  );
}

